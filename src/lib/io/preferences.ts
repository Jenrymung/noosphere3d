export type SaveMode = "manual" | "autosave";
export type BackupLocation = "app-data" | "beside";
export type ThemePreference = "system" | "dark" | "light";
export type MotionPreference = "system" | "on" | "off";
export type BuiltinMapId = "sample" | "stress";

/** A Maps entry. Removing one drops it from this list and does not delete a file. */
export interface FavouriteMap {
  id: string;
  label: string;
  kind: "builtin" | "file";
  builtin?: BuiltinMapId;
  path?: string;
}

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
  showAxisGizmo: boolean;
  /** Missing on old preference files. An empty array means the owner removed every entry. */
  favouriteMaps: FavouriteMap[];
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
  showAxisGizmo: true,
  favouriteMaps: [
    { id: "builtin-stress", label: "2,304 nodes", kind: "builtin", builtin: "stress" },
    { id: "builtin-sample", label: "Flooding sample", kind: "builtin", builtin: "sample" },
  ],
};

export function addFavourite(list: readonly FavouriteMap[], entry: FavouriteMap): { list: FavouriteMap[]; added: boolean } {
  const path = entry.path?.trim();
  if (list.some((item) => item.id === entry.id || (path && item.path === path))) return { list: [...list], added: false };
  return { list: [...list, entry], added: true };
}

export function removeFavourite(list: readonly FavouriteMap[], id: string): FavouriteMap[] {
  return list.filter((item) => item.id !== id);
}

function favouriteStem(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return base.replace(/\.mindmap3d$/i, "").trim() || path;
}

function normalizeFavourites(input: unknown): FavouriteMap[] {
  if (!Array.isArray(input)) return DEFAULT_PREFERENCES.favouriteMaps.map((item) => ({ ...item }));
  const out: FavouriteMap[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<FavouriteMap>;
    if (raw.kind === "builtin" && (raw.builtin === "sample" || raw.builtin === "stress")) {
      const id = raw.builtin === "sample" ? "builtin-sample" : "builtin-stress";
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: raw.builtin === "sample" ? "Flooding sample" : "2,304 nodes",
        kind: "builtin",
        builtin: raw.builtin,
      });
      continue;
    }
    if (raw.kind === "file" && typeof raw.path === "string" && raw.path.trim()) {
      const path = raw.path.trim();
      const id = `file:${path}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : favouriteStem(path);
      out.push({ id, label, kind: "file", path });
    }
  }
  return out;
}

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
    showAxisGizmo: raw.showAxisGizmo !== false,
    favouriteMaps: normalizeFavourites(raw.favouriteMaps),
  };
}
