import { Point } from "../model/Drawing";
import { Grid } from "../model/Grid";
import { DragPreview, Selection } from "../tools/SelectTool";

export type CanvasTheme = {
  background: string;
  foreground: string;
  grid: string;
};

export type CanvasRendererOptions = {
  cellWidth: number;
  cellHeight: number;
  fontFamily: string;
  fontSize: number;
  showGrid: boolean;
};

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: Grid;
  private options: CanvasRendererOptions;
  private theme: CanvasTheme;
  private hover: { point: Point; char: string; size: number } | null = null;
  private handles: Point[] = [];
  private cleanPreview = false;
  private frame: number | null = null;
  private disposed = false;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;
  private resolutionQuery: MediaQueryList | null = null;
  private readonly onResolutionChange = () => {
    this.resize(this.width, this.height);
    this.watchResolution();
    this.render();
  };
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private selection: Selection | null = null;
  private textCursor: { row: number; col: number } | null = null;
  private dragPreview: DragPreview | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    grid: Grid,
    options: CanvasRendererOptions,
    theme: CanvasTheme,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context not available");

    this.canvas = canvas;
    this.ctx = ctx;
    this.grid = grid;
    this.options = options;
    this.theme = theme;

    this.applyFont();
    this.watchResolution();
  }

  private get win() {
    // Pop-out windows own their canvas; fall back for detached canvases.
    return this.canvas.ownerDocument?.defaultView ?? window;
  }

  private watchResolution() {
    this.resolutionQuery?.removeEventListener(
      "change",
      this.onResolutionChange,
    );
    this.resolutionQuery = null;
    // Resolution tracking is an enhancement; never fail to open the editor.
    if (typeof this.win.matchMedia !== "function") return;
    this.resolutionQuery = this.win.matchMedia(
      `(resolution: ${this.win.devicePixelRatio}dppx)`,
    );
    this.resolutionQuery.addEventListener("change", this.onResolutionChange);
  }

  setGrid(grid: Grid) {
    this.grid = grid;
  }

  setTheme(theme: CanvasTheme) {
    this.theme = theme;
  }

  setOptions(options: Partial<CanvasRendererOptions>) {
    this.options = { ...this.options, ...options };
    this.applyFont();
  }

  setPan(x: number, y: number) {
    this.panX = x;
    this.panY = y;
  }

  setZoom(zoom: number) {
    this.zoom = Math.max(0.2, Math.min(3, zoom));
  }

  getPan() {
    return { x: this.panX, y: this.panY };
  }

  getZoom() {
    return this.zoom;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixelRatio = this.win.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(height * this.pixelRatio));
    // Keep an exact physical-pixel ratio instead of stretching a rounded bitmap.
    this.canvas.style.width = `${this.canvas.width / this.pixelRatio}px`;
    this.canvas.style.height = `${this.canvas.height / this.pixelRatio}px`;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.applyFont();
  }

  render() {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      this.draw();
    });
  }

  dispose() {
    this.disposed = true;
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.resolutionQuery?.removeEventListener(
      "change",
      this.onResolutionChange,
    );
    this.frame = null;
  }

  private draw() {
    const { cellWidth, cellHeight, showGrid } = this.options;
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width / this.pixelRatio;
    const canvasHeight = this.canvas.height / this.pixelRatio;

    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = this.theme.background || "#1e1e1e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    if (showGrid && !this.cleanPreview) {
      ctx.strokeStyle = this.theme.grid || "#333";
      ctx.lineWidth = 1 / (this.pixelRatio * this.zoom);
      ctx.beginPath();
      const snap = (value: number, pan: number) =>
        ((Math.floor((value * this.zoom + pan) * this.pixelRatio) + 0.5) /
          this.pixelRatio -
          pan) /
        this.zoom;

      const startCol = Math.max(
        0,
        Math.floor(-this.panX / (cellWidth * this.zoom)),
      );
      const startRow = Math.max(
        0,
        Math.floor(-this.panY / (cellHeight * this.zoom)),
      );
      const cols = Math.ceil(
        (canvasWidth - this.panX) / (cellWidth * this.zoom),
      );
      const rows = Math.ceil(
        (canvasHeight - this.panY) / (cellHeight * this.zoom),
      );

      for (let c = startCol; c <= cols; c += 1) {
        const x = snap(c * cellWidth, this.panX);
        ctx.moveTo(x, startRow * cellHeight);
        ctx.lineTo(x, rows * cellHeight);
      }

      for (let r = startRow; r <= rows; r += 1) {
        const y = snap(r * cellHeight, this.panY);
        ctx.moveTo(startCol * cellWidth, y);
        ctx.lineTo(cols * cellWidth, y);
      }

      ctx.stroke();
    }

    ctx.fillStyle = this.theme.foreground || "#e0e0e0";
    const { rows, cols } = this.grid.getSize();

    this.grid.forEachCell(({ row, col, value }) => {
      if (row >= rows || col >= cols) return;
      const x = col * cellWidth;
      const y = row * cellHeight + cellHeight - 4;
      if (
        x * this.zoom + this.panX > canvasWidth ||
        y * this.zoom + this.panY < 0 ||
        (y - cellHeight) * this.zoom + this.panY > canvasHeight ||
        (x + 2 * cellWidth) * this.zoom + this.panX < 0
      )
        return;
      ctx.fillText(value, x, y);
    });

    if (this.cleanPreview) {
      ctx.restore();
      return;
    }
    if (this.hover) {
      const { point, char, size } = this.hover,
        radius = Math.floor(size / 2);
      ctx.fillStyle = "rgba(100,150,255,0.16)";
      ctx.fillRect(
        (point.col - radius) * cellWidth,
        (point.row - radius) * cellHeight,
        cellWidth * size,
        cellHeight * size,
      );
      if (char) {
        ctx.fillStyle = this.theme.foreground;
        ctx.globalAlpha = 0.5;
        ctx.fillText(
          char,
          point.col * cellWidth,
          (point.row + 1) * cellHeight - 4,
        );
        ctx.globalAlpha = 1;
      }
    }
    // Draw selection highlight
    if (this.selection) {
      const { startRow, startCol, endRow, endCol } = this.selection;
      const x = startCol * cellWidth;
      const y = startRow * cellHeight;
      const w = (endCol - startCol + 1) * cellWidth;
      const h = (endRow - startRow + 1) * cellHeight;
      ctx.fillStyle = "rgba(100, 150, 255, 0.2)";
      if (this.selection.cells) {
        for (const p of this.selection.cells)
          ctx.fillRect(
            p.col * cellWidth,
            p.row * cellHeight,
            cellWidth,
            cellHeight,
          );
      } else ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(100, 150, 255, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    }

    // Draw drag preview overlay
    if (this.dragPreview) {
      const {
        grid: previewGrid,
        targetRow,
        targetCol,
        sourceSelection,
        copyMode,
      } = this.dragPreview;
      // Dim the source region (move mode only)
      if (!copyMode) {
        const sx = sourceSelection.startCol * cellWidth;
        const sy = sourceSelection.startRow * cellHeight;
        const sw =
          (sourceSelection.endCol - sourceSelection.startCol + 1) * cellWidth;
        const sh =
          (sourceSelection.endRow - sourceSelection.startRow + 1) * cellHeight;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(sx, sy, sw, sh);
      }
      // Red cells show existing content that the opaque paste will replace.
      const previewSize = previewGrid.getSize();
      for (let r = 0; r < previewSize.rows; r++)
        for (let c = 0; c < previewSize.cols; c++) {
          if (this.dragPreview.opaque === false && !previewGrid.getCell(r, c))
            continue;
          const old = this.grid.getCell(targetRow + r, targetCol + c);
          ctx.fillStyle = old ? "rgba(255,90,90,0.35)" : this.theme.background;
          ctx.fillRect(
            (targetCol + c) * cellWidth,
            (targetRow + r) * cellHeight,
            cellWidth,
            cellHeight,
          );
        }
      // Draw preview characters at target position
      ctx.fillStyle = this.theme.foreground || "#e0e0e0";
      previewGrid.forEachCell(({ row, col, value }) => {
        const x = (targetCol + col) * cellWidth;
        const y = (targetRow + row) * cellHeight + cellHeight - 4;
        ctx.fillText(value, x, y);
      });
      // Draw preview border
      const { rows: pRows, cols: pCols } = previewGrid.getSize();
      const px = targetCol * cellWidth;
      const py = targetRow * cellHeight;
      const pw = pCols * cellWidth;
      const ph = pRows * cellHeight;
      ctx.strokeStyle = copyMode
        ? "rgba(100, 255, 100, 0.7)"
        : "rgba(100, 150, 255, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(px, py, pw, ph);
      ctx.setLineDash([]);
    }

    // Draw text cursor (blinking line)
    if (this.textCursor) {
      const { row, col } = this.textCursor;
      const x = col * cellWidth;
      const y = row * cellHeight;
      ctx.fillStyle = this.theme.foreground || "#e0e0e0";
      ctx.fillRect(x, y, 2, cellHeight);
    }

    for (const p of this.handles) {
      const size = 7 / this.zoom;
      ctx.fillStyle = this.theme.background;
      ctx.strokeStyle = "#6496ff";
      ctx.fillRect(
        (p.col + 0.5) * cellWidth - size / 2,
        (p.row + 0.5) * cellHeight - size / 2,
        size,
        size,
      );
      ctx.strokeRect(
        (p.col + 0.5) * cellWidth - size / 2,
        (p.row + 0.5) * cellHeight - size / 2,
        size,
        size,
      );
    }
    ctx.restore();
  }

  setHover(point: Point | null, char = "", size = 1) {
    this.hover = point ? { point, char, size } : null;
  }
  setHandles(points: Point[]) {
    this.handles = points;
  }
  setCleanPreview(value: boolean) {
    this.cleanPreview = value;
  }

  setSelection(sel: Selection | null) {
    this.selection = sel;
  }

  setDragPreview(preview: DragPreview | null) {
    this.dragPreview = preview;
  }

  setTextCursor(cursor: { row: number; col: number } | null) {
    this.textCursor = cursor;
  }

  private applyFont() {
    const { fontFamily, fontSize } = this.options;
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textBaseline = "alphabetic";
  }
}
