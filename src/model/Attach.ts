import {
  ArrowHeads,
  drawPath,
  headAt,
  HeadShape,
  headShape,
  isTip,
  LineStyle,
  Point,
  rasterLine,
  Rect,
  restyle,
  setArrowHeads,
  shapeStyle,
  strokes,
} from "./Drawing";
import { Grid } from "./Grid";

const N = 1,
  E = 2,
  S = 4,
  W = 8;
type Side = "top" | "bottom" | "left" | "right";
const sides: Record<Side, { out: Point; bit: number; back: number }> = {
  top: { out: { row: -1, col: 0 }, bit: N, back: S },
  bottom: { out: { row: 1, col: 0 }, bit: S, back: N },
  left: { out: { row: 0, col: -1 }, bit: W, back: E },
  right: { out: { row: 0, col: 1 }, bit: E, back: W },
};
const step: [number, Point][] = [
  [N, { row: -1, col: 0 }],
  [E, { row: 0, col: 1 }],
  [S, { row: 1, col: 0 }],
  [W, { row: 0, col: -1 }],
];
const opposite = (bit: number) =>
  bit === N ? S : bit === S ? N : bit === E ? W : E;
const add = (p: Point, d: Point) => ({
  row: p.row + d.row,
  col: p.col + d.col,
});
const bitCount = (mask: number) =>
  [N, E, S, W].filter((bit) => mask & bit).length;

/** A connector attached to one side of a box. */
export type Attachment = {
  side: Side;
  /** From the far end to the attached end, inclusive. */
  path: Point[];
  /** The characters along `path` when it was found. */
  values: string[];
  /** The attached end is a border cell (├, or a head on the border), not one outside it. */
  onBorder: boolean;
  /** The far end belongs to other drawing (a junction) and is left in place. */
  anchored: boolean;
  /** The far end lies in the moving selection, so it moves too. */
  farMoves: boolean;
  heads: ArrowHeads;
  shape: HeadShape;
  style: LineStyle;
};

/**
 * Follow a connector from `start` (entered from `from`) to its far end.
 * Returns the cells in order, or null if it branches.
 */
function trace(
  grid: Grid,
  start: Point,
  from: Point,
  moving: (p: Point) => boolean,
): { cells: Point[]; anchored: boolean; farMoves: boolean } | null {
  const cells: Point[] = [];
  let current = start,
    previous = from;
  for (let guard = 0; guard < 100000; guard++) {
    cells.push(current);
    if (moving(current)) return { cells, anchored: false, farMoves: true };
    const value = grid.getCell(current.row, current.col);
    if (isTip(value) && cells.length > 1)
      return { cells, anchored: false, farMoves: false };
    const mask = strokes[value] ?? 0;
    const arrived = {
      row: current.row - previous.row,
      col: current.col - previous.col,
    };
    // Cross another line straight on; any other junction belongs to it: stop.
    const crossing = cells.length > 1 && mask === (N | E | S | W);
    if (cells.length > 1 && bitCount(mask) > 2 && !crossing)
      return { cells, anchored: true, farMoves: false };
    const onward = step.filter(([bit, d]) =>
      crossing
        ? d.row === arrived.row && d.col === arrived.col
        : mask & bit &&
          !(
            current.row + d.row === previous.row &&
            current.col + d.col === previous.col
          ),
    );
    if (onward.length > 1) return null;
    if (!onward.length) return { cells, anchored: false, farMoves: false };
    const [bit, d] = onward[0];
    const next = add(current, d);
    const nextValue = grid.getCell(next.row, next.col);
    // The line must continue into the next cell (or end in a head there).
    if (!((strokes[nextValue] ?? 0) & opposite(bit)) && !isTip(nextValue))
      return { cells, anchored: false, farMoves: false };
    previous = current;
    current = next;
  }
  return null;
}

/** Connectors attached to `box`, skipping any that are themselves being moved. */
export function findAttachments(
  grid: Grid,
  box: Rect,
  moving: (p: Point) => boolean,
): Attachment[] {
  const result: Attachment[] = [];
  const border: [Side, Point][] = [];
  for (let col = box.startCol + 1; col < box.endCol; col++) {
    border.push(["top", { row: box.startRow, col }]);
    border.push(["bottom", { row: box.endRow, col }]);
  }
  for (let row = box.startRow + 1; row < box.endRow; row++) {
    border.push(["left", { row, col: box.startCol }]);
    border.push(["right", { row, col: box.endCol }]);
  }
  for (const [side, b] of border) {
    const { out, bit, back } = sides[side];
    const o = add(b, out);
    if (moving(o)) continue;
    const bValue = grid.getCell(b.row, b.col),
      oValue = grid.getCell(o.row, o.col);
    const oConnects = ((strokes[oValue] ?? 0) & back) !== 0;
    let onBorder: boolean, traced: ReturnType<typeof trace>;
    if ((((strokes[bValue] ?? 0) & bit) !== 0 || isTip(bValue)) && oConnects) {
      // ├── or a head on the border: the connector starts just outside.
      onBorder = true;
      traced = trace(grid, o, b, moving);
      if (traced) traced.cells.unshift(b);
    } else if (isTip(oValue) && !((strokes[bValue] ?? 0) & bit)) {
      // ──►│ : a head just outside the border, pointing at it.
      const beyond = add(o, out);
      const beyondValue = grid.getCell(beyond.row, beyond.col);
      if (!((strokes[beyondValue] ?? 0) & back)) continue;
      onBorder = false;
      traced = trace(grid, beyond, o, moving);
      if (traced) traced.cells.unshift(o);
    } else continue;
    if (!traced || traced.cells.length < 2) continue;
    const path = traced.cells.reverse();
    const last = path.length - 1;
    result.push({
      side,
      path,
      values: path.map((p) => grid.getCell(p.row, p.col)),
      onBorder,
      anchored: traced.anchored,
      farMoves: traced.farMoves,
      heads: {
        start: !traced.anchored && headAt(grid, path[0], path[1]) !== null,
        end: isTip(grid.getCell(path[last].row, path[last].col)),
      },
      shape: headShape(grid, path),
      style:
        shapeStyle(grid, path.slice(1, onBorder ? last : undefined)) ?? "solid",
    });
  }
  return result;
}

/** The crossed line left at a crossing once a connector along `horizontal` is removed. */
function crossedLine(value: string, horizontal: boolean) {
  return horizontal
    ? "╫╬".includes(value)
      ? "║"
      : "│"
    : "╪╬".includes(value)
      ? "═"
      : "─";
}

/** Remove the parts of attached connectors that will be redrawn. */
export function detach(grid: Grid, attachments: Attachment[]) {
  for (const a of attachments)
    a.path.forEach((p, i) => {
      const far = i === 0,
        end = i === a.path.length - 1;
      // Keep the box border, junctions on other lines, and moving cells.
      if (end && a.onBorder) return;
      if (far && (a.anchored || a.farMoves)) return;
      // Where the connector crossed another line, leave that line whole.
      const value = grid.getCell(p.row, p.col);
      if (strokes[value] === (N | E | S | W) && !far && !end) {
        const next = a.path[i + 1];
        grid.setCell(p.row, p.col, crossedLine(value, next.row === p.row));
        return;
      }
      grid.setCell(p.row, p.col, "");
    });
}

/** An orthogonal path whose ends leave along the given axes. */
function orthogonal(
  grid: Grid,
  a: Point,
  b: Point,
  startAxis: "h" | "v",
  endAxis: "h" | "v",
): Point[] {
  /**
   * The bend's middle segment, as near the midpoint as possible without
   * running along existing drawing (it may still cross it).
   */
  const middle = (from: number, to: number, clear: (at: number) => boolean) => {
    const mid = Math.round((from + to) / 2);
    const lo = Math.min(from, to),
      hi = Math.max(from, to);
    for (let offset = 0; offset <= hi - lo; offset++)
      for (const at of [mid - offset, mid + offset])
        if (at >= lo && at <= hi && clear(at)) return at;
    return mid;
  };
  const emptyColumn = (col: number) => {
    for (
      let row = Math.min(a.row, b.row) + 1;
      row < Math.max(a.row, b.row);
      row++
    )
      if (grid.getCell(row, col)) return false;
    return true;
  };
  const emptyRow = (row: number) => {
    for (
      let col = Math.min(a.col, b.col) + 1;
      col < Math.max(a.col, b.col);
      col++
    )
      if (grid.getCell(row, col)) return false;
    return true;
  };
  let vertices: Point[];
  if (startAxis !== endAxis)
    vertices = [
      a,
      startAxis === "h"
        ? { row: a.row, col: b.col }
        : { row: b.row, col: a.col },
      b,
    ];
  else if (startAxis === "h") {
    const mid = middle(a.col, b.col, emptyColumn);
    vertices = [a, { row: a.row, col: mid }, { row: b.row, col: mid }, b];
  } else {
    const mid = middle(a.row, b.row, emptyRow);
    vertices = [a, { row: mid, col: a.col }, { row: mid, col: b.col }, b];
  }
  const path: Point[] = [];
  for (let i = 1; i < vertices.length; i++)
    for (const p of rasterLine(vertices[i - 1], vertices[i])) {
      const tail = path[path.length - 1];
      if (!tail || tail.row !== p.row || tail.col !== p.col) path.push(p);
    }
  return path;
}

/**
 * Redraw detached connectors to their boxes' new positions. `place` maps an
 * attachment to its new attached end; `shift` moves far ends that move too.
 */
export function reattach(
  grid: Grid,
  attachments: Attachment[],
  place: (a: Attachment) => Point,
  shift: Point = { row: 0, col: 0 },
) {
  for (const a of attachments) {
    const old = a.path;
    const far = a.farMoves ? add(old[0], shift) : old[0];
    const end = place(a);
    const last = old[old.length - 1];
    if (
      a.farMoves &&
      end.row === last.row + shift.row &&
      end.col === last.col + shift.col
    ) {
      // Both ends move together: carry the connector along unchanged.
      old.forEach((p, i) => {
        if (i === 0 || (i === old.length - 1 && a.onBorder)) return;
        let value = a.values[i];
        // A crossing stays behind with the crossed line; carry only our stroke.
        if (strokes[value] === (N | E | S | W))
          value = crossedLine(value, old[i + 1]?.row !== p.row);
        grid.setCell(p.row + shift.row, p.col + shift.col, value);
      });
      continue;
    }
    const farAxis = old[0].row === old[1].row ? "h" : "v";
    const endAxis = a.side === "left" || a.side === "right" ? "h" : "v";
    const path =
      far.row === end.row && far.col === end.col
        ? [end]
        : orthogonal(grid, far, end, farAxis, endAxis);
    if (path.length < 2) continue;
    drawPath(grid, path, false);
    setArrowHeads(grid, path, a.heads, a.shape);
    if (a.style !== "solid")
      restyle(
        grid,
        path.slice(
          a.anchored || a.farMoves ? 1 : 0,
          a.onBorder ? -1 : undefined,
        ),
        a.style,
      );
  }
}

/** The new attached end after a box moves by `delta`. */
export const moveAttachment = (delta: Point) => (a: Attachment) =>
  add(a.path[a.path.length - 1], delta);

/** The new attached end after a box is resized to `after`. */
export const resizeAttachment =
  (after: Rect) =>
  (a: Attachment): Point => {
    const p = a.path[a.path.length - 1];
    const gap = a.onBorder ? 0 : 1;
    const clampRow = (row: number) =>
      Math.min(Math.max(row, after.startRow + 1), after.endRow - 1);
    const clampCol = (col: number) =>
      Math.min(Math.max(col, after.startCol + 1), after.endCol - 1);
    if (a.side === "left")
      return { row: clampRow(p.row), col: after.startCol - gap };
    if (a.side === "right")
      return { row: clampRow(p.row), col: after.endCol + gap };
    if (a.side === "top")
      return { row: after.startRow - gap, col: clampCol(p.col) };
    return { row: after.endRow + gap, col: clampCol(p.col) };
  };
