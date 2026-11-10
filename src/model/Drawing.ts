import { charWidth } from "./CharWidth";
import { Grid } from "./Grid";
export type Point = { row: number; col: number };
export type Rect = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};
const N = 1,
  E = 2,
  S = 4,
  W = 8;
export const strokes: Record<string, number> = {
  "│": 5,
  "─": 10,
  "┌": 6,
  "┐": 12,
  "└": 3,
  "┘": 9,
  "├": 7,
  "┤": 13,
  "┬": 14,
  "┴": 11,
  "┼": 15,
  "═": 10,
  "║": 5,
  "╤": 14,
  "╧": 11,
  "╪": 15,
  "╟": 7,
  "╢": 13,
  "╫": 15,
  "╬": 15,
  // Full double-line boxes.
  "╔": 6,
  "╗": 12,
  "╚": 3,
  "╝": 9,
  "╠": 7,
  "╣": 13,
  "╦": 14,
  "╩": 11,
  // Dashed lines (triple, double and quadruple dash variants).
  "┄": 10,
  "┆": 5,
  "╌": 10,
  "╎": 5,
  "┈": 10,
  "┊": 5,
};
export type LineStyle = "solid" | "dashed" | "double";
const DOUBLE = "═║╔╗╚╝╠╣╦╩╬╤╧╪╟╢╫";
const DASHED = "┄┆╌╎┈┊";
/** The style of a line character, or null for anything else. */
export function styleOf(value: string): LineStyle | null {
  if (!value || !strokes[value]) return null;
  return DOUBLE.includes(value)
    ? "double"
    : DASHED.includes(value)
      ? "dashed"
      : "solid";
}
const doubleGlyphs: Record<number, string> = {
  1: "║",
  4: "║",
  5: "║",
  2: "═",
  8: "═",
  10: "═",
  6: "╔",
  12: "╗",
  3: "╚",
  9: "╝",
  7: "╠",
  13: "╣",
  14: "╦",
  11: "╩",
  15: "╬",
};
/** The glyph joining `mask` in `style`. Dashes have no corners, so those stay solid. */
export function styledGlyph(mask: number, style: LineStyle): string {
  if (style === "double") return doubleGlyphs[mask] ?? "═";
  if (style === "dashed" && (mask === 5 || mask === 1 || mask === 4))
    return "┆";
  if (style === "dashed" && (mask === 10 || mask === 2 || mask === 8))
    return "┄";
  return glyphs[mask] ?? (mask & 5 ? "│" : "─");
}
/** Redraw the line characters at `points` in `style`, keeping their joins. */
export function restyle(grid: Grid, points: Point[], style: LineStyle) {
  for (const p of points) {
    const value = grid.getCell(p.row, p.col);
    if (styleOf(value) && styleOf(value) !== style)
      grid.setCell(p.row, p.col, styledGlyph(strokes[value], style));
  }
}
/** A shape's style: dashed or double if any of its cells are (dashed corners are solid). */
export function shapeStyle(grid: Grid, points: Point[]): LineStyle | null {
  const styles = points.map((p) => styleOf(grid.getCell(p.row, p.col)));
  return styles.includes("double")
    ? "double"
    : styles.includes("dashed")
      ? "dashed"
      : styles.includes("solid")
        ? "solid"
        : null;
}
export const nextLineStyle = (style: LineStyle): LineStyle =>
  style === "solid" ? "dashed" : style === "dashed" ? "double" : "solid";
const glyphs: Record<number, string> = {
  1: "│",
  2: "─",
  4: "│",
  8: "─",
  5: "│",
  10: "─",
  6: "┌",
  12: "┐",
  3: "└",
  9: "┘",
  7: "├",
  13: "┤",
  14: "┬",
  11: "┴",
  15: "┼",
};
export const samePoint = (a: Point, b: Point) =>
  a.row === b.row && a.col === b.col;
export const bounds = (points: Point[]): Rect => ({
  startRow: Math.min(...points.map((p) => p.row)),
  startCol: Math.min(...points.map((p) => p.col)),
  endRow: Math.max(...points.map((p) => p.row)),
  endCol: Math.max(...points.map((p) => p.col)),
});
export const inside = (p: Point, r: Rect) =>
  p.row >= r.startRow &&
  p.row <= r.endRow &&
  p.col >= r.startCol &&
  p.col <= r.endCol;
export function rasterLine(a: Point, b: Point): Point[] {
  const result: Point[] = [];
  let x = a.col,
    y = a.row;
  const dx = Math.abs(b.col - x),
    dy = -Math.abs(b.row - y),
    sx = x < b.col ? 1 : -1,
    sy = y < b.row ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    result.push({ row: y, col: x });
    if (x === b.col && y === b.row) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return result;
}
export function route(a: Point, b: Point, verticalFirst = false): Point[] {
  const bend = verticalFirst
    ? { row: b.row, col: a.col }
    : { row: a.row, col: b.col };
  return [...rasterLine(a, bend), ...rasterLine(bend, b).slice(1)];
}
function direction(a: Point, b: Point) {
  return b.row < a.row ? N : b.row > a.row ? S : b.col < a.col ? W : E;
}
export function drawPath(
  grid: Grid,
  points: Point[],
  arrow = false,
  join = true,
  doubleAxis?: "horizontal" | "vertical",
) {
  const masks = new Map<string, { point: Point; mask: number }>();
  points.forEach((p, i) => {
    let mask = 0;
    if (i) mask |= direction(p, points[i - 1]);
    if (i + 1 < points.length) mask |= direction(p, points[i + 1]);
    const key = Grid.key(p.row, p.col);
    mask |=
      masks.get(key)?.mask ??
      (join ? (strokes[grid.getCell(p.row, p.col)] ?? 0) : 0);
    masks.set(key, { point: p, mask });
  });
  for (const { point: p, mask } of masks.values()) {
    const old = join ? grid.getCell(p.row, p.col) : "";
    // Joining a full double-line box keeps its corners and junctions double.
    if (!doubleAxis && old && "╔╗╚╝╠╣╦╩".includes(old)) {
      grid.setCell(p.row, p.col, styledGlyph(mask, "double"));
      continue;
    }
    const horizontal =
      doubleAxis === "horizontal" || ("═╤╧╪╬".includes(old) && old !== "");
    const vertical =
      doubleAxis === "vertical" || ("║╟╢╫╬".includes(old) && old !== "");
    const h: Record<number, string> = {
      2: "═",
      8: "═",
      10: "═",
      14: "╤",
      11: "╧",
      15: "╪",
    };
    const v: Record<number, string> = {
      1: "║",
      4: "║",
      5: "║",
      7: "╟",
      13: "╢",
      15: "╫",
    };
    grid.setCell(
      p.row,
      p.col,
      horizontal && vertical
        ? "╬"
        : horizontal
          ? (h[mask] ?? glyphs[mask])
          : vertical
            ? (v[mask] ?? glyphs[mask])
            : (glyphs[mask] ?? "─"),
    );
  }
  if (arrow && points.length > 1) {
    const tip = points[points.length - 1];
    // A connector endpoint must always retain its direction, including on borders.
    grid.setCell(tip.row, tip.col, tipGlyph(tip, points[points.length - 2]));
  }
}
const TIPS = "►◄▼▲";
export const isTip = (value: string) => value !== "" && TIPS.includes(value);
/** The head at `tip`, pointing away from the neighbouring path cell. */
function tipGlyph(tip: Point, previous: Point) {
  return tip.row > previous.row
    ? "▼"
    : tip.row < previous.row
      ? "▲"
      : tip.col > previous.col
        ? "►"
        : "◄";
}
export type ArrowHeads = { start: boolean; end: boolean };
/** Add or remove heads at a connector's two endpoints, leaving its body alone. */
export type HeadShape = "arrow" | "bar";
/** The T-bar end at `p`: a stem back toward `previous` and a perpendicular bar, e.g. ─┤. */
function barMask(p: Point, previous: Point) {
  const stem = direction(p, previous);
  return stem | (stem & (N | S) ? E | W : N | S);
}
function barGlyph(grid: Grid, p: Point, previous: Point) {
  // Match the line's style, so a double line ends in ╣ rather than ┤.
  const style = styleOf(grid.getCell(previous.row, previous.col)) ?? "solid";
  return styledGlyph(
    barMask(p, previous),
    style === "dashed" ? "solid" : style,
  );
}
/** The head at a connector end, if any. */
export function headAt(
  grid: Grid,
  p: Point,
  previous: Point,
): HeadShape | null {
  const value = grid.getCell(p.row, p.col);
  if (isTip(value)) return "arrow";
  if (strokes[value] !== barMask(p, previous)) return null;
  // A T bar's arms end freely; if a line continues from them, this is a
  // junction where the connector meets that line (───┬───), not a head.
  const arms: [number, number, number][] =
    direction(p, previous) & (N | S)
      ? [
          [0, -1, E],
          [0, 1, W],
        ]
      : [
          [-1, 0, S],
          [1, 0, N],
        ];
  for (const [dr, dc, back] of arms)
    if ((strokes[grid.getCell(p.row + dr, p.col + dc)] ?? 0) & back)
      return null;
  return "bar";
}
const headGlyph = (grid: Grid, p: Point, previous: Point, shape: HeadShape) =>
  shape === "arrow" ? tipGlyph(p, previous) : barGlyph(grid, p, previous);
/** The shape new heads should take: T bars if the connector already has one. */
export function headShape(grid: Grid, points: Point[]): HeadShape {
  const ends = [
    headAt(grid, points[0], points[1]),
    headAt(grid, points[points.length - 1], points[points.length - 2]),
  ];
  return ends.includes("bar") && !ends.includes("arrow") ? "bar" : "arrow";
}
/** Swap every head between an arrowhead and a T bar. */
export function toggleHeadShape(grid: Grid, points: Point[]) {
  if (points.length < 2) return;
  const next: HeadShape = headShape(grid, points) === "arrow" ? "bar" : "arrow";
  const ends: [Point, Point][] = [
    [points[0], points[1]],
    [points[points.length - 1], points[points.length - 2]],
  ];
  for (const [p, previous] of ends)
    if (headAt(grid, p, previous))
      grid.setCell(p.row, p.col, headGlyph(grid, p, previous, next));
}
export function setArrowHeads(
  grid: Grid,
  points: Point[],
  heads: ArrowHeads,
  shape: HeadShape = "arrow",
) {
  if (points.length < 2) return;
  const ends: [Point, Point, boolean][] = [
    [points[0], points[1], heads.start],
    [points[points.length - 1], points[points.length - 2], heads.end],
  ];
  for (const [p, previous, want] of ends) {
    const has = headAt(grid, p, previous) !== null;
    if (want && !has)
      grid.setCell(p.row, p.col, headGlyph(grid, p, previous, shape));
    if (!want && has) {
      // Rejoin any line the head was sitting on, e.g. ──▲── becomes ──┬──.
      let mask = direction(p, previous);
      const around: [number, number, number, number][] = [
        [-1, 0, N, S],
        [1, 0, S, N],
        [0, -1, W, E],
        [0, 1, E, W],
      ];
      for (const [dr, dc, toward, back] of around) {
        const q = { row: p.row + dr, col: p.col + dc };
        if (samePoint(q, previous)) continue;
        if ((strokes[grid.getCell(q.row, q.col)] ?? 0) & back) mask |= toward;
      }
      grid.setCell(p.row, p.col, glyphs[mask] ?? (mask & 5 ? "│" : "─"));
    }
  }
}
export type HeadEnd = "start" | "end";
/** A connector oriented from its top-left endpoint, so ends are stable. */
export function orientConnector(points: Point[]): Point[] {
  const a = points[0],
    b = points[points.length - 1];
  return a.row < b.row || (a.row === b.row && a.col <= b.col)
    ? points
    : [...points].reverse();
}
export function arrowHeads(grid: Grid, points: Point[]): ArrowHeads {
  return {
    start: headAt(grid, points[0], points[1]) !== null,
    end:
      headAt(grid, points[points.length - 1], points[points.length - 2]) !==
      null,
  };
}
/**
 * Step a connector's heads from `origin` (the end its single head started on):
 * the other end → both ends → back to the origin.
 */
export function cycleArrowHeads(
  grid: Grid,
  points: Point[],
  origin: HeadEnd,
): ArrowHeads {
  const other: HeadEnd = origin === "start" ? "end" : "start";
  const heads = arrowHeads(grid, points);
  const only = (end: HeadEnd) =>
    heads[end] && !heads[end === "start" ? "end" : "start"];
  const next: ArrowHeads = only(origin)
    ? { start: other === "start", end: other === "end" }
    : only(other)
      ? { start: true, end: true }
      : { start: origin === "start", end: origin === "end" };
  setArrowHeads(grid, points, next, headShape(grid, points));
  return next;
}
export function boxPoints(r: Rect): Point[] {
  const a = { row: r.startRow, col: r.startCol },
    b = { row: r.startRow, col: r.endCol },
    c = { row: r.endRow, col: r.endCol },
    d = { row: r.endRow, col: r.startCol };
  if (r.startRow === r.endRow || r.startCol === r.endCol)
    return rasterLine(a, c);
  return [
    ...rasterLine(a, b),
    ...rasterLine(b, c).slice(1),
    ...rasterLine(c, d).slice(1),
    ...rasterLine(d, a).slice(1),
  ];
}
export function drawBox(grid: Grid, r: Rect) {
  drawPath(grid, boxPoints(r));
}
export type Shape =
  { kind: "box"; rect: Rect } | { kind: "arrow"; points: Point[] };
export function recognizeShape(grid: Grid, rect: Rect): Shape | null {
  const { startRow: t, startCol: l, endRow: b, endCol: r } = rect;
  const has = (row: number, col: number, mask: number) =>
    ((strokes[grid.getCell(row, col)] ?? 0) & mask) === mask ||
    ("►◄▼▲".includes(grid.getCell(row, col)) && grid.getCell(row, col) !== "");
  if (
    b - t >= 2 &&
    r - l >= 2 &&
    has(t, l, 6) &&
    has(t, r, 12) &&
    has(b, l, 3) &&
    has(b, r, 9) &&
    rasterLine({ row: t, col: l + 1 }, { row: t, col: r - 1 }).every((p) =>
      has(p.row, p.col, 10),
    ) &&
    rasterLine({ row: b, col: l + 1 }, { row: b, col: r - 1 }).every((p) =>
      has(p.row, p.col, 10),
    ) &&
    rasterLine({ row: t + 1, col: l }, { row: b - 1, col: l }).every((p) =>
      has(p.row, p.col, 5),
    ) &&
    rasterLine({ row: t + 1, col: r }, { row: b - 1, col: r }).every((p) =>
      has(p.row, p.col, 5),
    )
  )
    return { kind: "box", rect };
  const cells: Point[] = [];
  grid.forEachCell((p) => {
    if (inside(p, rect)) cells.push(p);
  });
  const neighbours = (p: Point) =>
    cells.filter(
      (q) => Math.abs(q.row - p.row) + Math.abs(q.col - p.col) === 1,
    );
  // A connector starts at an arrowhead, or at a T-bar end (─┤) with one neighbour.
  const tip =
    cells.find((p) => isTip(grid.getCell(p.row, p.col))) ??
    cells.find((p) => {
      const next = neighbours(p);
      return next.length === 1 && headAt(grid, p, next[0]) === "bar";
    });
  if (
    !tip ||
    cells.some(
      (p) =>
        !strokes[grid.getCell(p.row, p.col)] &&
        !isTip(grid.getCell(p.row, p.col)),
    )
  )
    return null;
  const visited = new Set<string>(),
    points: Point[] = [];
  let current = tip;
  while (current) {
    points.push(current);
    visited.add(Grid.key(current.row, current.col));
    const next = cells.filter(
      (p) =>
        !visited.has(Grid.key(p.row, p.col)) &&
        Math.abs(p.row - current.row) + Math.abs(p.col - current.col) === 1,
    );
    if (next.length > 1) return null;
    current = next[0];
  }
  return points.length === cells.length && points.length > 1
    ? { kind: "arrow", points: points.reverse() }
    : null;
}
export function shapeHandles(shape: Shape | null): Point[] {
  if (!shape) return [];
  if (shape.kind === "arrow")
    return [shape.points[0], shape.points[shape.points.length - 1]];
  const r = shape.rect;
  return [
    { row: r.startRow, col: r.startCol },
    { row: r.startRow, col: r.endCol },
    { row: r.endRow, col: r.endCol },
    { row: r.endRow, col: r.startCol },
  ];
}
export function resizeShape(
  grid: Grid,
  shape: Shape,
  handle: number,
  target: Point,
): Rect {
  if (shape.kind === "box") {
    const old = shape.rect,
      handles = shapeHandles(shape),
      anchor = handles[(handle + 2) % 4];
    const rect = bounds([anchor, target]);
    // Keep every label cell inside the resized border.
    let fits =
      rect.endRow - rect.startRow >= 2 && rect.endCol - rect.startCol >= 2;
    grid.forEachCell((p) => {
      if (
        p.row > old.startRow &&
        p.row < old.endRow &&
        p.col > old.startCol &&
        p.col < old.endCol &&
        !(
          p.row > rect.startRow &&
          p.row < rect.endRow &&
          p.col > rect.startCol &&
          p.col + Math.max(1, charWidth(p.value)) <= rect.endCol
        )
      )
        fits = false;
    });
    if (!fits) return old;
    const style = shapeStyle(grid, boxPoints(old)) ?? "solid";
    boxPoints(old).forEach((p) => grid.setCell(p.row, p.col, ""));
    drawBox(grid, rect);
    if (style !== "solid") restyle(grid, boxPoints(rect), style);
    return rect;
  }
  const points = shape.points;
  const vertices = points.filter(
    (p, i) =>
      i === 0 ||
      i === points.length - 1 ||
      direction(points[i - 1], p) !== direction(p, points[i + 1]),
  );
  vertices[handle === 0 ? 0 : vertices.length - 1] = target;
  const style = shapeStyle(grid, points) ?? "solid";
  const heads = arrowHeads(grid, points),
    ends = headShape(grid, points);
  points.forEach((p) => grid.setCell(p.row, p.col, ""));
  let path: Point[] = [];
  for (let i = 1; i < vertices.length; i++)
    path.push(
      ...route(
        vertices[i - 1],
        vertices[i],
        i === 1 && points[0].col === points[1].col,
      ).slice(i === 1 ? 0 : 1),
    );
  drawPath(grid, path, heads.end && ends === "arrow");
  setArrowHeads(grid, path, heads, ends);
  if (style !== "solid") restyle(grid, path, style);
  return bounds(path);
}
