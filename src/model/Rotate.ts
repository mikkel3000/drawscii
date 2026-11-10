import { charWidth } from "./CharWidth";
import { Grid } from "./Grid";

/** Each glyph turned 90° clockwise; the inverse turns it counter-clockwise. */
const clockwise: Record<string, string> = {
  "│": "─",
  "─": "│",
  "┌": "┐",
  "┐": "┘",
  "┘": "└",
  "└": "┌",
  "├": "┬",
  "┬": "┤",
  "┤": "┴",
  "┴": "├",
  "┼": "┼",
  "║": "═",
  "═": "║",
  "╤": "╢",
  "╢": "╧",
  "╧": "╟",
  "╟": "╤",
  "╪": "╫",
  "╫": "╪",
  "╬": "╬",
  "╔": "╗",
  "╗": "╝",
  "╝": "╚",
  "╚": "╔",
  "╠": "╦",
  "╦": "╣",
  "╣": "╩",
  "╩": "╠",
  "┄": "┆",
  "┆": "┄",
  "╌": "╎",
  "╎": "╌",
  "┈": "┊",
  "┊": "┈",
  "►": "▼",
  "▼": "◄",
  "◄": "▲",
  "▲": "►",
};
const counterClockwise = Object.fromEntries(
  Object.entries(clockwise).map(([from, to]) => [to, from]),
);
const isGlyph = (value: string) => value in clockwise;

type Cell = { row: number; col: number; value: string };

/**
 * Text cells grouped into runs in reading order: horizontal words (single
 * spaces bridged) and vertical stacks left by an earlier rotation.
 */
function textRuns(grid: Grid): Cell[][] {
  const text = new Map<string, Cell>();
  grid.forEachCell((p) => {
    if (!isGlyph(p.value)) text.set(Grid.key(p.row, p.col), p);
  });
  const at = (row: number, col: number) => text.get(Grid.key(row, col));
  const used = new Set<string>();
  const runs: Cell[][] = [];
  const sorted = [...text.values()].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );
  for (const cell of sorted) {
    if (used.has(Grid.key(cell.row, cell.col))) continue;
    const run = [cell];
    let col = cell.col + Math.max(1, charWidth(cell.value));
    for (;;) {
      const next = at(cell.row, col) ?? at(cell.row, col + 1);
      if (!next || used.has(Grid.key(next.row, next.col))) break;
      run.push(next);
      col = next.col + Math.max(1, charWidth(next.value));
    }
    if (run.length === 1) {
      // A lone character may start a vertical stack.
      for (let row = cell.row + 1; ; row++) {
        const below = at(row, cell.col);
        if (
          !below ||
          at(row, cell.col - 1) ||
          at(row, cell.col + 1) ||
          used.has(Grid.key(below.row, below.col))
        )
          break;
        run.push(below);
      }
    }
    for (const p of run) used.add(Grid.key(p.row, p.col));
    runs.push(run);
  }
  return runs;
}

/**
 * Rotate a captured region 90°. Lines, corners, junctions and arrowheads are
 * remapped; text stays readable, re-centred horizontally where it fits and
 * stacked vertically where it does not.
 */
export function rotateGrid(source: Grid, turnClockwise = true): Grid {
  const { rows: h, cols: w } = source.getSize();
  const map = turnClockwise ? clockwise : counterClockwise;
  const turn = (row: number, col: number) =>
    turnClockwise
      ? { row: col, col: h - 1 - row }
      : { row: w - 1 - col, col: row };
  const out = new Grid(w, h);
  source.forEachCell(({ row, col, value }) => {
    if (!isGlyph(value)) return;
    const p = turn(row, col);
    out.setCell(p.row, p.col, map[value]);
  });
  const free = (row: number, col: number) => !out.getCell(row, col);
  for (const run of textRuns(source)) {
    const horizontal = run.length > 1 && run[0].row === run[1].row;
    const turned = run.map((p) => turn(p.row, p.col));
    if (horizontal) {
      // Keep the word readable: centre it on its turned midpoint.
      const first = run[0],
        last = run[run.length - 1];
      const width = last.col + Math.max(1, charWidth(last.value)) - first.col;
      const mid = turn(first.row, first.col + (width - 1) / 2);
      const row = Math.round(mid.row),
        start = Math.round(mid.col - (width - 1) / 2);
      const cols = run.map((p) => start + (p.col - first.col));
      const fits =
        start >= 0 &&
        start + width <= h &&
        run.every((p, i) => {
          for (let c = 0; c < Math.max(1, charWidth(p.value)); c++)
            if (!free(row, cols[i] + c)) return false;
          return true;
        });
      if (fits) {
        run.forEach((p, i) => out.setCell(row, cols[i], p.value));
        continue;
      }
    }
    // Stacked text (or a word that no longer fits): keep reading order along
    // the turned line, top-to-bottom or left-to-right.
    const order = [...turned].sort((a, b) => a.row - b.row || a.col - b.col);
    run.forEach((p, i) => out.setCell(order[i].row, order[i].col, p.value));
  }
  return out;
}
