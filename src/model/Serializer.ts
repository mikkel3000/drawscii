import { Grid } from "./Grid";
import { charWidth } from "./CharWidth";

export function gridFromText(text: string, minRows = 40, minCols = 120): Grid {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rows = Math.max(lines.length, minRows, 1);
  const cols = Math.max(
    ...lines.map((line) => {
      let w = 0;
      for (const ch of Array.from(line)) {
        w += charWidth(ch);
      }
      return w;
    }),
    minCols,
    1,
  );
  const grid = new Grid(rows, cols);

  lines.forEach((line, row) => {
    let col = 0;
    for (const ch of Array.from(line)) {
      if (ch !== " ") {
        grid.setCell(row, col, ch);
      }
      col += charWidth(ch);
    }
  });

  return grid;
}

export function gridToText(grid: Grid): string {
  const rows = new Map<number, { col: number; value: string }[]>();
  let lastRow = -1;
  grid.forEachCell(({ row, col, value }) => {
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push({ col, value });
    lastRow = Math.max(lastRow, row);
  });
  const lines: string[] = [];
  for (let row = 0; row <= lastRow; row++) {
    let line = "",
      nextCol = 0;
    for (const { col, value } of (rows.get(row) ?? []).sort(
      (a, b) => a.col - b.col,
    )) {
      if (col < nextCol) continue;
      line += " ".repeat(col - nextCol) + value;
      nextCol = col + Math.max(1, charWidth(value));
    }
    lines.push(line.replace(/\s+$/g, ""));
  }
  return lines.join("\n").replace(/\n+$/g, "");
}

/** Crop surrounding whitespace for display, copying and export; notes keep the drawn coordinates. */
export function drawingPreviewText(text: string): string {
  const grid = gridFromText(text, 1, 1);
  let top = Infinity,
    left = Infinity;
  grid.forEachCell((p) => {
    top = Math.min(top, p.row);
    left = Math.min(left, p.col);
  });
  if (!Number.isFinite(top)) return "";
  const cropped = new Grid(1, 1);
  grid.forEachCell((p) => cropped.setCell(p.row - top, p.col - left, p.value));
  return gridToText(cropped);
}
