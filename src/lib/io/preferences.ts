export type SaveMode = "manual" | "autosave";
export type BackupLocation = "app-data" | "beside";
export type ThemePreference = "system" | "dark" | "light";
export type MotionPreference = "system" | "on" | "off";

/** App settings. They live on this computer, not in the map file. */
export interface Preferences {
  saveMode: SaveMode;
  autosaveDelayMs: number;
  autosaveMaxIntervalMs: number;
  backupKeep: number;
  backupLocation: BackupLocation;
  recoveryIdleMs: number;
  recoveryMaxMs: number;
  theme: ThemePreference;
  /** 1 is 100%. */
  labelScale: number;
  reduceMotion: MotionPreference;
  dimLonely: boolean;
  skipPicker: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  saveMode: "manual",
  autosaveDelayMs: 2000,
  autosaveMaxIntervalMs: 30_000,
  backupKeep: 5,
  backupLocation: "app-data",
  recoveryIdleMs: 3000,
  recoveryMaxMs: 30_000,
  theme: "system",
  labelScale: 1,
  reduceMotion: "system",
  dimLonely: false,
  skipPicker: false,
};

const LIMITS = {
  autosaveDelayMs: [200, 60_000],
  autosaveMaxIntervalMs: [1000, 300_000],
  backupKeep: [0, 50],
  recoveryIdleMs: [500, 60_000],
  recoveryMaxMs: [1000, 300_000],
  labelScale: [0.7, 1.8],
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizePreferences(input: unknown): Preferences {
  const raw = typeof input === "object" && input !== null ? (input as Partial<Preferences>) : {};
  const saveMode = raw.saveMode === "autosave" ? "autosave" : "manual";
  const backupLocation = raw.backupLocation === "beside" ? "beside" : "app-data";
  const theme = raw.theme === "dark" || raw.theme === "light" ? raw.theme : "system";
  const reduceMotion = raw.reduceMotion === "on" || raw.reduceMotion === "off" ? raw.reduceMotion : "system";
  return {
    saveMode,
    autosaveDelayMs: clamp(Number(raw.autosaveDelayMs ?? DEFAULT_PREFERENCES.autosaveDelayMs), ...LIMITS.autosaveDelayMs),
    autosaveMaxIntervalMs: clamp(
      Number(raw.autosaveMaxIntervalMs ?? DEFAULT_PREFERENCES.autosaveMaxIntervalMs),
      ...LIMITS.autosaveMaxIntervalMs,
    ),
    backupKeep: Math.round(clamp(Number(raw.backupKeep ?? DEFAULT_PREFERENCES.backupKeep), ...LIMITS.backupKeep)),
    backupLocation,
    recoveryIdleMs: clamp(Number(raw.recoveryIdleMs ?? DEFAULT_PREFERENCES.recoveryIdleMs), ...LIMITS.recoveryIdleMs),
    recoveryMaxMs: clamp(Number(raw.recoveryMaxMs ?? DEFAULT_PREFERENCES.recoveryMaxMs), ...LIMITS.recoveryMaxMs),
    theme,
    labelScale: clamp(Number(raw.labelScale ?? DEFAULT_PREFERENCES.labelScale), ...LIMITS.labelScale),
    reduceMotion,
    dimLonely: raw.dimLonely === true,
    skipPicker: raw.skipPicker === true,
  };
}
