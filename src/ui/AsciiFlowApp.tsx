import React, { useEffect, useRef, useState } from "react";
import {
  drawingPreviewText,
  gridFromText,
  gridToText,
} from "../model/Serializer";
import {
  bounds,
  drawPath,
  Point,
  recognizeShape,
  route,
  shapeHandles,
} from "../model/Drawing";
import { CanvasRenderer } from "../renderer/CanvasRenderer";
import { InputHandler } from "../input/InputHandler";
import { BusDirection } from "../tools/BusTool";
import { ToolManager } from "../tools/ToolManager";
import { ToolId, ToolPointerState } from "../tools/ToolTypes";
import { enclosingBox } from "../model/SmartSelection";
import { FigureCatalog } from "./FigureCatalog";
import { Grid } from "../model/Grid";

export type EditorHandle = {
  requestClose: () => void;
  resetTool: () => void;
  getText: () => string;
};
export type AsciiFlowAppProps = {
  initialText: string;
  draft?: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
  onDraft?: (text: string | null) => void;
  onReady?: (handle: EditorHandle) => void;
  /** Outside Obsidian: autosave through onSave and hide the close actions. */
  standalone?: boolean;
};
const toolList: { id: ToolId; label: string; key: string; hint: string }[] = [
  {
    id: "select",
    label: "Select",
    key: "S",
    hint: "Drag to select · Shift-click to add or remove items · Drag inside to move · ⌘/Ctrl-drag to duplicate · Arrow keys nudge · Shift = 10 cells",
  },
  {
    id: "box",
    label: "Box",
    key: "B",
    hint: "Drag a box · Select its border and drag a corner handle to resize",
  },
  {
    id: "line",
    label: "Line",
    key: "L",
    hint: "Drag a connector · Shift switches the bend direction",
  },
  {
    id: "arrow",
    label: "Arrow",
    key: "A",
    hint: "Drag an arrow · Shift switches the bend · Turn on Waypoints for multiple bends",
  },
  {
    id: "bus",
    label: "Bus",
    key: "I",
    hint: "Drag a straight bus · Compact double line or wide rails · Auto locks to your initial drag direction",
  },
  {
    id: "text",
    label: "Text",
    key: "T",
    hint: "Click to type · Enter keeps label alignment · Escape finishes typing · Double-click anywhere to label",
  },
  {
    id: "freeform",
    label: "Draw",
    key: "F",
    hint: "Drag to paint · Hold Alt and click to pick a character",
  },
  {
    id: "eraser",
    label: "Erase",
    key: "E",
    hint: "Drag to erase · Choose a larger brush for larger areas",
  },
];
export function AsciiFlowApp({
  initialText,
  draft,
  onSave,
  onCancel,
  onDraft,
  onReady,
  standalone = false,
}: AsciiFlowAppProps) {
  const [grid] = useState(() => gridFromText(draft ?? initialText));
  const [saved, setSaved] = useState(() =>
    gridToText(gridFromText(initialText)),
  );
  const [revision, setRevision] = useState(0);
  const [smartSelect, setSmartSelect] = useState(true);
  const [tool, setTool] = useState<ToolId>("box");
  const [char, setChar] = useState("*");
  const [busGap, setBusGap] = useState(0);
  const [busDirection, setBusDirection] = useState<BusDirection>("auto");
  const [brush, setBrush] = useState(1);
  const [waypoints, setWaypoints] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [preview, setPreview] = useState(false);
  const [help, setHelp] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    draft !== undefined ? "Recovered your unsaved drawing." : "",
  );
  const [confirm, setConfirm] = useState<"close" | "clear" | null>(null);
  const [cursor, setCursor] = useState<Point>({ row: 0, col: 0 });
  const [pending, setPending] = useState(false);
  const appRef = useRef<HTMLDivElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    textRef = useRef<HTMLTextAreaElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null),
    managerRef = useRef<ToolManager | null>(null);
  const actions = useRef({
    cancel: () => {},
    finish: () => {},
    fit: () => {},
    zoom: (_factor: number) => {},
    paste: (_text: string) => {},
    selectAll: () => {},
    resetTool: () => {},
    duplicate: () => {},
  });
  const text = gridToText(grid),
    dirty = text !== saved;
  const live = useRef({
    tool,
    char,
    brush,
    waypoints,
    saving,
    preview,
    dirty,
    text,
  });
  live.current = { tool, char, brush, waypoints, saving, preview, dirty, text };
  const requestClose = () => {
    if (live.current.saving) return;
    if (live.current.dirty) setConfirm("close");
    else onCancel();
  };
  const save = async (close = false) => {
    if (live.current.saving) return;
    actions.current.finish();
    const snapshot = gridToText(grid);
    live.current.saving = true;
    setSaving(true);
    setError("");
    try {
      await onSave(snapshot);
      setSaved(snapshot);
      live.current.dirty = false;
      live.current.text = snapshot;
      onDraft?.(null);
      setMessage(standalone ? "Saved." : "Saved to your note.");
      if (close) onCancel();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is preserved.",
      );
    } finally {
      live.current.saving = false;
      setSaving(false);
    }
  };
  const callbacks = useRef({ save, requestClose, onDraft });
  callbacks.current = { save, requestClose, onDraft };
  const chooseTool = (next: ToolId) => {
    actions.current.cancel();
    managerRef.current?.getTextTool().deactivate();
    live.current.tool = next;
    setTool(next);
    managerRef.current?.setActiveTool(next);
    rendererRef.current?.setTextCursor(null);
    if (next !== "select") managerRef.current?.getSelectTool().clearSelection();
    canvasRef.current?.focus();
    rendererRef.current?.render();
  };
  const chooseRef = useRef(chooseTool);
  chooseRef.current = chooseTool;
  useEffect(() => {
    onReady?.({
      requestClose: () => callbacks.current.requestClose(),
      resetTool: () => actions.current.resetTool(),
      getText: () => gridToText(grid),
    });
    return () => {
      // Standalone documents flush unsaved work when switching files.
      if (standalone && live.current.dirty)
        void onSave(gridToText(grid)).catch(() => {});
      callbacks.current.onDraft?.(
        !live.current.dirty ? null : gridToText(grid),
      );
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      onDraft?.(dirty ? text : null);
      // Autosave without finishing the active tool, so typing is not interrupted.
      if (standalone && dirty && !live.current.saving)
        void onSave(text).then(
          () => setSaved(text),
          (e) => setError(e instanceof Error ? e.message : "Could not save."),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [text, dirty, onDraft]);

  useEffect(() => {
    const canvas = canvasRef.current!,
      textarea = textRef.current!,
      win = canvas.ownerDocument.defaultView!;
    const style = win.getComputedStyle(canvas);
    const fontFamily =
      style.getPropertyValue("--font-monospace").trim() || "monospace";
    const measure = canvas.getContext("2d")!;
    measure.font = `14px ${fontFamily}`;
    const cellWidth = measure.measureText("M").width || 8.4,
      cellHeight = 18;
    const theme = () => {
      const s = win.getComputedStyle(canvas);
      return {
        background:
          s.getPropertyValue("--background-primary").trim() || "#1e1e1e",
        foreground: s.getPropertyValue("--text-normal").trim() || "#e0e0e0",
        grid:
          s.getPropertyValue("--background-modifier-border").trim() || "#333",
      };
    };
    const renderer = new CanvasRenderer(
      canvas,
      grid,
      { cellWidth, cellHeight, fontFamily, fontSize: 14, showGrid: true },
      theme(),
    );
    rendererRef.current = renderer;
    let hover: Point = { row: 0, col: 0 },
      composing = false,
      gesture = false;
    let duplicateSource: ReturnType<typeof selection.normalized> | null = null;
    let pasteOpaque = true;
    let paste: Grid | null = null,
      vertices: Point[] = [],
      pathBase: Grid | null = null,
      pathPreview: Point[] = [];
    const update = () => {
      const selection = manager.getSelectTool().getSelection();
      renderer.setHandles(
        selection && live.current.tool === "select"
          ? shapeHandles(
              recognizeShape(grid, manager.getSelectTool().normalized()),
            )
          : [],
      );
      renderer.render();
      setRevision((value) => value + 1);
    };
    const manager = new ToolManager(grid, update);
    managerRef.current = manager;
    const selection = manager.getSelectTool(),
      textTool = manager.getTextTool();
    selection.setRenderHighlight((s) => renderer.setSelection(s));
    selection.setClearHighlight(() => renderer.setSelection(null));
    selection.setRenderDragPreview((p) => renderer.setDragPreview(p));
    textTool.setOnCursorChange((row, col) => {
      renderer.setTextCursor(
        row === null || col === null ? null : { row, col },
      );
      if (row !== null && col !== null) setCursor({ row, col });
    });
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
      renderer.render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement!);
    resize();
    const observer = new MutationObserver(() => {
      renderer.setTheme(theme());
      renderer.render();
    });
    observer.observe(canvas.ownerDocument.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const refreshHover = (p: Point | null, shift = false) => {
      if (!p) {
        renderer.setHover(null);
        renderer.render();
        return;
      }
      hover = p;
      setCursor(p);
      if (paste) {
        renderer.setDragPreview({
          grid: paste,
          targetRow: p.row,
          targetCol: p.col,
          copyMode: true,
          opaque: pasteOpaque,
          sourceSelection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        });
      } else if (pathBase && vertices.length) {
        grid.loadFromGrid(pathBase);
        pathPreview = [];
        const all = [...vertices, p];
        for (let i = 1; i < all.length; i++)
          pathPreview.push(
            ...route(all[i - 1], all[i], shift).slice(i === 1 ? 0 : 1),
          );
        drawPath(grid, pathPreview, live.current.tool === "arrow");
      }
      renderer.setHover(
        p,
        live.current.tool === "freeform" ? live.current.char : "",
        live.current.tool === "eraser" ? live.current.brush : 1,
      );
      renderer.render();
    };
    const finishPath = () => {
      if (!pathBase) return;
      const final = grid.clone();
      grid.loadFromGrid(pathBase);
      pathBase = null;
      vertices = [];
      pathPreview = [];
      manager.edit((ctx) => ctx.grid.loadFromGrid(final));
      setPending(false);
    };
    const finishPaste = () => {
      if (!paste) return;
      const content = paste;
      if (duplicateSource) {
        const size = content.getSize(),
          source = duplicateSource;
        if (
          hover.row <= source.endRow &&
          hover.row + size.rows - 1 >= source.startRow &&
          hover.col <= source.endCol &&
          hover.col + size.cols - 1 >= source.startCol
        ) {
          setMessage(
            "Move the duplicate outside the original selection, then click or press Enter.",
          );
          return;
        }
      }
      duplicateSource = null;
      paste = null;
      renderer.setDragPreview(null);
      manager.edit((ctx) =>
        selection.placeGrid(content, hover.row, hover.col, ctx, pasteOpaque),
      );
      setPending(false);
    };
    const cancel = () => {
      if (gesture) manager.cancelGesture();
      gesture = false;
      if (pathBase) grid.loadFromGrid(pathBase);
      pathBase = null;
      vertices = [];
      paste = null;
      duplicateSource = null;
      renderer.setDragPreview(null);
      setPending(false);
      update();
    };
    const zoomAt = (factor: number, x: number, y: number) => {
      const old = renderer.getZoom(),
        pan = renderer.getPan();
      renderer.setZoom(old * factor);
      const ratio = renderer.getZoom() / old;
      renderer.setPan(x - (x - pan.x) * ratio, y - (y - pan.y) * ratio);
      setZoom(Math.round(renderer.getZoom() * 100));
      renderer.render();
    };
    actions.current = {
      cancel,
      resetTool: () => {
        cancel();
        textTool.deactivate();
        selection.clearSelection();
        live.current.tool = "select";
        setTool("select");
        manager.setActiveTool("select");
        setConfirm(null);
        setHelp(false);
        setCatalog(false);
        setPreview(false);
        canvas.focus();
        update();
      },
      finish: () => {
        finishPath();
        finishPaste();
      },
      zoom: (factor) =>
        zoomAt(factor, canvas.clientWidth / 2, canvas.clientHeight / 2),
      fit: () => {
        const b = grid.getBounds(),
          width = (b.endCol + 2) * cellWidth,
          height = (b.endRow + 2) * cellHeight;
        renderer.setZoom(
          Math.min(
            (canvas.clientWidth - 32) / width,
            (canvas.clientHeight - 32) / height,
            1.5,
          ),
        );
        renderer.setPan(16, 16);
        setZoom(Math.round(renderer.getZoom() * 100));
        renderer.render();
      },
      paste: (content) => {
        cancel();
        textTool.deactivate();
        live.current.tool = "select";
        setTool("select");
        manager.setActiveTool("select");
        paste = gridFromText(content, 1, 1);
        pasteOpaque = true;
        setPending(true);
        refreshHover(hover);
        canvas.focus();
      },
      duplicate: () => {
        if (!selection.getSelection()) return;
        const source = selection.normalized();
        let captured: Grid | null = null;
        manager.edit((ctx) => {
          captured = selection.snapshot(ctx);
        });
        if (!captured) return;
        cancel();
        textTool.deactivate();
        live.current.tool = "select";
        setTool("select");
        manager.setActiveTool("select");
        paste = captured;
        duplicateSource = source;
        // Duplicates land transparently, like moves.
        pasteOpaque = false;
        setPending(true);
        refreshHover({ row: source.startRow, col: source.endCol + 2 });
        setMessage(
          "Position the duplicate, then click or press Enter. Escape cancels.",
        );
        canvas.focus();
      },
      selectAll: () => {
        const b = grid.getBounds();
        chooseRef.current("select");
        selection.setSelection({
          startRow: 0,
          startCol: 0,
          endRow: b.endRow,
          endCol: Math.max(0, b.endCol - 1),
        });
        update();
      },
    };
    const input = new InputHandler(canvas, {
      cellWidth,
      cellHeight,
      view: () => ({ ...renderer.getPan(), zoom: renderer.getZoom() }),
      pan: (dx, dy) => {
        const pan = renderer.getPan();
        renderer.setPan(Math.min(32, pan.x + dx), Math.min(32, pan.y + dy));
        renderer.render();
      },
      zoom: zoomAt,
      hover: refreshHover,
      cancel,
      down: (s) => {
        if (live.current.saving || live.current.preview) return;
        hover = s;
        if (paste) {
          finishPaste();
          return;
        }
        if (
          live.current.waypoints &&
          (live.current.tool === "line" || live.current.tool === "arrow")
        ) {
          if (!pathBase) pathBase = grid.clone();
          vertices.push({ row: s.row, col: s.col });
          setPending(true);
          refreshHover(s, !!s.shiftKey);
          return;
        }
        manager.setActiveTool(live.current.tool);
        manager.setFreeformChar(live.current.char);
        manager.setBrushSize(live.current.brush);
        gesture = true;
        manager.handlePointerDown(s);
        setCursor(s);
        if (live.current.tool === "text")
          textarea.focus({ preventScroll: true });
      },
      move: (s) => {
        if (gesture) manager.handlePointerMove(s);
        setCursor(s);
      },
      up: (s) => {
        if (gesture) {
          manager.handlePointerUp(s);
          gesture = false;
          update();
          if (live.current.tool === "text")
            textarea.focus({ preventScroll: true });
        }
      },
    });
    const dblclick = (event: MouseEvent) => {
      if (live.current.preview || live.current.saving) return;
      if (pathBase) {
        finishPath();
        return;
      }
      const p = input.cell(event);
      chooseRef.current("text");
      manager.handlePointerDown({
        ...p,
        startRow: p.row,
        startCol: p.col,
        isDragging: false,
        ctrlKey: false,
      });
      manager.handlePointerUp({
        ...p,
        startRow: p.row,
        startCol: p.col,
        isDragging: false,
        ctrlKey: false,
      });
      textarea.focus({ preventScroll: true });
    };
    const pick = (event: PointerEvent) => {
      if (!event.altKey || live.current.tool !== "freeform") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const p = input.cell(event);
      const value = grid.getCell(p.row, p.col);
      if (value) {
        setChar(value);
        live.current.char = value;
        setMessage(`Picked “${value}”.`);
      }
    };
    canvas.addEventListener("dblclick", dblclick);
    canvas.addEventListener("pointerdown", pick, true);
    const isField = (event: Event) =>
      event.target !== textarea &&
      (event.target as HTMLElement).matches(
        "input,textarea,select,[contenteditable=true]",
      );
    const local = (event: Event) =>
      appRef.current?.contains(event.target as Node);
    const keydown = (event: KeyboardEvent) => {
      if (!local(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        actions.current.resetTool();
        return;
      }
      if (isField(event) || composing || live.current.saving) return;
      const key = event.key.toLowerCase(),
        mod = event.ctrlKey || event.metaKey;
      if (mod && key === "s") {
        event.preventDefault();
        event.stopPropagation();
        void callbacks.current.save(event.shiftKey);
        return;
      }
      if (live.current.preview) return;
      if (mod && (key === "z" || key === "y")) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        if (event.shiftKey || key === "y") manager.redo();
        else manager.undo();
        update();
        return;
      }
      if (mod && key === "a" && !textTool.isActive()) {
        event.preventDefault();
        actions.current.selectAll();
        return;
      }
      if (event.key === "Enter" && (paste || pathBase)) {
        event.preventDefault();
        actions.current.finish();
        return;
      }
      if (textTool.isActive()) {
        if (
          !mod &&
          [
            "Backspace",
            "Delete",
            "Enter",
            "Tab",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          manager.edit(
            (ctx) => textTool.handleKey(event.key, ctx),
            ["Backspace", "Delete"].includes(event.key) ? "delete" : "",
          );
        }
        return;
      }
      if (selection.getSelection() && live.current.tool === "select") {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          manager.edit((ctx) => selection.deleteSelection(ctx));
          return;
        }
        const delta: Record<string, [number, number]> = {
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
        };
        if (delta[event.key]) {
          event.preventDefault();
          const [dr, dc] = delta[event.key],
            step = event.shiftKey ? 10 : 1;
          manager.edit((ctx) =>
            selection.nudge(dr * step, dc * step, ctx, event.altKey),
          );
          return;
        }
        if (mod && key === "d") {
          event.preventDefault();
          event.stopPropagation();
          actions.current.duplicate();
          return;
        }
      }
      if (!mod && !event.altKey) {
        const action: Record<string, () => void> = {
          g: () => {
            cancel();
            setCatalog((value) => !value);
          },
          u: () => {
            cancel();
            manager.undo();
            update();
          },
          r: () => {
            cancel();
            manager.redo();
            update();
          },
          d: () => actions.current.duplicate(),
          c: () => manager.edit((ctx) => selection.centerLabel(ctx)),
          v: () =>
            manager.edit((ctx) =>
              event.shiftKey
                ? selection.toggleHeadShape(ctx)
                : selection.cycleArrowHeads(ctx),
            ),
          w: () => manager.edit((ctx) => selection.cycleLineStyle(ctx)),
          o: () =>
            manager.edit((ctx) => selection.rotate(ctx, !event.shiftKey)),
          x: () => setConfirm("clear"),
        };
        if (action[key]) {
          event.preventDefault();
          event.stopPropagation();
          action[key]();
          return;
        }
        const next = toolList.find((t) => t.key.toLowerCase() === key);
        if (next) {
          event.preventDefault();
          chooseRef.current(next.id);
        } else if (key === "?") setHelp((value) => !value);
        else if (key === "+" || key === "=") actions.current.zoom(1.2);
        else if (key === "-") actions.current.zoom(1 / 1.2);
        else if (key === "0") actions.current.fit();
      }
    };
    const pasteEvent = (event: ClipboardEvent) => {
      if (
        !local(event) ||
        isField(event) ||
        live.current.preview ||
        live.current.saving
      )
        return;
      const content = event.clipboardData?.getData("text/plain");
      if (content === undefined) return;
      event.preventDefault();
      if (textTool.isActive())
        manager.edit((ctx) => textTool.pasteText(content, ctx));
      else actions.current.paste(content);
    };
    const clipboard = (event: ClipboardEvent) => {
      if (
        !local(event) ||
        isField(event) ||
        live.current.saving ||
        live.current.preview ||
        live.current.tool !== "select" ||
        !selection.getSelection() ||
        !event.clipboardData
      )
        return;
      let content: string | null = null;
      manager.edit((ctx) => {
        content = selection.copy(ctx);
      });
      if (content !== null) {
        event.clipboardData.setData("text/plain", content);
        event.preventDefault();
        if (event.type === "cut")
          manager.edit((ctx) => selection.deleteSelection(ctx));
      }
    };
    const acceptText = () => {
      if (composing || !textTool.isActive() || live.current.saving) return;
      const value = textarea.value;
      textarea.value = "";
      if (!value) return;
      manager.edit((ctx) => {
        for (const ch of value) textTool.handleChar(ch, ctx);
      }, "typing");
    };
    const compositionStart = () => {
        composing = true;
      },
      compositionEnd = () => {
        composing = false;
        acceptText();
      };
    textarea.addEventListener("compositionstart", compositionStart);
    textarea.addEventListener("compositionend", compositionEnd);
    textarea.addEventListener("input", acceptText);
    appRef.current!.addEventListener("keydown", keydown);
    appRef.current!.addEventListener("paste", pasteEvent);
    appRef.current!.addEventListener("copy", clipboard);
    appRef.current!.addEventListener("cut", clipboard);
    const app = appRef.current!;
    return () => {
      if (pathBase) grid.loadFromGrid(pathBase);
      input.detach();
      resizeObserver.disconnect();
      observer.disconnect();
      renderer.dispose();
      canvas.removeEventListener("dblclick", dblclick);
      canvas.removeEventListener("pointerdown", pick, true);
      app.removeEventListener("keydown", keydown);
      app.removeEventListener("paste", pasteEvent);
      app.removeEventListener("copy", clipboard);
      app.removeEventListener("cut", clipboard);
      textarea.removeEventListener("compositionstart", compositionStart);
      textarea.removeEventListener("compositionend", compositionEnd);
      textarea.removeEventListener("input", acceptText);
    };
  }, [grid]);
  useEffect(() => {
    managerRef.current?.setBusOptions(busGap, busDirection);
  }, [busGap, busDirection]);
  useEffect(() => {
    managerRef.current?.getSelectTool().setSmart(smartSelect);
  }, [smartSelect]);
  useEffect(() => {
    rendererRef.current?.setOptions({ showGrid });
    rendererRef.current?.render();
  }, [showGrid]);
  useEffect(() => {
    actions.current.cancel();
    rendererRef.current?.setCleanPreview(preview);
    rendererRef.current?.render();
  }, [preview]);
  const selected = managerRef.current?.getSelectTool().getSelection();
  const selectedShape = selected
    ? recognizeShape(grid, managerRef.current!.getSelectTool().normalized())
    : null;
  const copy = async () => {
    try {
      // Crop surrounding whitespace so pasted diagrams sit flush anywhere.
      await navigator.clipboard.writeText(drawingPreviewText(gridToText(grid)));
      setMessage("Drawing copied.");
    } catch {
      setError("Clipboard unavailable. Use Preview and copy the text below.");
      setPreview(true);
    }
  };
  const exportText = () => {
    const url = URL.createObjectURL(
      new Blob([drawingPreviewText(gridToText(grid))], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Exported diagram.txt.");
  };
  return (
    <div className="asciiflow-app" ref={appRef}>
      <div className="asciiflow-document-bar">
        <strong>ASCIIFlow</strong>
        <span className="asciiflow-save-state" role="status">
          {saving
            ? "Saving…"
            : dirty
              ? standalone
                ? "Unsaved changes"
                : "Unsaved changes · draft kept"
              : "Saved"}
        </span>
        <div className="asciiflow-spacer" />
        <button
          onClick={() => setHelp(!help)}
          aria-expanded={help}
          title="Keyboard shortcuts (?)"
        >
          Help
        </button>
        <button onClick={copy}>Copy drawing</button>
        {/* Standalone diagrams are already .txt files; webviews block downloads. */}
        {!standalone && <button onClick={exportText}>Export .txt</button>}
        <button
          className="mod-cta"
          disabled={saving}
          onClick={() => void save()}
          title="⌘/Ctrl+S"
        >
          Save
        </button>
        {!standalone && (
          <>
            <button
              disabled={saving}
              onClick={() => void save(true)}
              title="⌘/Ctrl+Shift+S"
            >
              Save & close
            </button>
            <button disabled={saving} onClick={requestClose}>
              Close
            </button>
          </>
        )}
      </div>
      <fieldset
        className="asciiflow-toolbar"
        disabled={saving || preview}
        aria-label="Drawing tools"
      >
        {toolList.map((item) => (
          <button
            key={item.id}
            aria-pressed={tool === item.id}
            className={tool === item.id ? "active" : ""}
            title={`${item.label} (${item.key}) — ${item.hint}`}
            onClick={() => chooseTool(item.id)}
          >
            {item.label}
            <kbd>{item.key}</kbd>
          </button>
        ))}
        <button
          title="Figure catalog (G)"
          aria-expanded={catalog}
          onClick={() => {
            actions.current.cancel();
            setCatalog(!catalog);
          }}
        >
          Figures <kbd>G</kbd>
        </button>
        {tool === "select" && (
          <label>
            <input
              type="checkbox"
              checked={smartSelect}
              onChange={(e) => setSmartSelect(e.target.checked)}
            />
            Smart selection
          </label>
        )}
        {tool === "freeform" && (
          <label>
            Character{" "}
            <input
              aria-label="Drawing character"
              value={char}
              onChange={(e) => setChar(Array.from(e.target.value)[0] || "*")}
              className="asciiflow-character"
            />
          </label>
        )}
        {tool === "bus" && (
          <>
            <label>
              Bus style{" "}
              <select
                value={busGap}
                onChange={(e) => {
                  actions.current.cancel();
                  setBusGap(Number(e.target.value));
                }}
              >
                <option value={0}>Compact ═ / ║</option>
                <option value={1}>Wide · 1-cell gap</option>
                <option value={3}>Wide · 3-cell gap</option>
                <option value={5}>Wide · 5-cell gap</option>
              </select>
            </label>
            <label>
              Direction{" "}
              <select
                value={busDirection}
                onChange={(e) => {
                  actions.current.cancel();
                  setBusDirection(e.target.value as BusDirection);
                }}
              >
                <option value="auto">Auto</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
          </>
        )}
        {tool === "eraser" && (
          <label>
            Brush{" "}
            <select
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
            >
              <option value={1}>1 cell</option>
              <option value={3}>3 × 3</option>
              <option value={5}>5 × 5</option>
            </select>
          </label>
        )}
        {(tool === "arrow" || tool === "line") && (
          <label>
            <input
              type="checkbox"
              checked={waypoints}
              onChange={(e) => {
                actions.current.cancel();
                setWaypoints(e.target.checked);
              }}
            />
            Waypoints
          </label>
        )}
      </fieldset>
      <div
        className="asciiflow-toolbar"
        role="group"
        aria-label="Edit and view"
      >
        <button
          disabled={saving || preview || !managerRef.current?.canUndo}
          onClick={() => {
            actions.current.cancel();
            managerRef.current?.undo();
            setRevision((v) => v + 1);
          }}
          title="Undo (U or ⌘/Ctrl+Z)"
        >
          Undo <kbd>U</kbd>
        </button>
        <button
          disabled={saving || preview || !managerRef.current?.canRedo}
          onClick={() => {
            actions.current.cancel();
            managerRef.current?.redo();
            setRevision((v) => v + 1);
          }}
          title="Redo (R or ⌘/Ctrl+Shift+Z)"
        >
          Redo <kbd>R</kbd>
        </button>
        <button
          disabled={saving || preview}
          onClick={() => actions.current.selectAll()}
        >
          Select all <kbd>⌘/Ctrl+A</kbd>
        </button>
        <button
          disabled={saving || preview || !selected}
          onClick={() => actions.current.duplicate()}
          title="Duplicate (D or ⌘/Ctrl+D)"
        >
          Duplicate <kbd>D</kbd>
        </button>
        <button
          disabled={
            saving ||
            preview ||
            !selected ||
            (selectedShape?.kind !== "box" &&
              !enclosingBox(grid, {
                row: Math.min(selected.startRow, selected.endRow),
                col: Math.min(selected.startCol, selected.endCol),
              }))
          }
          onClick={() =>
            managerRef.current?.edit((ctx) =>
              managerRef.current!.getSelectTool().centerLabel(ctx),
            )
          }
        >
          Center label <kbd>C</kbd>
        </button>
        <button
          disabled={saving || preview || selectedShape?.kind !== "arrow"}
          title="Cycle arrowheads: one end, the other end, both ends (V)"
          onClick={() =>
            managerRef.current?.edit((ctx) =>
              managerRef.current!.getSelectTool().cycleArrowHeads(ctx),
            )
          }
        >
          Arrowheads <kbd>V</kbd>
        </button>
        <button
          disabled={saving || preview || selectedShape?.kind !== "arrow"}
          title="Head shape: arrowhead ► or T bar ┤ (Shift+V)"
          onClick={() =>
            managerRef.current?.edit((ctx) =>
              managerRef.current!.getSelectTool().toggleHeadShape(ctx),
            )
          }
        >
          Head shape <kbd>⇧V</kbd>
        </button>
        <button
          disabled={saving || preview || !selected}
          title="Line style: solid → dashed ┄ → double ═ (W)"
          onClick={() =>
            managerRef.current?.edit((ctx) =>
              managerRef.current!.getSelectTool().cycleLineStyle(ctx),
            )
          }
        >
          Line style <kbd>W</kbd>
        </button>
        <button
          disabled={saving || preview || !selected}
          title="Rotate 90° clockwise (O); Shift+O or Shift-click rotates counter-clockwise"
          onClick={(event) =>
            managerRef.current?.edit((ctx) =>
              managerRef.current!.getSelectTool().rotate(ctx, !event.shiftKey),
            )
          }
        >
          Rotate <kbd>O</kbd>
        </button>
        <button
          disabled={saving || preview || !text}
          onClick={() => setConfirm("clear")}
        >
          Clear <kbd>X</kbd>
        </button>
        <div className="asciiflow-spacer" />
        <button
          onClick={() => actions.current.zoom(1 / 1.2)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          title="Reset zoom to 100%"
          aria-label={`Zoom ${zoom}%. Reset to 100%`}
          onClick={() =>
            actions.current.zoom(1 / (rendererRef.current?.getZoom() ?? 1))
          }
        >
          {zoom}%
        </button>
        <button onClick={() => actions.current.zoom(1.2)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => actions.current.fit()} title="Fit drawing (0)">
          Fit
        </button>
        <label>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          Grid
        </label>
        <button aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? "Back to drawing" : "Preview"}
        </button>
      </div>
      {help && (
        <div className="asciiflow-help">
          <strong>Draw, then refine.</strong> Double-click to type. Select a box
          or simple arrow to reveal resize handles. Shift changes connector
          bends. Waypoints: click each bend, hover the endpoint, Enter to
          finish; Escape cancels.
          <br />
          Space-drag or middle-drag to pan. Scroll to pan; pinch or
          ⌘/Ctrl-scroll to zoom. +/− zoom, 0 fits the drawing. Arrow keys move
          selections; Shift moves 10 cells; Alt duplicates while nudging.
          ⌘/Ctrl+D duplicates. Paste, position, then click or Enter. Red preview
          cells will be overwritten.
          <br />
          ⌘/Ctrl+S saves; ⌘/Ctrl+Shift+S saves and closes. Escape resets to
          Select without closing. U undoes, R redoes, Cmd/Ctrl+A selects all, D
          duplicates, C centers labels, V cycles a selected arrow's heads (one
          end, the other, both), Shift+V switches them between arrowheads and T
          bars, O rotates the selection 90° clockwise (Shift+O
          counter-clockwise), W cycles line style (solid, dashed, double), and X
          clears after confirmation. Action letters work when not typing a
          label. Plain text is available in Preview for keyboard and
          screen-reader access.
        </div>
      )}
      {error && (
        <div className="asciiflow-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {catalog && (
        <FigureCatalog
          onClose={() => {
            setCatalog(false);
            canvasRef.current?.focus();
          }}
          onChoose={(figure) => {
            setCatalog(false);
            actions.current.paste(figure.art);
            setMessage(
              `Place ${figure.name}: click or Enter to confirm, Escape to cancel.`,
            );
          }}
        />
      )}
      {confirm && (
        <div
          className="asciiflow-confirm"
          role="alertdialog"
          aria-label={confirm === "close" ? "Unsaved drawing" : "Clear drawing"}
        >
          <span>
            {confirm === "close"
              ? "Save your changes before closing?"
              : "Clear the entire drawing? You can undo this."}
          </span>
          {confirm === "close" && (
            <button
              disabled={saving}
              className="mod-cta"
              onClick={() => {
                setConfirm(null);
                void save(true);
              }}
            >
              Save & close
            </button>
          )}
          <button
            onClick={() => {
              if (confirm === "close") {
                onDraft?.(null);
                live.current.dirty = false;
                onCancel();
              } else {
                actions.current.cancel();
                managerRef.current?.edit((ctx) => ctx.grid.clear());
                setConfirm(null);
              }
            }}
          >
            {confirm === "close" ? "Discard changes" : "Clear drawing"}
          </button>
          <button
            autoFocus
            onClick={() => {
              setConfirm(null);
              if (live.current.tool === "text") textRef.current?.focus();
              else canvasRef.current?.focus();
            }}
          >
            Keep editing
          </button>
        </div>
      )}
      <div
        className="asciiflow-canvas-container"
        style={{ display: preview ? "none" : undefined }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="ASCII drawing canvas. Press question mark for shortcuts."
          data-tool={tool}
        />
        <textarea
          ref={textRef}
          className="asciiflow-text-input"
          aria-label="Diagram label input"
          spellCheck={false}
        />
        {!text && !pending && (
          <div className="asciiflow-empty">
            Drag to draw your first box.
            <br />
            <small>Double-click to add a label. Press ? for help.</small>
          </div>
        )}
      </div>
      {preview && (
        <div className="asciiflow-text-preview">
          <label>
            Diagram as it will appear in your note
            <textarea
              readOnly
              value={text}
              aria-label="Plain-text diagram"
              spellCheck={false}
            />
          </label>
        </div>
      )}
      <div className="asciiflow-status">
        <span>
          {pending
            ? "Preview: click or Enter to commit · Escape to cancel"
            : toolList.find((t) => t.id === tool)?.hint}
        </span>
        {selectedShape && (
          <span>
            {selectedShape.kind === "box"
              ? "Box: drag corner handles"
              : "Arrow: drag endpoint handles"}
          </span>
        )}
        <span className="asciiflow-feedback" role="status">
          {message}
        </span>
        <span>
          Row {cursor.row + 1}, col {cursor.col + 1}
        </span>
      </div>
    </div>
  );
}
