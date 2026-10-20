import type { SaveMode } from "./preferences";

/** How often an autosave session rotates a backup, so a busy edit does not fill the disk. */
export const AUTOSAVE_BACKUP_GAP_MS = 3 * 60 * 1000;

export interface SaveClock {
  mode: SaveMode;
  path: string | null;
  dirty: boolean;
  paused: boolean;
  conflict: boolean;
  saving: boolean;
  lastEditAt: number | null;
  burstStartedAt: number | null;
  lastAutosaveAt: number | null;
  lastRecoveryAt: number | null;
  lastBackupAt: number | null;
  /** Shown after a clean autosave when lastAutosaveAt is empty. */
  savedAt: number | null;
  delayMs: number;
  maxIntervalMs: number;
  recoveryIdleMs: number;
  recoveryMaxMs: number;
}

export interface SaveStatus {
  /** Leading mark for the tab and window title. Empty when the map is clean. */
  mark: string;
  text: string;
}

export function saveStatus(clock: SaveClock): SaveStatus {
  if (clock.conflict) return { mark: "●", text: "Changed on disk" };
  if (clock.paused) return { mark: "●", text: "Save paused" };
  if (!clock.path) return { mark: "●", text: "Not saved yet" };
  if (clock.mode === "autosave") {
    if (clock.saving) return { mark: "", text: "Autosaving…" };
    if (clock.dirty) return { mark: "●", text: "Unsaved changes" };
    const when = clock.lastAutosaveAt ?? clock.savedAt;
    return { mark: "", text: when ? `Saved ${formatClock(when)}` : "Saved" };
  }
  if (clock.dirty) return { mark: "●", text: "Unsaved changes" };
  return { mark: "", text: "Saved" };
}

function formatClock(ms: number): string {
  const date = new Date(ms);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function needsClosePrompt(input: {
  mode: SaveMode;
  path: string | null;
  dirty: boolean;
  paused: boolean;
  conflict: boolean;
}): boolean {
  if (!input.path) return true;
  if (input.conflict || input.paused) return true;
  if (input.mode === "autosave") return false;
  return input.dirty;
}

export function shouldAutosave(clock: SaveClock, now: number, reason: "tick" | "blur" | "close" | "manual"): boolean {
  if (reason === "manual") return true;
  if (clock.mode !== "autosave" || !clock.path || !clock.dirty || clock.paused || clock.conflict || clock.saving) return false;
  if (reason === "blur" || reason === "close") return true;
  if (clock.lastEditAt == null) return false;
  const idle = now - clock.lastEditAt >= clock.delayMs;
  const burst = clock.burstStartedAt != null && now - clock.burstStartedAt >= clock.maxIntervalMs;
  return idle || burst;
}

export function shouldWriteRecovery(clock: SaveClock, now: number): boolean {
  if (!clock.dirty || clock.lastEditAt == null) return false;
  const sinceEdit = now - clock.lastEditAt;
  const sinceRecovery = clock.lastRecoveryAt == null ? Number.POSITIVE_INFINITY : now - clock.lastRecoveryAt;
  if (sinceEdit >= clock.recoveryIdleMs && (clock.lastRecoveryAt == null || clock.lastRecoveryAt < clock.lastEditAt)) return true;
  if (clock.burstStartedAt != null && now - clock.burstStartedAt >= clock.recoveryMaxMs && sinceRecovery >= clock.recoveryMaxMs) return true;
  return false;
}

export function shouldRotateBackup(clock: SaveClock, now: number): boolean {
  if (!clock.path) return false;
  if (clock.mode === "manual") return true;
  if (clock.lastBackupAt == null) return true;
  return now - clock.lastBackupAt >= AUTOSAVE_BACKUP_GAP_MS;
}

/** Turning autosave on or off does not itself write the file. */
export function modeSwitchSaves(): boolean {
  return false;
}
