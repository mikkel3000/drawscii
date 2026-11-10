import {
  Point,
  Shape,
  HeadEnd,
  arrowHeads,
  nextLineStyle,
  restyle,
  shapeStyle,
  cycleArrowHeads,
  orientConnector,
  toggleHeadShape,
  recognizeShape,
  resizeShape,
  shapeHandles,
  samePoint,
} from "../model/Drawing";
import {
  enclosingBox,
  smartRegion,
  textRegion,
  isBorder,
  SelectedCell,
} from "../model/SmartSelection";
import { charWidth } from "../model/CharWidth";
import { Grid } from "../model/Grid";
import { rotateGrid } from "../model/Rotate";
import { gridFromText, gridToText } from "../model/Serializer";
import { ITool } from "./ITool";
import { ToolContext } from "./ToolContext";
import { ToolPointerState } from "./ToolTypes";

export type Selection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  cells?: SelectedCell[];
};

export type DragPreview = {
  grid: Grid;
  targetRow: number;
  targetCol: number;
  sourceSelection: Selection;
  copyMode: boolean;
  opaque?: boolean;
};

export class SelectTool implements ITool {
  id = "select";
  private smart = true;
  private selecting = false;
  setSmart(value: boolean) {
    this.smart = value;
  }
  private resizing: { shape: Shape; handle: number; base: Grid } | null = null;
  private selection: Selection | null = null;
  private headCycle: { ends: string; origin: HeadEnd } | null = null;
  private renderHighlight: ((sel: Selection) => void) | null = null;
  private clearHighlight: (() => void) | null = null;
  private renderDragPreview: ((preview: DragPreview | null) => void) | null =
    null;
  private draggingSelection = false;
  private draggingMoved = false;
  private dragOffset: { row: number; col: number } | null = null;
  private dragSourceSelection: Selection | null = null;
  private dragClipboard: Grid | null = null;
  private dragCopyMode = false;

  /** Register a callback to draw the selection highlight overlay. */
  setRenderHighlight(fn: (sel: Selection) => void) {
    this.renderHighlight = fn;
  }

  setClearHighlight(fn: () => void) {
    this.clearHighlight = fn;
  }

  /** Register a callback to draw the drag preview overlay. */
  setRenderDragPreview(fn: (preview: DragPreview | null) => void) {
    this.renderDragPreview = fn;
  }

  getSelection(): Selection | null {
    return this.selection;
  }

  onPointerDown(state: ToolPointerState, ctx: ToolContext) {
    this.selecting = false;
    const shape = this.selection
      ? recognizeShape(ctx.grid, this.normalized())
      : null;
    const handle = shapeHandles(shape).findIndex((p) => samePoint(p, state));
    if (shape && handle >= 0 && !state.ctrlKey) {
      this.resizing = { shape, handle, base: ctx.grid.clone() };
      return;
    }
    if (
      this.selection &&
      this.isInsideSelection(state.row, state.col, this.normalized())
    ) {
      this.draggingSelection = true;
      this.draggingMoved = false;
      this.dragCopyMode = state.ctrlKey;
      const normalized = this.normalized();
      this.dragSourceSelection = normalized;
      this.dragOffset = {
        row: state.row - normalized.startRow,
        col: state.col - normalized.startCol,
      };
      this.dragClipboard = this.captureSelection(ctx, normalized);
      this.drawHighlight();
      ctx.render();
      return;
    }

    this.draggingSelection = false;
    this.draggingMoved = false;
    this.dragOffset = null;
    this.dragSourceSelection = null;
    this.dragClipboard = null;
    this.dragCopyMode = false;

    this.selecting = true;
    this.selection = {
      startRow: state.row,
      startCol: state.col,
      endRow: state.row,
      endCol: state.col,
    };
    this.drawHighlight();
    ctx.render();
  }

  onPointerMove(state: ToolPointerState, ctx: ToolContext) {
    if (!state.isDragging) return;
    if (this.resizing) {
      ctx.grid.loadFromGrid(this.resizing.base);
      this.selection = resizeShape(
        ctx.grid,
        this.resizing.shape,
        this.resizing.handle,
        state,
      );
      this.drawHighlight();
      ctx.render();
      return;
    }
    if (!this.selection) return;
    if (this.draggingSelection && this.dragOffset) {
      // Once duplication is requested, releasing the modifier must not turn
      // the same drag into a move and erase the original.
      this.dragCopyMode ||= state.ctrlKey;
      this.draggingMoved = true;
      const size = this.getSelectionSize(this.selection);
      const startRow = Math.max(0, state.row - this.dragOffset.row);
      const startCol = Math.max(0, state.col - this.dragOffset.col);
      this.selection.startRow = startRow;
      this.selection.startCol = startCol;
      this.selection.endRow = startRow + size.rows - 1;
      this.selection.endCol = startCol + size.cols - 1;
      this.selection.cells = this.dragSourceSelection?.cells?.map((p) => ({
        row: p.row - this.dragSourceSelection!.startRow + startRow,
        col: p.col - this.dragSourceSelection!.startCol + startCol,
      }));
      // Show drag preview via renderer overlay (no grid mutation)
      this.showDragPreview();
      this.drawHighlight();
      ctx.render();
      return;
    }

    this.selection.endRow = state.row;
    this.selection.endCol = state.col;
    this.drawHighlight();
    ctx.render();
  }

  onPointerUp(state: ToolPointerState, ctx: ToolContext) {
    if (this.resizing) {
      this.onPointerMove({ ...state, isDragging: true }, ctx);
      this.resizing = null;
      return;
    }
    if (this.draggingSelection) {
      this.onPointerMove({ ...state, isDragging: true }, ctx);
    }
    // Clear drag preview overlay
    this.clearDragPreview();

    if (!this.selection) return;
    if (
      this.draggingSelection &&
      this.dragClipboard &&
      this.dragSourceSelection
    ) {
      if (!this.draggingMoved) {
        this.resetDragState();
        this.drawHighlight();
        ctx.render();
        return;
      }
      const target = this.normalized();
      const source = this.dragSourceSelection;
      if (
        this.dragCopyMode &&
        target.startRow <= source.endRow &&
        target.endRow >= source.startRow &&
        target.startCol <= source.endCol &&
        target.endCol >= source.startCol
      ) {
        this.selection = { ...source };
        this.resetDragState();
        this.drawHighlight();
        ctx.render();
        return;
      }
      if (!this.dragCopyMode) {
        this.clearRegion(ctx, this.dragSourceSelection);
      }
      // Only drawn cells land; empty ones leave what is underneath alone.
      const clipboard = this.dragClipboard;
      this.resetDragState();
      this.placeGrid(clipboard, target.startRow, target.startCol, ctx, false);
      return;
    }

    this.selection.endRow = state.row;
    this.selection.endCol = state.col;
    if (this.smart && this.selecting) {
      const clicked =
        state.row === state.startRow && state.col === state.startCol;
      this.selection = clicked
        ? (smartRegion(ctx.grid, state) ?? this.selection)
        : textRegion(ctx.grid, this.normalized());
    }
    this.selecting = false;
    this.drawHighlight();
    ctx.render();
  }

  snapshot(ctx: ToolContext): Grid | null {
    return this.selection
      ? this.captureSelection(ctx, this.normalized())
      : null;
  }

  /** Copy the selected region and return the text for system clipboard. */
  copy(ctx: ToolContext): string | null {
    if (!this.selection) return null;
    const captured = this.captureSelection(ctx, this.normalized());
    return gridToText(captured);
  }

  /** Copy then clear the selected region, return text for system clipboard. */
  cut(ctx: ToolContext): string | null {
    const text = this.copy(ctx);
    if (text !== null) {
      this.deleteSelection(ctx);
    }
    return text;
  }

  /** Paste text at the current selection start (or 0,0). */
  paste(text: string, ctx: ToolContext) {
    const externalGrid = gridFromText(text, 1, 1);
    const targetRow = this.selection ? this.normalized().startRow : 0;
    const targetCol = this.selection ? this.normalized().startCol : 0;
    this.placeGrid(externalGrid, targetRow, targetCol, ctx);
    ctx.render();
  }

  /** Clear all cells inside the selection. */
  deleteSelection(ctx: ToolContext) {
    if (!this.selection) return;
    this.clearRegion(ctx, this.normalized());
    ctx.render();
  }

  /** Return the selection with start <= end in both axes. */
  normalized(): Selection {
    const s = this.selection!;
    return {
      startRow: Math.min(s.startRow, s.endRow),
      startCol: Math.min(s.startCol, s.endCol),
      endRow: Math.max(s.startRow, s.endRow),
      endCol: Math.max(s.startCol, s.endCol),
      ...(s.cells ? { cells: s.cells } : {}),
    };
  }

  clearSelection() {
    this.resizing = null;
    this.resetDragState();
    this.clearDragPreview();
    this.selection = null;
    if (this.clearHighlight) this.clearHighlight();
  }

  private drawHighlight() {
    if (this.selection && this.renderHighlight) {
      this.renderHighlight(this.normalized());
    }
  }

  private showDragPreview() {
    if (
      !this.dragClipboard ||
      !this.dragSourceSelection ||
      !this.renderDragPreview
    )
      return;
    const target = this.normalized();
    this.renderDragPreview({
      grid: this.dragClipboard,
      targetRow: target.startRow,
      targetCol: target.startCol,
      sourceSelection: this.dragSourceSelection,
      copyMode: this.dragCopyMode,
      opaque: false,
    });
  }

  private clearDragPreview() {
    if (this.renderDragPreview) {
      this.renderDragPreview(null);
    }
  }

  private resetDragState() {
    this.draggingSelection = false;
    this.draggingMoved = false;
    this.dragOffset = null;
    this.dragSourceSelection = null;
    this.dragClipboard = null;
    this.dragCopyMode = false;
  }

  private isInsideSelection(row: number, col: number, sel: Selection) {
    return (
      row >= sel.startRow &&
      row <= sel.endRow &&
      col >= sel.startCol &&
      col <= sel.endCol
    );
  }

  private getSelectionSize(sel: Selection) {
    const normalized = {
      startRow: Math.min(sel.startRow, sel.endRow),
      startCol: Math.min(sel.startCol, sel.endCol),
      endRow: Math.max(sel.startRow, sel.endRow),
      endCol: Math.max(sel.startCol, sel.endCol),
    };
    return {
      rows: normalized.endRow - normalized.startRow + 1,
      cols: normalized.endCol - normalized.startCol + 1,
    };
  }

  private captureSelection(ctx: ToolContext, sel: Selection) {
    const { startRow, startCol, endRow, endCol } = sel;
    const rows = endRow - startRow + 1;
    const cols = endCol - startCol + 1;
    const grid = new Grid(rows, cols);
    const included = sel.cells
      ? new Set(sel.cells.map((p) => Grid.key(p.row, p.col)))
      : null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (included && !included.has(Grid.key(startRow + r, startCol + c)))
          continue;
        const override = sel.cells?.find(
          (p) => p.row === startRow + r && p.col === startCol + c,
        );
        const val = override?.value ?? ctx.getCell(startRow + r, startCol + c);
        if (val) grid.setCell(r, c, val);
      }
    }
    return grid;
  }

  private clearRegion(ctx: ToolContext, sel: Selection) {
    const { startRow, startCol, endRow, endCol } = sel;
    if (sel.cells) {
      for (const p of sel.cells) ctx.setCell(p.row, p.col, p.restore ?? "");
      return;
    }
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        ctx.setCell(r, c, "");
      }
    }
  }

  private pasteGrid(
    ctx: ToolContext,
    grid: Grid,
    targetRow: number,
    targetCol: number,
    opaque = true,
  ) {
    const { rows, cols } = grid.getSize();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (opaque || grid.getCell(r, c))
          ctx.setCell(targetRow + r, targetCol + c, grid.getCell(r, c));
  }

  setSelection(selection: Selection) {
    this.selection = selection;
    this.drawHighlight();
  }

  placeGrid(
    grid: Grid,
    row: number,
    col: number,
    ctx: ToolContext,
    opaque = true,
  ) {
    const { rows, cols } = grid.getSize();
    const cells: SelectedCell[] = [];
    // Remember what each drawn cell covers, so moving on restores it.
    if (!opaque)
      grid.forEachCell((p) => {
        const under = ctx.getCell(row + p.row, col + p.col);
        cells.push({
          row: row + p.row,
          col: col + p.col,
          ...(under ? { restore: under } : {}),
        });
      });
    this.pasteGrid(ctx, grid, row, col, opaque);
    this.setSelection({
      ...(opaque ? {} : { cells }),
      startRow: row,
      startCol: col,
      endRow: row + rows - 1,
      endCol: col + cols - 1,
    });
    ctx.render();
  }

  nudge(dr: number, dc: number, ctx: ToolContext, copy = false) {
    if (!this.selection) return;
    const old = this.normalized(),
      captured = this.captureSelection(ctx, old);
    let row = Math.max(0, old.startRow + dr),
      col = Math.max(0, old.startCol + dc);
    if (copy) {
      const size = captured.getSize();
      if (
        row <= old.endRow &&
        row + size.rows - 1 >= old.startRow &&
        col <= old.endCol &&
        col + size.cols - 1 >= old.startCol
      ) {
        if (dc)
          col =
            dc < 0 && old.startCol > size.cols
              ? old.startCol - size.cols - 1
              : old.endCol + 2;
        else
          row =
            dr < 0 && old.startRow > size.rows
              ? old.startRow - size.rows - 1
              : old.endRow + 2;
      }
    }
    if (!copy) this.clearRegion(ctx, old);
    this.placeGrid(captured, row, col, ctx, false);
  }

  /** Turn the selection 90° about its centre, keeping it selected. */
  rotate(ctx: ToolContext, turnClockwise = true) {
    if (!this.selection) return;
    const old = this.normalized(),
      turned = rotateGrid(this.captureSelection(ctx, old), turnClockwise);
    const { rows, cols } = turned.getSize();
    const centerRow = (old.startRow + old.endRow) / 2,
      centerCol = (old.startCol + old.endCol) / 2;
    const row = Math.max(0, Math.round(centerRow - (rows - 1) / 2)),
      col = Math.max(0, Math.round(centerCol - (cols - 1) / 2));
    this.clearRegion(ctx, old);
    // Write only drawn cells: the turned footprint may cover neighbours.
    this.placeGrid(turned, row, col, ctx, false);
  }

  /** Cycle the selection's lines: solid → dashed → double → solid. */
  cycleLineStyle(ctx: ToolContext) {
    if (!this.selection) return;
    const sel = this.normalized();
    // Skip cells where a connector touches a box border it does not own.
    const points: Point[] = sel.cells
      ? sel.cells.filter((p) => p.restore === undefined)
      : [];
    if (!sel.cells)
      for (let row = sel.startRow; row <= sel.endRow; row++)
        for (let col = sel.startCol; col <= sel.endCol; col++)
          points.push({ row, col });
    const style = shapeStyle(ctx.grid, points);
    if (!style) return;
    restyle(ctx.grid, points, nextLineStyle(style));
    ctx.render();
  }

  /** Swap the selected connector's heads between arrowheads and T bars. */
  toggleHeadShape(ctx: ToolContext) {
    if (!this.selection) return;
    const shape = recognizeShape(ctx.grid, this.normalized());
    if (shape?.kind !== "arrow") return;
    toggleHeadShape(ctx.grid, shape.points);
    ctx.render();
  }

  /** Cycle the selected connector's heads: one end, the other, both. */
  cycleArrowHeads(ctx: ToolContext) {
    if (!this.selection) return;
    const shape = recognizeShape(ctx.grid, this.normalized());
    if (shape?.kind !== "arrow") return;
    const points = orientConnector(shape.points);
    const ends = points
      .filter((_, i) => i === 0 || i === points.length - 1)
      .map((p) => Grid.key(p.row, p.col))
      .join("|");
    // Repeated presses on the same arrow continue from where its head began.
    if (this.headCycle?.ends !== ends) {
      const heads = arrowHeads(ctx.grid, points);
      this.headCycle = {
        ends,
        origin: heads.start && !heads.end ? "start" : "end",
      };
    }
    cycleArrowHeads(ctx.grid, points, this.headCycle.origin);
    ctx.render();
  }

  centerLabel(ctx: ToolContext) {
    if (!this.selection) return;
    const selected = this.normalized();
    const rect =
      recognizeShape(ctx.grid, selected)?.kind === "box"
        ? selected
        : enclosingBox(ctx.grid, {
            row: selected.startRow,
            col: selected.startCol,
          });
    if (!rect) return;
    const source: { row: number; col: number; value: string }[] = [];
    const wholeBox = recognizeShape(ctx.grid, selected)?.kind === "box";
    const included = selected.cells
      ? new Set(selected.cells.map((p) => Grid.key(p.row, p.col)))
      : null;
    ctx.grid.forEachCell((p) => {
      if (
        p.row <= rect.startRow ||
        p.row >= rect.endRow ||
        p.col <= rect.startCol ||
        p.col >= rect.endCol ||
        isBorder(p.value)
      )
        return;
      if (
        wholeBox ||
        (included
          ? included.has(Grid.key(p.row, p.col))
          : p.row >= selected.startRow &&
            p.row <= selected.endRow &&
            p.col >= selected.startCol &&
            p.col <= selected.endCol)
      )
        source.push(p);
    });
    if (!source.length) return;
    const top = Math.min(...source.map((p) => p.row)),
      bottom = Math.max(...source.map((p) => p.row));
    const targetTop =
      rect.startRow +
      1 +
      Math.floor((rect.endRow - rect.startRow - 1 - (bottom - top + 1)) / 2);
    const target: typeof source = [];
    for (let row = top; row <= bottom; row++) {
      const cells = source.filter((p) => p.row === row);
      if (!cells.length) continue;
      const left = Math.min(...cells.map((p) => p.col));
      const right = Math.max(
        ...cells.map((p) => p.col + Math.max(1, charWidth(p.value))),
      );
      const targetLeft =
        rect.startCol +
        1 +
        Math.floor((rect.endCol - rect.startCol - 1 - (right - left)) / 2);
      for (const p of cells)
        target.push({
          row: targetTop + row - top,
          col: targetLeft + p.col - left,
          value: p.value,
        });
    }
    const sourceKeys = new Set(source.map((p) => Grid.key(p.row, p.col)));
    if (
      target.some(
        (p) =>
          ctx.getCell(p.row, p.col) && !sourceKeys.has(Grid.key(p.row, p.col)),
      )
    )
      return;
    for (const p of source) ctx.setCell(p.row, p.col, "");
    for (const p of target) ctx.setCell(p.row, p.col, p.value);
    this.setSelection({
      startRow: Math.min(...target.map((p) => p.row)),
      startCol: Math.min(...target.map((p) => p.col)),
      endRow: Math.max(...target.map((p) => p.row)),
      endCol: Math.max(...target.map((p) => p.col)),
      cells: target.map(({ row, col }) => ({ row, col })),
    });
    ctx.render();
  }
}
