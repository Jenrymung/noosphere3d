import type { FileStamp } from "../io/memoryFs";
import type { Preferences, ThemePreference } from "../io/preferences";
import {
  needsClosePrompt,
  saveStatus,
  type SaveClock,
  type SaveStatus,
} from "../io/saveController";

/** Per-tab save bookkeeping. Camera and filters are not edits. */
export interface SaveTrack {
  path: string | null;
  recoveryId: string;
  stamp: FileStamp | null;
  savedStateId: number;
  lastSavedAt: number | null;
  lastBackupAt: number | null;
  lastEditAt: number | null;
  burstStartedAt: number | null;
  lastAutosaveAt: number | null;
  lastRecoveryAt: number | null;
  paused: boolean;
  saving: boolean;
  error: string | null;
  conflict: boolean;
}

export function freshTrack(recoveryId: string, options?: { edited?: boolean; now?: number }): SaveTrack {
  const now = options?.now ?? Date.now();
  const edited = options?.edited === true;
  return {
    path: null,
    recoveryId,
    stamp: null,
    savedStateId: 0,
    lastSavedAt: null,
    lastBackupAt: null,
    lastEditAt: edited ? now : null,
    burstStartedAt: edited ? now : null,
    lastAutosaveAt: null,
    lastRecoveryAt: null,
    paused: false,
    saving: false,
    error: null,
    conflict: false,
  };
}

export function isDirty(track: SaveTrack, stateId: number): boolean {
  return stateId !== track.savedStateId;
}

/**
 * Undo back to the saved history id clears the edit clock.
 * A filter change that leaves the history id alone must not call this.
 */
export function markEdited(track: SaveTrack, stateId: number, now: number): void {
  if (stateId === track.savedStateId) {
    track.lastEditAt = null;
    track.burstStartedAt = null;
    return;
  }
  if (track.burstStartedAt == null) track.burstStartedAt = now;
  track.lastEditAt = now;
}

export function markSaved(track: SaveTrack, stateId: number, stamp: FileStamp, now: number, rotated: boolean): void {
  track.savedStateId = stateId;
  track.stamp = stamp;
  track.lastSavedAt = now;
  track.lastAutosaveAt = now;
  track.paused = false;
  track.saving = false;
  track.error = null;
  track.conflict = false;
  track.lastEditAt = null;
  track.burstStartedAt = null;
  if (rotated) track.lastBackupAt = now;
}

export function clockFor(track: SaveTrack, prefs: Preferences, stateId: number): SaveClock {
  return {
    mode: prefs.saveMode,
    path: track.path,
    dirty: isDirty(track, stateId),
    paused: track.paused,
    conflict: track.conflict,
    saving: track.saving,
    lastEditAt: track.lastEditAt,
    burstStartedAt: track.burstStartedAt,
    lastAutosaveAt: track.lastAutosaveAt,
    lastRecoveryAt: track.lastRecoveryAt,
    lastBackupAt: track.lastBackupAt,
    savedAt: track.lastSavedAt,
    delayMs: prefs.autosaveDelayMs,
    maxIntervalMs: prefs.autosaveMaxIntervalMs,
    recoveryIdleMs: prefs.recoveryIdleMs,
    recoveryMaxMs: prefs.recoveryMaxMs,
  };
}

export function statusFor(track: SaveTrack, prefs: Preferences, stateId: number): SaveStatus {
  return saveStatus(clockFor(track, prefs, stateId));
}

export function promptFor(track: SaveTrack, prefs: Preferences, stateId: number): boolean {
  return needsClosePrompt({
    mode: prefs.saveMode,
    path: track.path,
    dirty: isDirty(track, stateId),
    paused: track.paused,
    conflict: track.conflict,
  });
}

export function ensureSuffix(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  return trimmed.toLowerCase().endsWith(".mindmap3d") ? trimmed : `${trimmed}.mindmap3d`;
}

export function tabTitle(title: string | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? trimmed : "Untitled map";
}

export function windowTitle(mark: string, title: string): string {
  return mark ? `${mark} ${title} — Noosphere 3D` : `${title} — Noosphere 3D`;
}

export function resolveTheme(theme: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  return systemDark ? "dark" : "light";
}
