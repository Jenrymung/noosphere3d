import { BROWSER_ERROR_LOG_KEY } from "./errorLog";
import { normalizePreferences, type Preferences } from "./preferences";
import { createDisk, memorySave, memoryWriteRecovery, type FileStamp, type MemoryDisk, type MemoryRecovery } from "./memoryFs";

export interface RecoveryItem {
  id: string;
  savedAt: string;
  title: string;
  path: string | null;
  mapText: string;
}

export interface SaveRequest {
  path: string;
  text: string;
  expected: FileStamp | null;
  rotateBackup: boolean;
  backupKeep: number;
  backupLocation: "app-data" | "beside";
}

export type SaveOutcome =
  | { kind: "ok"; stamp: FileStamp }
  | { kind: "newer-major" }
  | { kind: "external-change"; stamp: FileStamp }
  | { kind: "failed"; message: string };

export interface FileBridge {
  read(path: string): Promise<{ text: string; stamp: FileStamp }>;
  save(request: SaveRequest): Promise<SaveOutcome>;
  listRecovery(): Promise<RecoveryItem[]>;
  writeRecovery(record: RecoveryItem): Promise<SaveOutcome | { kind: "ok" }>;
  deleteRecovery(id: string): Promise<void>;
  loadPreferences(): Promise<Preferences>;
  savePreferences(value: Preferences): Promise<void>;
  pickOpen(): Promise<string | null>;
  pickSave(suggested: string): Promise<string | null>;
  setTitle(title: string): Promise<void>;
  onOpenPaths(handler: (paths: string[]) => void): () => void;
  onCloseRequested(handler: () => void): () => void;
  destroyWindow(): Promise<void>;
  takeStartupPaths(): Promise<string[]>;
  listFiles(): Promise<string[]>;
  /** Append one line to the local error log. Returns the path or browser-storage label. */
  appendErrorLog(line: string): Promise<string>;
  errorLogPath(): Promise<string>;
  /** True when the desktop shell is performing the writes. */
  native: boolean;
}

const FILES_KEY = "mindmap3d.files.v1";
const PREF_KEY = "mindmap3d.preferences.v1";
const BROWSER_LOG_LABEL = `browser-storage:${BROWSER_ERROR_LOG_KEY}`;

function rememberBrowserError(line: string): string {
  if (typeof localStorage === "undefined") return BROWSER_LOG_LABEL;
  const prev = localStorage.getItem(BROWSER_ERROR_LOG_KEY) ?? "";
  const next = prev ? `${prev}\n${line}` : line;
  const capped = next.length > 100_000 ? next.slice(next.length - 100_000) : next;
  localStorage.setItem(BROWSER_ERROR_LOG_KEY, capped);
  return BROWSER_LOG_LABEL;
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadDisk(): MemoryDisk {
  const disk = createDisk();
  if (typeof localStorage === "undefined") return disk;
  try {
    const raw = JSON.parse(localStorage.getItem(FILES_KEY) || "{}") as {
      files?: Record<string, { text: string; modifiedMs: number }>;
      backups?: Record<string, { text: string; modifiedMs: number }[]>;
      recovery?: MemoryRecovery[];
    };
    for (const [path, file] of Object.entries(raw.files ?? {})) disk.files.set(path, file);
    for (const [path, pile] of Object.entries(raw.backups ?? {})) disk.backups.set(path, pile);
    for (const record of raw.recovery ?? []) disk.recovery.set(record.id, record);
  } catch {
    /* a damaged browser store starts empty */
  }
  return disk;
}

function storeDisk(disk: MemoryDisk) {
  if (typeof localStorage === "undefined") return;
  const files: Record<string, { text: string; modifiedMs: number }> = {};
  const backups: Record<string, { text: string; modifiedMs: number }[]> = {};
  disk.files.forEach((file, path) => {
    files[path] = file;
  });
  disk.backups.forEach((pile, path) => {
    backups[path] = pile;
  });
  localStorage.setItem(
    FILES_KEY,
    JSON.stringify({ files, backups, recovery: [...disk.recovery.values()] }),
  );
}

export function createMemoryBridge(disk = loadDisk()): FileBridge {
  const openHandlers = new Set<(paths: string[]) => void>();
  const closeHandlers = new Set<() => void>();
  return {
    native: false,
    async read(path) {
      const file = disk.files.get(path);
      if (!file) throw new Error(`No file at ${path}`);
      return { text: file.text, stamp: { modifiedMs: file.modifiedMs, len: file.text.length } };
    },
    async save(request) {
      const result = memorySave(disk, { ...request, now: Date.now() });
      if (result.kind === "ok" || result.kind === "external-change") storeDisk(disk);
      if (result.kind !== "newer-major") storeDisk(disk);
      return result;
    },
    async listRecovery() {
      return [...disk.recovery.values()];
    },
    async writeRecovery(record) {
      const result = memoryWriteRecovery(disk, record, record.path);
      if (result.kind === "ok") storeDisk(disk);
      return result;
    },
    async deleteRecovery(id) {
      disk.recovery.delete(id);
      storeDisk(disk);
    },
    async loadPreferences() {
      if (typeof localStorage === "undefined") return normalizePreferences(null);
      return normalizePreferences(JSON.parse(localStorage.getItem(PREF_KEY) || "null"));
    },
    async savePreferences(value) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(PREF_KEY, JSON.stringify(value));
    },
    async pickOpen() {
      return null;
    },
    async pickSave() {
      return null;
    },
    async setTitle(title) {
      if (typeof document !== "undefined") document.title = title;
    },
    onOpenPaths(handler) {
      openHandlers.add(handler);
      return () => openHandlers.delete(handler);
    },
    onCloseRequested(handler) {
      closeHandlers.add(handler);
      if (typeof window === "undefined") return () => closeHandlers.delete(handler);
      const onClose = () => closeHandlers.forEach((fn) => fn());
      window.addEventListener("mindmap-close", onClose);
      return () => {
        closeHandlers.delete(handler);
        window.removeEventListener("mindmap-close", onClose);
      };
    },
    async destroyWindow() {
      closeHandlers.clear();
    },
    async takeStartupPaths() {
      return [];
    },
    async listFiles() {
      return [...disk.files.keys()].sort();
    },
    async appendErrorLog(line) {
      return rememberBrowserError(line);
    },
    async errorLogPath() {
      return BROWSER_LOG_LABEL;
    },
  };
}

export async function createFileBridge(): Promise<FileBridge> {
  if (!inTauri()) return createMemoryBridge();
  const [{ invoke }, { listen }, { getCurrentWindow }, dialog, store] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/api/window"),
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-store"),
  ]);
  const preferences = await store.load("preferences.json", { autoSave: true, defaults: {} });
  return {
    native: true,
    async read(path) {
      return invoke("read_map_file", { path });
    },
    async save(request) {
      return invoke("save_map_file", { request });
    },
    async listRecovery() {
      return invoke("list_recovery_files");
    },
    async writeRecovery(record) {
      return invoke("write_recovery_file", { record });
    },
    async deleteRecovery(id) {
      return invoke("delete_recovery_file", { id });
    },
    async loadPreferences() {
      return normalizePreferences(await preferences.get("preferences"));
    },
    async savePreferences(value) {
      await preferences.set("preferences", value);
      await preferences.save();
    },
    async pickOpen() {
      const picked = await dialog.open({
        multiple: false,
        filters: [{ name: "Noosphere 3D", extensions: ["mindmap3d"] }],
      });
      return typeof picked === "string" ? picked : null;
    },
    async pickSave(suggested) {
      const picked = await dialog.save({
        defaultPath: suggested,
        filters: [{ name: "Noosphere 3D", extensions: ["mindmap3d"] }],
      });
      return picked ?? null;
    },
    async setTitle(title) {
      await getCurrentWindow().setTitle(title);
      document.title = title;
    },
    onOpenPaths(handler) {
      let unlisten = () => {};
      void listen<string[]>("open-paths", (event) => handler(event.payload)).then((stop) => {
        unlisten = stop;
      });
      return () => unlisten();
    },
    onCloseRequested(handler) {
      let unlisten = () => {};
      void listen("close-requested", () => handler()).then((stop) => {
        unlisten = stop;
      });
      return () => unlisten();
    },
    async destroyWindow() {
      await getCurrentWindow().destroy();
    },
    async takeStartupPaths() {
      return invoke("take_startup_paths");
    },
    async listFiles() {
      return [];
    },
    async appendErrorLog(line) {
      return invoke("append_error_log", { line });
    },
    async errorLogPath() {
      return invoke("error_log_file");
    },
  };
}
