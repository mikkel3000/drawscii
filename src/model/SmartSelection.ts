import { Grid } from "./Grid";
import {
  bounds,
  inside,
  Point,
  Rect,
  recognizeShape,
  strokes,
} from "./Drawing";
export const isBorder = (value: string) =>
  !!strokes[value] || ("►◄▼▲".includes(value) && value !== "");
export function boxes(grid: Grid): Rect[] {
  const corners: Point[] = [];
  grid.forEachCell((p) => {
    if ((strokes[p.value] & 6) === 6) corners.push(p);
  });
  const result: Rect[] = [];
  for (const a of corners) {
    const ends: Point[] = [];
    grid.forEachCell((p) => {
      if (p.row > a.row && p.col > a.col && (strokes[p.value] & 9) === 9)
        ends.push(p);
    });
    for (const b of ends) {
      const rect = bounds([a, b]);
      if (recognizeShape(grid, rect)?.kind === "box") result.push(rect);
    }
  }
  return result.sort(
    (a, b) =>
      (a.endRow - a.startRow) * (a.endCol - a.startCol) -
      (b.endRow - b.startRow) * (b.endCol - b.startCol),
  );
}
export function enclosingBox(grid: Grid, point: Point) {
  return boxes(grid).find((r) => inside(point, r)) ?? null;
}
export type SelectedCell = Point & { value?: string; restore?: string };
export type SmartRegion = Rect & { cells?: SelectedCell[]; multi?: boolean };
export function smartRegion(grid: Grid, point: Point): SmartRegion | null {
  const value = grid.getCell(point.row, point.col);
  if (!value) return null;
  if (!isBorder(value) && !/[\p{L}\p{N}]/u.test(value)) {
    const stack = [point],
      seen = new Set<string>(),
      cells: Point[] = [];
    while (stack.length) {
      const p = stack.pop()!,
        key = Grid.key(p.row, p.col);
      if (seen.has(key)) continue;
      seen.add(key);
      const ch = grid.getCell(p.row, p.col);
      if (!ch || isBorder(ch)) continue;
      cells.push(p);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) stack.push({ row: p.row + dr, col: p.col + dc });
    }
    return cells.length ? { ...bounds(cells), cells } : null;
  }
  if (!isBorder(value)) {
    // Treat a line of text as a label, keeping adjacent box strokes out.
    let left = point.col,
      right = point.col;
    const textAt = (col: number) => {
      const ch = grid.getCell(point.row, col);
      return !!ch && !isBorder(ch);
    };
    while (
      left > 0 &&
      (textAt(left - 1) ||
        (!grid.getCell(point.row, left - 1) && left > 1 && textAt(left - 2)))
    )
      left--;
    while (
      textAt(right + 1) ||
      (!grid.getCell(point.row, right + 1) && textAt(right + 2))
    )
      right++;
    const cells: Point[] = [];
    for (let col = left; col <= right; col++)
      if (textAt(col)) cells.push({ row: point.row, col });
    return { ...bounds(cells), cells };
  }
  const allBoxes = boxes(grid);
  const boundary = (p: Point, r: Rect) =>
    inside(p, r) &&
    (p.row === r.startRow ||
      p.row === r.endRow ||
      p.col === r.startCol ||
      p.col === r.endCol);
  const borderMask = (p: Point, r: Rect) => {
    if (p.row === r.startRow)
      return p.col === r.startCol ? 6 : p.col === r.endCol ? 12 : 10;
    if (p.row === r.endRow)
      return p.col === r.startCol ? 3 : p.col === r.endCol ? 9 : 10;
    return 5;
  };
  const glyph = (mask: number) =>
    Object.keys(strokes).find((ch) => strokes[ch] === mask) ??
    (mask & 5 ? "│" : "─");
  const masks = (p: Point) => {
    const ch = grid.getCell(p.row, p.col);
    return (
      strokes[ch] ??
      ("►◄".includes(ch) && ch ? 10 : "▼▲".includes(ch) && ch ? 5 : 0)
    );
  };
  const box = allBoxes.find((r) => boundary(point, r));
  const arrow = "►◄▼▲".includes(value);
  if (box && !arrow && !(masks(point) & ~borderMask(point, box))) return box;
  // Include attachment cells, but stop traversal at the box perimeter.
  // Keep each cell's original border stroke so moving a connector repairs it.
  // Each entry remembers the direction it was entered from (0 for the click).
  const stack: [Point, number][] = [[point, 0]],
    seen = new Set<string>(),
    crossed = new Set<string>(),
    cells: SelectedCell[] = [];
  // At a crossing, keep only the clicked line's stroke; the other is restored.
  const crossing = (ch: string, vertical: boolean) =>
    vertical ? ("╫╬".includes(ch) ? "║" : "│") : "╪╬".includes(ch) ? "═" : "─";
  const steps = [
    [-1, 0, 1, 4],
    [1, 0, 4, 1],
    [0, -1, 8, 2],
    [0, 1, 2, 8],
  ];
  while (stack.length) {
    const [p, entered] = stack.pop()!,
      key = Grid.key(p.row, p.col);
    if (seen.has(key)) continue;
    const ch = grid.getCell(p.row, p.col);
    if (!isBorder(ch)) continue;
    // Pass straight through a crossing instead of spreading onto the other
    // line. It stays unseen, so the crossing line can pass through it too.
    if (entered && masks(p) === 15 && !allBoxes.some((r) => boundary(p, r))) {
      if (crossed.has(key)) continue;
      crossed.add(key);
      const vertical = !!(entered & 5);
      cells.push({
        ...p,
        value: crossing(ch, vertical),
        restore: crossing(ch, !vertical),
      });
      const [dr, dc] = steps.find(([, , bit]) => bit === entered)!;
      stack.push([{ row: p.row + dr, col: p.col + dc }, entered]);
      continue;
    }
    seen.add(key);
    const attached = allBoxes.find((r) => boundary(p, r));
    if (attached) {
      const base = borderMask(p, attached),
        ch = grid.getCell(p.row, p.col);
      cells.push({
        ...p,
        restore: glyph(base),
        value: "►◄▼▲".includes(ch) ? ch : glyph(masks(p) & ~base),
      });
      if (p.row !== point.row || p.col !== point.col) continue;
    } else cells.push(p);
    for (const [dr, dc, bit, opposite] of steps) {
      const next = { row: p.row + dr, col: p.col + dc };
      if (attached && boundary(next, attached)) continue;
      if (masks(p) & bit && masks(next) & opposite) stack.push([next, bit]);
    }
  }
  return cells.length ? { ...bounds(cells), cells } : null;
}

export function textRegion(grid: Grid, rect: Rect): SmartRegion {
  const cells: Point[] = [];
  let border = false;
  grid.forEachCell((p) => {
    if (inside(p, rect)) {
      if (isBorder(p.value)) border = true;
      else cells.push({ row: p.row, col: p.col });
    }
  });
  if (
    !border ||
    !cells.length ||
    boxes(grid).some(
      (b) =>
        inside({ row: b.startRow, col: b.startCol }, rect) &&
        inside({ row: b.endRow, col: b.endCol }, rect),
    )
  )
    return rect;
  return { ...bounds(cells), cells };
}

/**
 * A drag-selection: every object (label, connector, box, freehand shape) that
 * lies entirely inside `rect`. Objects reaching outside it, such as long
 * lines passing through, are left out. With nothing whole inside, the plain
 * rectangle is kept.
 */
export function containedRegion(grid: Grid, rect: Rect): SmartRegion {
  const within = (p: Point) => inside(p, rect);
  const drawn: Point[] = [];
  grid.forEachCell((p) => {
    if (within(p)) drawn.push({ row: p.row, col: p.col });
  });
  if (!drawn.length) return rect;
  const picked = new Map<string, SelectedCell>();
  const started = new Set<string>();
  const add = (p: SelectedCell) => {
    const key = Grid.key(p.row, p.col),
      had = picked.get(key);
    // Both lines of a crossing are selected: keep the crossing itself.
    if (had && (had.restore !== undefined || p.restore !== undefined))
      picked.set(key, { row: p.row, col: p.col });
    else if (!had) picked.set(key, p);
  };
  const nonEmpty = (r: Rect) => {
    const cells: Point[] = [];
    grid.forEachCell((p) => {
      if (inside(p, r)) cells.push({ row: p.row, col: p.col });
    });
    return cells;
  };
  // Whole boxes, with everything drawn inside them.
  for (const box of boxes(grid)) {
    if (
      !within({ row: box.startRow, col: box.startCol }) ||
      !within({ row: box.endRow, col: box.endCol })
    )
      continue;
    for (const p of nonEmpty(box)) {
      add(p);
      started.add(Grid.key(p.row, p.col));
    }
  }
  // Every other object, found from each cell it has inside the rectangle.
  for (const p of drawn) {
    const key = Grid.key(p.row, p.col);
    if (started.has(key)) continue;
    const region = smartRegion(grid, p);
    if (!region) continue;
    const cells: SelectedCell[] = region.cells ?? nonEmpty(region);
    for (const c of cells) started.add(Grid.key(c.row, c.col));
    if (cells.every(within)) cells.forEach(add);
  }
  if (!picked.size) return rect;
  const cells = [...picked.values()];
  return { ...bounds(cells), cells, multi: true };
}
