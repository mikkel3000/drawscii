import { ask, open } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

/** A diagram workspace: a folder on disk holding `.txt` diagrams. */
export type Entry = {
  name: string;
  path: string;
  kind: "file" | "folder";
  children?: Entry[];
};

export const DIAGRAM_EXT = ".txt";
const isDiagram = (name: string) => name.toLowerCase().endsWith(DIAGRAM_EXT);
const sortEntries = (entries: Entry[]) =>
  entries.sort((a, b) =>
    a.kind !== b.kind
      ? a.kind === "folder"
        ? -1
        : 1
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
export const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const join = (folder: string, name: string) =>
  folder ? `${folder}/${name}` : name;
export const withExt = (name: string) =>
  isDiagram(name) ? name : name + DIAGRAM_EXT;

/** Validate a single path segment typed by the user. */
export function cleanName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(trimmed)) return null;
  return trimmed;
}

/** Paths are workspace-relative with `/`; Tauri accepts `/` on every OS. */
export class FolderStore {
  constructor(readonly root: string) {}

  get label() {
    return this.root.split(/[\\/]/).filter(Boolean).pop() ?? this.root;
  }

  private abs(path: string) {
    return path ? `${this.root.replace(/[\\/]+$/, "")}/${path}` : this.root;
  }

  async list(): Promise<Entry[]> {
    const walk = async (path: string): Promise<Entry[]> => {
      const entries: Entry[] = [];
      for (const child of await readDir(this.abs(path))) {
        // Skip hidden folders such as .git and .obsidian.
        if (child.name.startsWith(".") || child.isSymlink) continue;
        const childPath = join(path, child.name);
        if (child.isDirectory)
          entries.push({
            name: child.name,
            path: childPath,
            kind: "folder",
            children: await walk(childPath),
          });
        else if (child.isFile && isDiagram(child.name))
          entries.push({ name: child.name, path: childPath, kind: "file" });
      }
      return sortEntries(entries);
    };
    return walk("");
  }

  read(path: string) {
    return readTextFile(this.abs(path));
  }

  write(path: string, text: string) {
    return writeTextFile(this.abs(path), text);
  }

  createFolder(path: string) {
    return mkdir(this.abs(path), { recursive: true });
  }

  remove(path: string, kind: Entry["kind"]) {
    return remove(this.abs(path), { recursive: kind === "folder" });
  }

  /** Returns false when the target already exists. */
  async rename(from: string, to: string) {
    if (await this.exists(to)) return false;
    await rename(this.abs(from), this.abs(to));
    return true;
  }

  exists(path: string) {
    return exists(this.abs(path));
  }
}

const LAST_FOLDER = "asciiflow:folder";

export async function pickFolder(
  defaultPath?: string,
): Promise<FolderStore | null> {
  const picked = await open({
    directory: true,
    // Grant access to subfolders too, not just the folder itself.
    recursive: true,
    defaultPath,
    title: defaultPath ? "Grant access to this folder" : "Open diagram folder",
  });
  if (typeof picked !== "string") return null;
  try {
    localStorage.setItem(LAST_FOLDER, picked);
  } catch {
    // Remembering the folder is a convenience only.
  }
  return new FolderStore(picked);
}

/** Reopen the last folder; its access is restored by the persisted scope. */
export async function lastFolder(): Promise<FolderStore | null> {
  let path: string | null = null;
  try {
    path = localStorage.getItem(LAST_FOLDER);
  } catch {
    return null;
  }
  if (!path) return null;
  try {
    return (await exists(path)) ? new FolderStore(path) : null;
  } catch {
    return null;
  }
}

export const confirmDelete = (message: string) =>
  ask(message, { title: "Delete", kind: "warning" });
