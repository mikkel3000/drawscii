import test from "node:test";
import assert from "node:assert/strict";
import { replaceCodeBlock, saveIfUnchanged } from "../src/model/CodeBlock";
import { Grid } from "../src/model/Grid";
import { gridFromText, gridToText } from "../src/model/Serializer";
import { ToolManager } from "../src/tools/ToolManager";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";

const pointer = (row = 0, col = 0) => ({
  row,
  col,
  startRow: row,
  startCol: col,
  isDragging: true,
  ctrlKey: false,
});

test("saving preserves surrounding notes, indentation, CRLF and tilde fences", () => {
  const original = "before\r\n  ~~~~asciiflow\r\n  old\r\n  ~~~~\r\nafter\r\n";
  const updated = replaceCodeBlock(original, 1, 3, "old\n", "new\nline");
  assert.equal(
    updated,
    "before\r\n  ~~~~asciiflow\r\n  new\r\n  line\r\n  ~~~~\r\nafter\r\n",
  );
  assert.equal(saveIfUnchanged(original, original, updated), updated);
  assert.throws(
    () => saveIfUnchanged(original + "change", original, updated),
    /note changed/,
  );
});

test("saving refuses stale source and invalid sections", () => {
  const note = "```asciiflow\nold\n```\nother text";
  assert.throws(() => replaceCodeBlock(note, 0, 2, "stale", "new"), /changed/);
  assert.throws(() => replaceCodeBlock(note, 0, 3, "old", "new"), /changed/);
  assert.throws(() => replaceCodeBlock(note, -1, 2, "old", "new"), /locate/);
});

test("saving a fence in a drawing cannot terminate its code block", () => {
  assert.equal(
    replaceCodeBlock("```asciiflow\nx\n```", 0, 2, "x", "```"),
    "````asciiflow\n```\n````",
  );
});

test("grid snapshots remain independent, including self-loading", () => {
  const grid = gridFromText("你好 x");
  const snapshot = grid.clone();
  grid.setCell(0, 0, "a");
  assert.equal(gridToText(snapshot), "你好 x");
  grid.loadFromGrid(snapshot);
  grid.loadFromGrid(grid);
  assert.equal(gridToText(grid), "你好 x");
  snapshot.clear();
  assert.equal(gridToText(grid), "你好 x");
});

test("typing, paste, delete and cut each undo and redo independently", () => {
  const grid = new Grid();
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("text");
  manager.handlePointerDown(pointer());
  manager.handlePointerUp(pointer());
  manager.edit((ctx) => manager.getTextTool().handleChar("a", ctx));
  manager.edit((ctx) => manager.getTextTool().pasteText("bc", ctx));
  assert.equal(gridToText(grid), "abc");
  manager.undo();
  assert.equal(gridToText(grid), "a");
  manager.redo();
  assert.equal(gridToText(grid), "abc");
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer());
  manager.handlePointerUp(pointer());
  manager.edit((ctx) => manager.getSelectTool().deleteSelection(ctx));
  assert.equal(gridToText(grid), " bc");
  manager.undo();
  assert.equal(gridToText(grid), "abc");
  manager.edit((ctx) => assert.equal(manager.getSelectTool().cut(ctx), "a"));
  assert.equal(gridToText(grid), " bc");
  manager.undo();
  assert.equal(gridToText(grid), "abc");
});

test("selection-only clicks and cursor movement do not discard redo", () => {
  const grid = new Grid();
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("freeform");
  manager.handlePointerDown(pointer());
  manager.handlePointerUp(pointer());
  manager.undo();
  manager.setActiveTool("text");
  manager.handlePointerDown(pointer());
  manager.handlePointerUp(pointer());
  manager.edit((ctx) => manager.getTextTool().handleKey("ArrowRight", ctx));
  manager.redo();
  assert.equal(gridToText(grid), "*");
});

test("a box drag is one undo step and preserves existing content", () => {
  const grid = gridFromText("existing");
  const manager = new ToolManager(grid, () => {});
  const start = pointer(2, 2);
  manager.handlePointerDown(start);
  manager.handlePointerMove({ ...start, row: 5, col: 5 });
  manager.handlePointerUp({ ...start, row: 4, col: 4, isDragging: false });
  assert.equal(grid.getCell(4, 4), "┘");
  assert.equal(grid.getCell(5, 5), "");
  manager.undo();
  assert.equal(gridToText(grid), "existing");
  manager.redo();
  assert.equal(grid.getCell(4, 4), "┘");
});

test("canvas batches redraws, restores font on resize, and cancels pending work", () => {
  const previous = globalThis.window;
  let callback: FrameRequestCallback | undefined;
  let scheduled = 0;
  let cancelled = 0;
  let draws = 0;
  const ctx = new Proxy(
    { font: "", textBaseline: "" },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        if (key === "clearRect")
          return () => {
            draws++;
          };
        return () => {};
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  globalThis.window = {
    devicePixelRatio: 2,
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      callback = fn;
      return ++scheduled;
    },
    cancelAnimationFrame: () => {
      cancelled++;
    },
  } as unknown as Window & typeof globalThis;
  try {
    const renderer = new CanvasRenderer(
      canvas,
      new Grid(),
      {
        cellWidth: 12,
        cellHeight: 18,
        fontSize: 14,
        fontFamily: "monospace",
        showGrid: true,
      },
      { background: "black", foreground: "white", grid: "gray" },
    );
    ctx.font = "10px sans-serif";
    renderer.resize(100, 100);
    assert.equal(ctx.font, "14px monospace");
    assert.equal(canvas.width, 200);
    renderer.render();
    renderer.render();
    renderer.render();
    assert.equal(scheduled, 1);
    callback!(0);
    assert.equal(draws, 1);
    renderer.render();
    renderer.dispose();
    assert.equal(cancelled, 1);
    renderer.render();
    assert.equal(scheduled, 2);
  } finally {
    globalThis.window = previous;
  }
});

import {
  drawPath,
  route,
  drawBox,
  recognizeShape,
  resizeShape,
  rasterLine,
  restyle,
  setArrowHeads,
  toggleHeadShape,
} from "../src/model/Drawing";
import { mergeCodeBlock } from "../src/model/CodeBlock";

test("box corners and line junctions join without corrupting the border", () => {
  const grid = new Grid();
  drawBox(grid, { startRow: 1, startCol: 1, endRow: 5, endCol: 9 });
  assert.equal(grid.getCell(1, 1), "┌");
  assert.equal(grid.getCell(1, 9), "┐");
  assert.equal(grid.getCell(5, 1), "└");
  assert.equal(grid.getCell(5, 9), "┘");
  drawPath(grid, route({ row: 3, col: 9 }, { row: 3, col: 15 }), true);
  assert.equal(grid.getCell(3, 9), "├");
  assert.equal(grid.getCell(3, 15), "►");
  drawPath(grid, route({ row: 1, col: 12 }, { row: 5, col: 12 }));
  assert.equal(grid.getCell(3, 12), "┼");
});

test("connector bend direction is selectable", () => {
  const a = { row: 1, col: 1 },
    b = { row: 4, col: 7 };
  assert.deepEqual(route(a, b)[1], { row: 1, col: 2 });
  assert.deepEqual(route(a, b, true)[1], { row: 2, col: 1 });
});

test("fast freehand and eraser drags fill intermediate cells in one undo step", () => {
  const grid = new Grid(),
    manager = new ToolManager(grid, () => {});
  manager.setActiveTool("freeform");
  manager.handlePointerDown(pointer(2, 2));
  manager.handlePointerUp({ ...pointer(2, 2), row: 2, col: 10 });
  for (let c = 2; c <= 10; c++) assert.equal(grid.getCell(2, c), "*");
  manager.setActiveTool("eraser");
  manager.setBrushSize(3);
  manager.handlePointerDown(pointer(2, 4));
  manager.handlePointerUp({ ...pointer(2, 4), col: 7 });
  for (let c = 3; c <= 8; c++) assert.equal(grid.getCell(2, c), "");
  manager.undo();
  for (let c = 2; c <= 10; c++) assert.equal(grid.getCell(2, c), "*");
});

test("grid grows and serializes sparsely beyond original bounds", () => {
  const grid = new Grid(2, 2);
  grid.setCell(50, 150, "X");
  assert.deepEqual(grid.getSize(), { rows: 51, cols: 151 });
  assert.equal(gridToText(grid), "\n".repeat(50) + " ".repeat(150) + "X");
  grid.setCell(-1, 4, "Y");
  assert.equal(grid.getCell(-1, 4), "");
});

test("multiline labels retain their start column and paste replaces spaces", () => {
  const grid = new Grid(),
    manager = new ToolManager(grid, () => {}),
    text = manager.getTextTool();
  manager.setActiveTool("text");
  manager.handlePointerDown(pointer(2, 5));
  manager.handlePointerUp(pointer(2, 5));
  manager.edit((ctx) => {
    text.handleChar("A", ctx);
    text.handleKey("Enter", ctx);
    text.handleChar("B", ctx);
  });
  assert.equal(grid.getCell(3, 5), "B");
  manager.handlePointerDown(pointer(2, 5));
  manager.handlePointerUp(pointer(2, 5));
  manager.edit((ctx) => text.pasteText(" 你\n好", ctx));
  assert.equal(grid.getCell(2, 5), "");
  assert.equal(grid.getCell(2, 6), "你");
  assert.deepEqual(text.getCursor(), { row: 3, col: 7 });
});

test("typing groups into one undo transaction", () => {
  const grid = new Grid(),
    manager = new ToolManager(grid, () => {});
  manager.setActiveTool("text");
  manager.handlePointerDown(pointer());
  manager.handlePointerUp(pointer());
  for (const ch of "hello")
    manager.edit((ctx) => manager.getTextTool().handleChar(ch, ctx), "typing");
  manager.undo();
  assert.equal(gridToText(grid), "");
  manager.redo();
  assert.equal(gridToText(grid), "hello");
});

test("selection nudge clamps at origin and paste has opaque spaces", () => {
  const grid = gridFromText("abc"),
    manager = new ToolManager(grid, () => {}),
    sel = manager.getSelectTool();
  sel.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 2 });
  manager.edit((ctx) => sel.nudge(0, -10, ctx));
  assert.equal(gridToText(grid), "abc");
  manager.edit((ctx) => sel.placeGrid(gridFromText(" X ", 1, 1), 0, 0, ctx));
  assert.equal(gridToText(grid), " X");
  manager.undo();
  assert.equal(gridToText(grid), "abc");
});

test("box resizing preserves labels and refuses to crop them", () => {
  const grid = new Grid(),
    r = { startRow: 2, startCol: 2, endRow: 7, endCol: 12 };
  drawBox(grid, r);
  grid.setCell(4, 10, "X");
  const shape = recognizeShape(grid, r)!;
  assert.equal(shape.kind, "box");
  assert.deepEqual(resizeShape(grid, shape, 2, { row: 5, col: 8 }), r);
  const next = resizeShape(grid, shape, 2, { row: 9, col: 15 });
  assert.equal(grid.getCell(9, 15), "┘");
  assert.equal(grid.getCell(4, 10), "X");
  assert.equal(grid.getCell(7, 12), "");
  assert.equal(recognizeShape(grid, next)?.kind, "box");
});

test("arrow endpoints can be recognized and moved", () => {
  const grid = new Grid();
  drawPath(grid, route({ row: 2, col: 2 }, { row: 5, col: 8 }), true);
  const shape = recognizeShape(grid, {
    startRow: 2,
    startCol: 2,
    endRow: 5,
    endCol: 8,
  });
  assert.equal(shape?.kind, "arrow");
  resizeShape(grid, shape!, 1, { row: 7, col: 10 });
  assert.equal(grid.getCell(7, 10), "▼");
});

test("save merges note edits above and below the diagram and supports subsequent saves", () => {
  const original = "Intro\n```asciiflow\nold\n```\nOutro";
  const current = "New intro\n" + original + "\nMore notes";
  const result = mergeCodeBlock(current, original, 1, 3, "old", "new\nrow");
  assert.equal(
    result.text,
    "New intro\nIntro\n```asciiflow\nnew\nrow\n```\nOutro\nMore notes",
  );
  const next = mergeCodeBlock(
    result.text + "!",
    result.text,
    result.start,
    result.end,
    "new\nrow",
    "final",
  );
  assert.ok(next.text.includes("final"));
  assert.ok(next.text.endsWith("More notes!"));
});

test("save rejects conflicting diagrams and ambiguous duplicated blocks", () => {
  const original = "```asciiflow\nold\n```";
  assert.throws(
    () =>
      mergeCodeBlock(
        original.replace("old", "other"),
        original,
        0,
        2,
        "old",
        "new",
      ),
    /diagram changed/,
  );
  assert.throws(
    () =>
      mergeCodeBlock(original + "\n" + original, original, 0, 2, "old", "new"),
    /uniquely/,
  );
});

test("single clicks with a shape tool do not leave marks", () => {
  const grid = gridFromText("label"),
    manager = new ToolManager(grid, () => {});
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  assert.equal(gridToText(grid), "label");
});

test("undo restores the label cursor before typing replacement text", () => {
  const grid = new Grid(),
    manager = new ToolManager(grid, () => {});
  manager.setActiveTool("text");
  manager.handlePointerDown(pointer(1, 4));
  manager.handlePointerUp(pointer(1, 4));
  for (const ch of "old")
    manager.edit((ctx) => manager.getTextTool().handleChar(ch, ctx), "typing");
  manager.undo();
  assert.deepEqual(manager.getTextTool().getCursor(), { row: 1, col: 4 });
  manager.edit((ctx) => manager.getTextTool().handleChar("N", ctx), "typing");
  assert.equal(gridToText(grid), "\n    N");
});

test("arrowheads cycle to the other end, both ends, then back", () => {
  const grid = new Grid(1, 1);
  drawPath(grid, route({ row: 0, col: 0 }, { row: 0, col: 6 }));
  drawPath(grid, route({ row: 3, col: 3 }, { row: 0, col: 3 }), true);
  assert.equal(gridToText(grid), "───▲───\n   │\n   │\n   │");
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(2, 3));
  manager.handlePointerUp(pointer(2, 3));
  const press = () =>
    manager.edit((ctx) => manager.getSelectTool().cycleArrowHeads(ctx));
  press();
  // The head leaves the line, which rejoins as a junction.
  assert.equal(gridToText(grid), "───┬───\n   │\n   │\n   ▼");
  press();
  assert.equal(gridToText(grid), "───▲───\n   │\n   │\n   ▼");
  press();
  assert.equal(gridToText(grid), "───▲───\n   │\n   │\n   │");
  manager.undo();
  assert.equal(gridToText(grid), "───▲───\n   │\n   │\n   ▼");
});

test("resizing a double-headed arrow keeps both heads", () => {
  const grid = new Grid(1, 1);
  drawPath(grid, route({ row: 0, col: 0 }, { row: 0, col: 4 }), true);
  setArrowHeads(grid, route({ row: 0, col: 0 }, { row: 0, col: 4 }), {
    start: true,
    end: true,
  });
  assert.equal(gridToText(grid), "◄───►");
  const shape = recognizeShape(grid, {
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 4,
  })!;
  // Drag whichever handle is the right-hand end.
  const points = (shape as { points: { col: number }[] }).points;
  resizeShape(grid, shape, points[0].col === 4 ? 0 : 1, { row: 0, col: 7 });
  assert.equal(gridToText(grid).trim(), "◄──────►");
});

test("rotating a selection turns lines and arrows and keeps labels readable", () => {
  const grid = gridFromText(
    ["┌──────┐", "│ Hi   ├──►", "└──────┘"].join("\n"),
    1,
    1,
  );
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.getSelectTool().setSelection({
    startRow: 0,
    startCol: 0,
    endRow: 2,
    endCol: 10,
  });
  const turn = (clockwise: boolean) =>
    manager.edit((ctx) => manager.getSelectTool().rotate(ctx, clockwise));
  turn(true);
  const text = gridToText(grid);
  // The box is now tall and narrow, the connector points down, the label survives.
  assert.match(text, /┌─┐/);
  assert.match(text, /▼/);
  assert.ok(!/[►─]{3}/.test(text.split("\n")[0]));
  assert.equal(text.replace(/[^A-Za-z]/g, ""), "Hi");
  turn(false);
  assert.equal(
    gridToText(grid).trim(),
    ["┌──────┐", "│ Hi   ├──►", "└──────┘"].join("\n"),
  );
  manager.undo();
  manager.undo();
  assert.equal(
    gridToText(grid),
    ["┌──────┐", "│ Hi   ├──►", "└──────┘"].join("\n"),
  );
});

test("line style cycles a box through dashed and double and survives resize", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 5 });
  grid.setCell(1, 2, "A");
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  const press = () =>
    manager.edit((ctx) => manager.getSelectTool().cycleLineStyle(ctx));
  press();
  assert.equal(gridToText(grid), "┌┄┄┄┄┐\n┆ A  ┆\n└┄┄┄┄┘");
  press();
  assert.equal(gridToText(grid), "╔════╗\n║ A  ║\n╚════╝");
  // Still recognized as a box, and resizing keeps the double border.
  const rect = { startRow: 0, startCol: 0, endRow: 2, endCol: 5 };
  const shape = recognizeShape(grid, rect);
  assert.equal(shape?.kind, "box");
  resizeShape(grid, shape!, 2, { row: 3, col: 7 });
  assert.equal(gridToText(grid), "╔══════╗\n║ A    ║\n║      ║\n╚══════╝");
  // Handle drags update the selection; mirror that here.
  manager
    .getSelectTool()
    .setSelection({ startRow: 0, startCol: 0, endRow: 3, endCol: 7 });
  press();
  assert.equal(gridToText(grid).split("\n")[0], "┌──────┐");
  manager.undo();
  assert.equal(gridToText(grid).split("\n")[0], "╔══════╗");
});

test("line style changes an arrow but not the box border it touches", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawPath(grid, route({ row: 1, col: 4 }, { row: 1, col: 10 }), true);
  assert.equal(gridToText(grid), "┌───┐\n│   ├─────►\n└───┘");
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(1, 7));
  manager.handlePointerUp(pointer(1, 7));
  manager.edit((ctx) => manager.getSelectTool().cycleLineStyle(ctx));
  assert.equal(gridToText(grid), "┌───┐\n│   ├┄┄┄┄┄►\n└───┘");
});

test("arrowheads switch to T bars, keep cycling, and T-ended lines are connectors", () => {
  const grid = new Grid(1, 1);
  drawPath(grid, route({ row: 0, col: 0 }, { row: 0, col: 6 }), true);
  assert.equal(gridToText(grid), "──────►");
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 3));
  manager.handlePointerUp(pointer(0, 3));
  const select = () => manager.getSelectTool();
  manager.edit((ctx) => select().toggleHeadShape(ctx));
  assert.equal(gridToText(grid), "──────┤");
  // A line ending only in a T bar is still recognized as a connector.
  assert.equal(
    recognizeShape(grid, { startRow: 0, startCol: 0, endRow: 0, endCol: 6 })
      ?.kind,
    "arrow",
  );
  manager.edit((ctx) => select().cycleArrowHeads(ctx));
  assert.equal(gridToText(grid), "├──────");
  manager.edit((ctx) => select().cycleArrowHeads(ctx));
  assert.equal(gridToText(grid), "├─────┤");
  manager.edit((ctx) => select().toggleHeadShape(ctx));
  assert.equal(gridToText(grid), "◄─────►");
  manager.undo();
  assert.equal(gridToText(grid), "├─────┤");
});

test("T bars follow the line style and turn with the connector", () => {
  const grid = new Grid(1, 1);
  const path = route({ row: 0, col: 0 }, { row: 3, col: 0 });
  drawPath(grid, path, true);
  restyle(grid, path, "double");
  toggleHeadShape(grid, path);
  assert.equal(gridToText(grid), "║\n║\n║\n╩");
});

test("moving a selection keeps what is under its empty cells and restores what it passed over", () => {
  const grid = new Grid(1, 1);
  drawPath(grid, route({ row: 0, col: 5 }, { row: 4, col: 5 }));
  grid.setCell(2, 0, "A");
  grid.setCell(2, 1, "B");
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  // A rectangular selection with empty space around the label.
  select.setSelection({ startRow: 1, startCol: 0, endRow: 3, endCol: 3 });
  const nudge = (dc: number) => manager.edit((ctx) => select.nudge(0, dc, ctx));
  nudge(3);
  // Its empty cells now cover the line, which is untouched.
  assert.equal(gridToText(grid), "     │\n     │\n   AB│\n     │\n     │");
  nudge(1);
  assert.equal(gridToText(grid), "     │\n     │\n    AB\n     │\n     │");
  nudge(1);
  assert.equal(gridToText(grid), "     │\n     │\n     AB\n     │\n     │");
  nudge(1);
  // Moving on gives the line back the cells the label covered.
  assert.equal(gridToText(grid), "     │\n     │\n     │AB\n     │\n     │");
});

test("shift-click adds and removes items, and the group moves together", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawBox(grid, { startRow: 0, startCol: 10, endRow: 2, endCol: 14 });
  drawPath(grid, route({ row: 5, col: 0 }, { row: 5, col: 6 }), true);
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  const click = (row: number, col: number, shiftKey = false) => {
    manager.handlePointerDown({ ...pointer(row, col), shiftKey });
    manager.handlePointerUp({ ...pointer(row, col), shiftKey });
  };
  click(0, 2);
  click(0, 12, true);
  click(5, 3, true);
  const keys = () =>
    new Set(select.normalized().cells!.map((p) => `${p.row}:${p.col}`));
  assert.ok(keys().has("0:0") && keys().has("0:10") && keys().has("5:6"));
  // Shift-clicking a selected item removes it again.
  click(0, 12, true);
  assert.ok(keys().has("0:0") && !keys().has("0:10") && keys().has("5:6"));
  // Both remaining items move together; the unselected box stays put.
  manager.edit((ctx) => select.nudge(1, 0, ctx));
  assert.equal(
    gridToText(grid),
    [
      "          ┌───┐",
      "┌───┐     │   │",
      "│   │     └───┘",
      "└───┘",
      "",
      "",
      "──────►",
    ].join("\n"),
  );
  // Shift-clicking empty space keeps the selection.
  click(9, 9, true);
  assert.ok(keys().has("1:0"));
});

test("connectors stay attached when a box moves", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawBox(grid, { startRow: 0, startCol: 14, endRow: 2, endCol: 18 });
  drawPath(grid, route({ row: 1, col: 4 }, { row: 1, col: 14 }), true);
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  manager.edit((ctx) => select.nudge(4, 0, ctx));
  assert.equal(
    gridToText(grid),
    [
      "              ┌───┐",
      "         ┌────►   │",
      "         │    └───┘",
      "         │",
      "┌───┐    │",
      "│   ├────┘",
      "└───┘",
    ].join("\n"),
  );
  // One undo step restores the box and its connector together.
  manager.undo();
  assert.equal(
    gridToText(grid),
    ["┌───┐         ┌───┐", "│   ├─────────►   │", "└───┘         └───┘"].join(
      "\n",
    ),
  );
});

test("a connector between two boxes moved together travels unchanged", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawBox(grid, { startRow: 0, startCol: 14, endRow: 2, endCol: 18 });
  drawPath(grid, route({ row: 1, col: 4 }, { row: 1, col: 14 }), true);
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  manager.handlePointerDown({ ...pointer(0, 16), shiftKey: true });
  manager.handlePointerUp({ ...pointer(0, 16), shiftKey: true });
  manager.edit((ctx) => select.nudge(2, 3, ctx));
  assert.equal(
    gridToText(grid),
    [
      "",
      "",
      "   ┌───┐         ┌───┐",
      "   │   ├─────────►   │",
      "   └───┘         └───┘",
    ].join("\n"),
  );
});

test("connectors follow the sides of a resized box", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawPath(grid, route({ row: 1, col: 4 }, { row: 1, col: 12 }), true);
  drawPath(grid, route({ row: 2, col: 2 }, { row: 6, col: 2 }), true);
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  // Drag the bottom-right handle out.
  manager.handlePointerDown(pointer(2, 4));
  manager.handlePointerMove({
    ...pointer(4, 7),
    startRow: 2,
    startCol: 4,
    isDragging: true,
  });
  manager.handlePointerUp({
    ...pointer(4, 7),
    startRow: 2,
    startCol: 4,
    isDragging: true,
  });
  assert.equal(
    gridToText(grid),
    [
      "┌──────┐",
      "│      ├────►",
      "│      │",
      "│      │",
      "└─┬────┘",
      "  │",
      "  ▼",
    ].join("\n"),
  );
});

test("selecting a line that crosses another selects only that line", () => {
  const grid = new Grid(1, 1);
  drawPath(grid, route({ row: 2, col: 0 }, { row: 2, col: 8 }), true);
  drawPath(grid, route({ row: 0, col: 4 }, { row: 4, col: 4 }));
  assert.equal(gridToText(grid), "    │\n    │\n────┼───►\n    │\n    │");
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(2, 1));
  manager.handlePointerUp(pointer(2, 1));
  const rows = new Set(select.normalized().cells!.map((p) => p.row));
  assert.deepEqual([...rows], [2]);
  // Moving the arrow away leaves the crossed line whole.
  manager.edit((ctx) => select.nudge(3, 0, ctx));
  assert.equal(
    gridToText(grid),
    "    │\n    │\n    │\n    │\n    │\n────────►",
  );
  // And the vertical line is selectable on its own as well.
  manager.undo();
  manager.handlePointerDown(pointer(0, 4));
  manager.handlePointerUp(pointer(0, 4));
  const cols = new Set(select.normalized().cells!.map((p) => p.col));
  assert.deepEqual([...cols], [4]);
});

test("an attached connector re-routes through a line it crosses", () => {
  const grid = new Grid(1, 1);
  drawBox(grid, { startRow: 0, startCol: 0, endRow: 2, endCol: 4 });
  drawPath(grid, route({ row: 1, col: 4 }, { row: 1, col: 12 }), true);
  drawPath(grid, route({ row: 0, col: 8 }, { row: 6, col: 8 }));
  assert.equal(
    gridToText(grid),
    "┌───┐   │\n│   ├───┼───►\n└───┘   │\n        │\n        │\n        │\n        │",
  );
  const manager = new ToolManager(grid, () => {});
  manager.setActiveTool("select");
  manager.handlePointerDown(pointer(0, 2));
  manager.handlePointerUp(pointer(0, 2));
  manager.edit((ctx) => manager.getSelectTool().nudge(4, 0, ctx));
  // The arrow keeps its far end, bends beside the crossed line rather than
  // along it, and crosses it cleanly; the line is whole where the arrow left.
  assert.equal(
    gridToText(grid),
    [
      "        │",
      "       ┌┼───►",
      "       ││",
      "       ││",
      "┌───┐  ││",
      "│   ├──┘│",
      "└───┘   │",
    ].join("\n"),
  );
});

test("drag-selecting picks whole arrows and labels but not lines passing through", () => {
  const grid = gridFromText(
    [
      "      ╔═══════╦═══════╗",
      "      ║ A     ║ B     ║",
      "      ╚═══╦═══╩═══╦═══╝",
      "          │       │",
      "Event     │ Ask   │",
      "─────────►│ ────► │",
      "          │ ──────┼───►",
      "          │       │",
      "          │       │",
    ].join("\n"),
    1,
    1,
  );
  const manager = new ToolManager(grid, () => {});
  const select = manager.getSelectTool();
  manager.setActiveTool("select");
  // Drag from above "Event" to below the arrows, across both lifelines.
  manager.handlePointerDown(pointer(4, 0));
  manager.handlePointerMove({
    ...pointer(7, 23),
    startRow: 4,
    startCol: 0,
    isDragging: true,
  });
  manager.handlePointerUp({
    ...pointer(7, 23),
    startRow: 4,
    startCol: 0,
    isDragging: true,
  });
  const picked = new Set(
    select.normalized().cells!.map((p) => `${p.row}:${p.col}`),
  );
  for (const p of ["4:0", "4:12", "5:0", "5:9", "5:12", "5:16", "6:12", "6:22"])
    assert.ok(picked.has(p), `includes ${p}`);
  // The lifelines run outside the rectangle, so they are not selected.
  for (const p of ["3:10", "4:10", "7:10", "7:18"])
    assert.ok(!picked.has(p), `excludes ${p}`);
  // Deleting the selection leaves both lifelines whole, crossing included.
  manager.edit((ctx) => select.deleteSelection(ctx));
  assert.equal(
    gridToText(grid),
    [
      "      ╔═══════╦═══════╗",
      "      ║ A     ║ B     ║",
      "      ╚═══╦═══╩═══╦═══╝",
      "          │       │",
      "          │       │",
      "          │       │",
      "          │       │",
      "          │       │",
      "          │       │",
    ].join("\n"),
  );
});
