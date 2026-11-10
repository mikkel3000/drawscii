import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { drawingPreviewText } from "../model/Serializer";
import { AsciiFlowApp } from "../ui/AsciiFlowApp";
import {
  cleanName,
  confirmDelete,
  DIAGRAM_EXT,
  Entry,
  FolderStore,
  join,
  lastFolder,
  parentOf,
  pickFolder,
  withExt,
} from "./store";

const LAST_FILE = "asciiflow:last-open";
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Convenience only.
  }
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const message = (e: unknown, fallback: string) => {
  const text =
    e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
  // Access granted before subfolders were included, or revoked by the OS.
  return /forbidden path/i.test(text)
    ? "ASCIIFlow has no access to part of this folder. Choose “Open another folder…” and pick it again."
    : text;
};
/** Whether `path` is `root` itself or lies inside it. */
const within = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);
/** Re-point `path` after `from` moved to `to`. */
const moved = (path: string, from: string, to: string) =>
  within(path, from) ? to + path.slice(from.length) : path;
const baseName = (entry: Entry) =>
  entry.kind === "file" ? entry.name.slice(0, -DIAGRAM_EXT.length) : entry.name;

type Open = { path: string; text: string };
type Naming = {
  title: string;
  initial: string;
  submit: (name: string) => Promise<void>;
};
type MenuItem = { label: string; run: () => void; danger?: boolean } | "-";
type Menu = { x: number; y: number; items: MenuItem[] };

function NameDialog({
  naming,
  onClose,
}: {
  naming: Naming;
  onClose: () => void;
}) {
  const [value, setValue] = useState(naming.initial);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current!;
    el.focus();
    // Select the name without its extension, like a file manager.
    const dot = naming.initial.toLowerCase().lastIndexOf(DIAGRAM_EXT);
    el.setSelectionRange(0, dot > 0 ? dot : naming.initial.length);
  }, [naming]);
  const submit = async () => {
    const clean = cleanName(value);
    if (!clean) {
      setError('Use a name without / \\ : * ? " < > |');
      return;
    }
    try {
      await naming.submit(clean);
      onClose();
    } catch (e) {
      setError(message(e, "That did not work."));
    }
  };
  return (
    <div className="asciiflow-name-backdrop" onMouseDown={onClose}>
      <form
        className="asciiflow-name-dialog"
        role="dialog"
        aria-label={naming.title}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <label>
          {naming.title}
          <input
            ref={input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="asciiflow-name-buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="mod-cta" type="submit">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useEffect(() => {
    const el = ref.current!;
    // Keep the menu on screen near the window edges.
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.min(menu.x, window.innerWidth - width - 4),
      top: Math.min(menu.y, window.innerHeight - height - 4),
    });
    el.querySelector("button")?.focus();
    const close = (e: Event) => {
      if (!el.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("keydown", key, true);
    };
  }, [menu, onClose]);
  return (
    <div ref={ref} className="asciiflow-menu" role="menu" style={pos}>
      {menu.items.map((item, i) =>
        item === "-" ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={item.danger ? "is-danger" : undefined}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function Workspace() {
  const [store, setStore] = useState<FolderStore | null>(null);
  const [tree, setTree] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  const [error, setError] = useState("");
  const [naming, setNaming] = useState<Naming | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [dragging, setDragging] = useState<Entry | null>(null);
  // Folder a drag would drop into; "" is the top level.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const expandTimer = useRef<{ path: string; timer: number } | null>(null);
  // Serialize writes so moves, renames and deletes never race an autosave.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const removed = useRef(new Set<string>());

  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.catch(() => {}).then(job);
    queue.current = next;
    return next;
  }, []);

  const refresh = useCallback(async (target: FolderStore | null) => {
    if (!target) return setTree([]);
    try {
      setTree(await target.list());
    } catch (e) {
      setError(message(e, "Could not list the folder."));
    }
  }, []);

  const reveal = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let p = parentOf(path); p; p = parentOf(p)) next.add(p);
      return next;
    });

  const openFile = useCallback(async (target: FolderStore, path: string) => {
    try {
      const text = await target.read(path);
      removed.current.delete(path);
      setOpen({ path, text });
      setFolder(parentOf(path));
      reveal(path);
      remember(`${LAST_FILE}:${target.root}`, path);
      setError("");
    } catch (e) {
      setError(message(e, `Could not open ${path}.`));
    }
  }, []);

  /** Close the editor first so its final flush lands before the change. */
  const closeEditor = async () => {
    flushSync(() => setOpen(null));
    await queue.current.catch(() => {});
  };

  const switchTo = async (next: FolderStore) => {
    await closeEditor();
    setStore(next);
    setFolder("");
    setExpanded(new Set());
    await refresh(next);
    const last = recall(`${LAST_FILE}:${next.root}`);
    if (last && (await next.exists(last).catch(() => false)))
      await openFile(next, last);
  };

  useEffect(() => {
    void lastFolder().then((s) => s && switchTo(s));
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFolder = async () => {
    try {
      const next = await pickFolder();
      if (next) await switchTo(next);
    } catch (e) {
      setError(message(e, "Could not open that folder."));
    }
  };

  const run = async (job: () => Promise<void>) => {
    try {
      await job();
      setError("");
    } catch (e) {
      setError(message(e, "Something went wrong."));
    }
    await refresh(store);
  };

  /** A free name like "Untitled 2.txt" or "Plan copy.txt" in `parent`. */
  const freeName = async (parent: string, stem: string, ext: string) => {
    let i = 1,
      name = `${stem}${ext}`;
    while (await store!.exists(join(parent, name)))
      name = `${stem} ${++i}${ext}`;
    return name;
  };

  const newDiagram = async (parent = folder) => {
    if (!store) return;
    setNaming({
      title: parent ? `New diagram in ${parent}` : "New diagram",
      initial: await freeName(parent, "Untitled", DIAGRAM_EXT),
      submit: async (input) => {
        const path = join(parent, withExt(input));
        if (await store.exists(path))
          throw new Error(`${path} already exists.`);
        await enqueue(() => store.write(path, ""));
        await refresh(store);
        await openFile(store, path);
      },
    });
  };

  const newFolder = async (parent = folder) => {
    if (!store) return;
    setNaming({
      title: parent ? `New folder in ${parent}` : "New folder",
      initial: await freeName(parent, "New folder", ""),
      submit: async (input) => {
        const path = join(parent, input);
        if (await store.exists(path))
          throw new Error(`${path} already exists.`);
        await enqueue(() => store.createFolder(path));
        setFolder(path);
        setExpanded((prev) => new Set(prev).add(path));
        reveal(path);
        await refresh(store);
      },
    });
  };

  /**
   * Move or rename `entry` to `to`, keeping the open diagram, the
   * new-item folder and expanded folders pointed at the same items.
   */
  const relocate = async (entry: Entry, to: string) => {
    if (!store || to === entry.path) return;
    if (entry.kind === "folder" && within(to, entry.path))
      throw new Error("A folder cannot be moved into itself.");
    const reopen = open && within(open.path, entry.path) ? open.path : null;
    if (reopen) await closeEditor();
    if (!(await enqueue(() => store.rename(entry.path, to)))) {
      if (reopen) await openFile(store, reopen);
      throw new Error(`${to} already exists.`);
    }
    setFolder((f) => moved(f, entry.path, to));
    setExpanded(
      (prev) => new Set([...prev].map((p) => moved(p, entry.path, to))),
    );
    reveal(to);
    await refresh(store);
    if (reopen) await openFile(store, moved(reopen, entry.path, to));
  };

  const moveInto = (entry: Entry, target: string) =>
    run(async () => {
      if (parentOf(entry.path) === target) return;
      await relocate(entry, join(target, entry.name));
      if (target) setExpanded((prev) => new Set(prev).add(target));
    });

  const renameEntry = (entry: Entry) => {
    if (!store) return;
    setNaming({
      title: `Rename ${entry.kind === "file" ? "diagram" : "folder"}`,
      initial: entry.name,
      submit: (input) =>
        relocate(
          entry,
          join(
            parentOf(entry.path),
            entry.kind === "file" ? withExt(input) : input,
          ),
        ),
    });
  };

  const duplicateEntry = (entry: Entry) =>
    run(async () => {
      if (!store || entry.kind !== "file") return;
      const parent = parentOf(entry.path);
      // Closing the editor flushes unsaved edits, so the copy has them.
      if (open?.path === entry.path) await closeEditor();
      const text = await store.read(entry.path);
      const path = join(
        parent,
        await freeName(parent, `${baseName(entry)} copy`, DIAGRAM_EXT),
      );
      await enqueue(() => store.write(path, text));
      await refresh(store);
      await openFile(store, path);
    });

  const removeEntry = (entry: Entry) =>
    run(async () => {
      if (!store) return;
      const what =
        entry.kind === "folder"
          ? `the folder “${entry.path}” and everything in it`
          : `“${entry.path}”`;
      if (!(await confirmDelete(`Delete ${what}? This cannot be undone.`)))
        return;
      if (open && within(open.path, entry.path)) await closeEditor();
      removed.current.add(entry.path);
      await enqueue(() => store.remove(entry.path, entry.kind));
      if (within(folder, entry.path)) setFolder(parentOf(entry.path));
    });

  const save = useCallback(
    (target: FolderStore, path: string) => async (text: string) => {
      if ([...removed.current].some((p) => within(path, p))) return;
      // Store the cropped drawing so the file pastes cleanly anywhere.
      const cropped = drawingPreviewText(text);
      await enqueue(() => target.write(path, cropped ? cropped + "\n" : ""));
    },
    [enqueue],
  );

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const showMenu = (e: React.MouseEvent, entry: Entry | null) => {
    if (!store) return;
    e.preventDefault();
    e.stopPropagation();
    const inside = entry?.kind === "folder" ? entry.path : "";
    const create: MenuItem[] = [
      { label: "New diagram", run: () => void newDiagram(inside) },
      { label: "New folder", run: () => void newFolder(inside) },
    ];
    const items: MenuItem[] = !entry
      ? create
      : entry.kind === "folder"
        ? [
            ...create,
            "-",
            { label: "Rename…", run: () => renameEntry(entry) },
            {
              label: "Delete",
              danger: true,
              run: () => void removeEntry(entry),
            },
          ]
        : [
            { label: "Open", run: () => void openFile(store, entry.path) },
            { label: "Duplicate", run: () => void duplicateEntry(entry) },
            "-",
            { label: "Rename…", run: () => renameEntry(entry) },
            {
              label: "Delete",
              danger: true,
              run: () => void removeEntry(entry),
            },
          ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ---------- Drag and drop ----------

  const canDropFor = (entry: Entry, target: string) =>
    parentOf(entry.path) !== target &&
    !(entry.kind === "folder" && within(target, entry.path));
  const canDrop = (target: string) =>
    !!dragging && canDropFor(dragging, target);

  const clearExpandTimer = () => {
    if (expandTimer.current) window.clearTimeout(expandTimer.current.timer);
    expandTimer.current = null;
  };

  const endDrag = () => {
    clearExpandTimer();
    setDragging(null);
    setDropTarget(null);
  };

  /** Hovering over a closed folder while dragging opens it, as in an IDE. */
  const hoverFolder = (path: string) => {
    if (expanded.has(path) || expandTimer.current?.path === path) return;
    clearExpandTimer();
    expandTimer.current = {
      path,
      timer: window.setTimeout(() => {
        setExpanded((prev) => new Set(prev).add(path));
        expandTimer.current = null;
      }, 600),
    };
  };

  const dragOver = (e: React.DragEvent, target: string, folderRow?: string) => {
    e.stopPropagation();
    if (folderRow) hoverFolder(folderRow);
    else clearExpandTimer();
    if (!canDrop(target)) {
      setDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  };

  const drop = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    e.stopPropagation();
    const entry = dragging;
    endDrag();
    if (entry && canDropFor(entry, target)) void moveInto(entry, target);
  };

  const rowKeys = (e: React.KeyboardEvent, entry: Entry) => {
    if (e.key === "F2") {
      e.preventDefault();
      renameEntry(entry);
    } else if (
      e.key === "Delete" ||
      (e.key === "Backspace" && (e.metaKey || e.ctrlKey))
    ) {
      e.preventDefault();
      void removeEntry(entry);
    } else if (
      entry.kind === "file" &&
      e.key.toLowerCase() === "d" &&
      (e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      void duplicateEntry(entry);
    }
  };

  const renderEntries = (entries: Entry[], depth: number): React.ReactNode =>
    entries.map((entry) => {
      const isFolder = entry.kind === "folder";
      const isOpen = expanded.has(entry.path);
      const active = isFolder
        ? folder === entry.path
        : open?.path === entry.path;
      // Dropping on a file moves next to it, like an IDE.
      const target = isFolder ? entry.path : parentOf(entry.path);
      const classes = [
        "asciiflow-tree-row",
        active && "is-active",
        isFolder && dropTarget === entry.path && "is-drop",
        dragging?.path === entry.path && "is-dragging",
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <li
          key={entry.path}
          role="treeitem"
          aria-expanded={isFolder ? isOpen : undefined}
          className={
            isFolder && dropTarget === entry.path ? "is-drop-zone" : undefined
          }
        >
          <div
            className={classes}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", entry.path);
              setDragging(entry);
            }}
            onDragEnd={endDrag}
            onDragOver={(e) =>
              dragOver(e, target, isFolder ? entry.path : undefined)
            }
            onDrop={(e) => drop(e, target)}
            onContextMenu={(e) => showMenu(e, entry)}
          >
            <button
              className="asciiflow-tree-label"
              title={entry.path}
              onKeyDown={(e) => rowKeys(e, entry)}
              onClick={() => {
                if (isFolder) {
                  toggle(entry.path);
                  setFolder(entry.path);
                } else if (store) void openFile(store, entry.path);
              }}
            >
              <span className="asciiflow-tree-icon" aria-hidden>
                {isFolder ? (isOpen ? "▾" : "▸") : "◇"}
              </span>
              {baseName(entry)}
            </button>
            <span className="asciiflow-tree-actions">
              {!isFolder && (
                <button
                  onClick={() => void duplicateEntry(entry)}
                  title="Duplicate (⌘/Ctrl+D)"
                  aria-label={`Duplicate ${entry.name}`}
                >
                  ⧉
                </button>
              )}
              <button
                onClick={() => renameEntry(entry)}
                title="Rename (F2)"
                aria-label={`Rename ${entry.name}`}
              >
                ✎
              </button>
              <button
                onClick={() => void removeEntry(entry)}
                title="Delete"
                aria-label={`Delete ${entry.name}`}
              >
                ✕
              </button>
            </span>
          </div>
          {isFolder && isOpen && (
            <ul role="group">
              {renderEntries(entry.children ?? [], depth + 1)}
            </ul>
          )}
        </li>
      );
    });

  return (
    <div className="asciiflow-workspace">
      <aside className="asciiflow-sidebar" aria-label="Diagrams">
        <div
          className="asciiflow-sidebar-head"
          onDragOver={(e) => dragOver(e, "")}
          onDrop={(e) => drop(e, "")}
        >
          <strong title={store?.root}>{store?.label ?? "No folder"}</strong>
          <span className="asciiflow-spacer" />
          {store && (
            <>
              <button
                onClick={() => void newDiagram()}
                title={folder ? `New diagram in ${folder}` : "New diagram"}
                aria-label="New diagram"
              >
                ＋
              </button>
              <button
                onClick={() => void newFolder()}
                title={folder ? `New folder in ${folder}` : "New folder"}
                aria-label="New folder"
              >
                ▣
              </button>
              <button
                onClick={() => void refresh(store)}
                title="Refresh"
                aria-label="Refresh"
              >
                ↻
              </button>
            </>
          )}
        </div>
        <ul
          className={`asciiflow-tree${dropTarget === "" ? " is-drop" : ""}`}
          role="tree"
          onDragOver={(e) => dragOver(e, "")}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setDropTarget(null);
          }}
          onDrop={(e) => drop(e, "")}
          onContextMenu={(e) => showMenu(e, null)}
          // Clicking empty space targets the top level, as in an IDE.
          onClick={(e) => {
            if (e.target === e.currentTarget) setFolder("");
          }}
        >
          {renderEntries(tree, 0)}
          {store && !tree.length && (
            <li className="asciiflow-sidebar-empty">
              No .txt diagrams here yet. Use ＋ or right-click to create one.
            </li>
          )}
        </ul>
        {error && (
          <p className="asciiflow-sidebar-error" role="alert">
            {error}
          </p>
        )}
        <div className="asciiflow-sidebar-foot">
          <button onClick={() => void chooseFolder()}>
            {store ? "Open another folder…" : "Open folder…"}
          </button>
        </div>
      </aside>
      <main className="asciiflow-workspace-editor">
        {store && open ? (
          <AsciiFlowApp
            key={`${store.root}:${open.path}`}
            standalone
            initialText={open.text}
            onSave={save(store, open.path)}
            onCancel={() => {}}
          />
        ) : (
          <div className="asciiflow-workspace-empty">
            {store ? (
              <>
                <p>Open a diagram from the sidebar, or create a new one.</p>
                <button className="mod-cta" onClick={() => void newDiagram()}>
                  New diagram
                </button>
              </>
            ) : (
              <>
                <p>Choose a folder to keep your diagrams in.</p>
                <button className="mod-cta" onClick={() => void chooseFolder()}>
                  Open folder…
                </button>
              </>
            )}
          </div>
        )}
      </main>
      {naming && <NameDialog naming={naming} onClose={() => setNaming(null)} />}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}
