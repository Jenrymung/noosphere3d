import { describe, expect, it } from "vitest";
import { needsClosePrompt, saveStatus, shouldAutosave, shouldRotateBackup, shouldWriteRecovery, type SaveClock } from "./saveController";

function clock(patch: Partial<SaveClock> = {}): SaveClock {
  return {
    mode: "manual",
    path: "/maps/notes.mindmap3d",
    dirty: true,
    paused: false,
    conflict: false,
    saving: false,
    lastEditAt: 10_000,
    burstStartedAt: 10_000,
    lastAutosaveAt: null,
    lastRecoveryAt: null,
    lastBackupAt: null,
    savedAt: null,
    delayMs: 2_000,
    maxIntervalMs: 30_000,
    recoveryIdleMs: 3_000,
    recoveryMaxMs: 30_000,
    ...patch,
  };
}

describe("save status", () => {
  it("describes a new map, a manual edit, and a saved autosave", () => {
    expect(saveStatus(clock({ path: null })).text).toBe("Not saved yet");
    expect(saveStatus(clock())).toEqual({ mark: "●", text: "Unsaved changes" });
    expect(saveStatus(clock({ dirty: false })).text).toBe("Saved");
    const auto = saveStatus(clock({ mode: "autosave", dirty: false, lastAutosaveAt: Date.parse("2026-10-20T14:32:00Z") }));
    expect(auto.mark).toBe("");
    expect(auto.text).toMatch(/^Saved \d{2}:\d{2}$/);
    expect(saveStatus(clock({ mode: "autosave", saving: true })).text).toBe("Autosaving…");
    expect(saveStatus(clock({ conflict: true })).text).toBe("Changed on disk");
  });
});

describe("when a write happens", () => {
  it("autosaves after a pause, at the maximum interval, and on blur or close", () => {
    const auto = clock({ mode: "autosave" });
    expect(shouldAutosave(auto, 11_000, "tick")).toBe(false);
    expect(shouldAutosave(auto, 12_000, "tick")).toBe(true);
    const busy = clock({ mode: "autosave", lastEditAt: 40_000, burstStartedAt: 10_000 });
    expect(shouldAutosave(busy, 40_500, "tick")).toBe(true);
    expect(shouldAutosave(auto, 10_100, "blur")).toBe(true);
    expect(shouldAutosave(auto, 10_100, "close")).toBe(true);
    expect(shouldAutosave(clock(), 30_000, "tick")).toBe(false);
    expect(shouldAutosave(clock({ mode: "autosave", path: null }), 30_000, "tick")).toBe(false);
    expect(shouldAutosave(clock({ mode: "autosave", paused: true }), 30_000, "close")).toBe(false);
  });

  it("writes a recovery file after idle time and while editing stays busy", () => {
    const pending = clock();
    expect(shouldWriteRecovery(pending, 12_000)).toBe(false);
    expect(shouldWriteRecovery(pending, 13_000)).toBe(true);
    const wrote = clock({ lastRecoveryAt: 13_000, lastEditAt: 13_000 });
    expect(shouldWriteRecovery(wrote, 14_000)).toBe(false);
    const busy = clock({ lastEditAt: 40_000, burstStartedAt: 0, lastRecoveryAt: 0 });
    expect(shouldWriteRecovery(busy, 40_000)).toBe(true);
  });

  it("rotates a backup on every manual save and only every few minutes while autosaving", () => {
    expect(shouldRotateBackup(clock(), 0)).toBe(true);
    const auto = clock({ mode: "autosave", lastBackupAt: 0 });
    expect(shouldRotateBackup(auto, 60_000)).toBe(false);
    expect(shouldRotateBackup(auto, 3 * 60_000)).toBe(true);
  });
});

describe("close prompts", () => {
  it("asks for a new map and for manual edits, and flushes a saved autosave tab", () => {
    expect(needsClosePrompt({ mode: "manual", path: null, dirty: false, paused: false, conflict: false })).toBe(true);
    expect(needsClosePrompt({ mode: "autosave", path: null, dirty: true, paused: false, conflict: false })).toBe(true);
    expect(needsClosePrompt({ mode: "manual", path: "/a", dirty: true, paused: false, conflict: false })).toBe(true);
    expect(needsClosePrompt({ mode: "manual", path: "/a", dirty: false, paused: false, conflict: false })).toBe(false);
    expect(needsClosePrompt({ mode: "autosave", path: "/a", dirty: true, paused: false, conflict: false })).toBe(false);
    expect(needsClosePrompt({ mode: "autosave", path: "/a", dirty: true, paused: true, conflict: false })).toBe(true);
  });
});
