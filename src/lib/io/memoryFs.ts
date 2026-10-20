import { CURRENT_MAJOR, parseFormatVersion } from "../core/types";

export interface FileStamp {
  modifiedMs: number;
  len: number;
}

export interface MemoryFile {
  text: string;
  modifiedMs: number;
}

export interface MemoryRecovery {
  id: string;
  savedAt: string;
  title: string;
  path: string | null;
  mapText: string;
}

export interface MemoryDisk {
  files: Map<string, MemoryFile>;
  backups: Map<string, MemoryFile[]>;
  recovery: Map<string, MemoryRecovery>;
}

export function createDisk(): MemoryDisk {
  return { files: new Map(), backups: new Map(), recovery: new Map() };
}

export type MemorySaveResult =
  | { kind: "ok"; stamp: FileStamp }
  | { kind: "newer-major" }
  | { kind: "external-change"; stamp: FileStamp }
  | { kind: "failed"; message: string };

function stampOf(file: MemoryFile): FileStamp {
  return { modifiedMs: file.modifiedMs, len: file.text.length };
}

function majorOf(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as { version?: unknown };
    return parseFormatVersion(parsed.version).major;
  } catch {
    return null;
  }
}

/**
 * The browser stand-in for the Rust save command. A newer major file is left
 * byte-for-byte alone: no backup, no recovery, no stamp change.
 */
export function memorySave(
  disk: MemoryDisk,
  request: {
    path: string;
    text: string;
    expected: FileStamp | null;
    rotateBackup: boolean;
    backupKeep: number;
    now: number;
  },
): MemorySaveResult {
  const existing = disk.files.get(request.path);
  if (existing) {
    const major = majorOf(existing.text);
    if (major != null && major > CURRENT_MAJOR) return { kind: "newer-major" };
    const stamp = stampOf(existing);
    if (request.expected && (request.expected.modifiedMs !== stamp.modifiedMs || request.expected.len !== stamp.len)) {
      return { kind: "external-change", stamp };
    }
    if (request.rotateBackup && request.backupKeep > 0) {
      const pile = disk.backups.get(request.path) ?? [];
      pile.push({ text: existing.text, modifiedMs: existing.modifiedMs });
      disk.backups.set(request.path, pile.slice(-request.backupKeep));
    }
  }
  disk.files.set(request.path, { text: request.text, modifiedMs: request.now });
  const stored = disk.files.get(request.path)!;
  return { kind: "ok", stamp: stampOf(stored) };
}

export function memoryWriteRecovery(disk: MemoryDisk, record: MemoryRecovery, protectedPath: string | null): MemorySaveResult | { kind: "ok" } {
  if (protectedPath) {
    const existing = disk.files.get(protectedPath);
    const major = existing ? majorOf(existing.text) : null;
    if (major != null && major > CURRENT_MAJOR) return { kind: "newer-major" };
  }
  disk.recovery.set(record.id, record);
  return { kind: "ok" };
}
