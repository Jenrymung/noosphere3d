import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../io/preferences";
import { shouldAutosave, shouldWriteRecovery } from "../io/saveController";
import {
  clockFor,
  ensureSuffix,
  freshTrack,
  isDirty,
  markEdited,
  markSaved,
  promptFor,
  resolveTheme,
  statusFor,
  fileStem,
  mapDisplayName,
  windowTitle,
} from "./tabState";

describe("tab save state", () => {
  it("treats a new map as unsaved and a matching history id as clean", () => {
    const track = freshTrack("rec", { edited: true, now: 1_000 });
    expect(isDirty(track, 1)).toBe(true);
    expect(statusFor(track, DEFAULT_PREFERENCES, 1).text).toBe("Not saved yet");
    expect(promptFor(track, DEFAULT_PREFERENCES, 1)).toBe(true);
    markSaved(track, 1, { modifiedMs: 2_000, len: 12 }, 2_000, true);
    track.path = "notes.mindmap3d";
    expect(isDirty(track, 1)).toBe(false);
    expect(statusFor(track, DEFAULT_PREFERENCES, 1)).toEqual({ mark: "", text: "Saved" });
    markEdited(track, 2, 3_000);
    expect(isDirty(track, 2)).toBe(true);
    markEdited(track, 1, 4_000);
    expect(track.lastEditAt).toBeNull();
    expect(isDirty(track, 1)).toBe(false);
    expect(promptFor(track, DEFAULT_PREFERENCES, 1)).toBe(false);
  });

  it("does not write a recovery clock when the history id is the saved one", () => {
    const track = freshTrack("rec", { edited: true, now: 0 });
    markEdited(track, 0, 5_000);
    const clock = clockFor(track, DEFAULT_PREFERENCES, 0);
    expect(shouldWriteRecovery(clock, 10_000)).toBe(false);
    expect(shouldAutosave({ ...clock, mode: "autosave", path: "a.mindmap3d" }, 10_000, "tick")).toBe(false);
  });

  it("names files and the window", () => {
    expect(ensureSuffix("Flood")).toBe("Flood.mindmap3d");
    expect(ensureSuffix("Flood.mindmap3d")).toBe("Flood.mindmap3d");
    expect(windowTitle("●", "Flood")).toBe("● Flood — Noosphere 3D");
    expect(windowTitle("", "Flood")).toBe("Flood — Noosphere 3D");
    expect(fileStem("C:\\maps\\notes.mindmap3d")).toBe("notes");
    expect(fileStem("/maps/Urban flooding.mindmap3d")).toBe("Urban flooding");
    expect(mapDisplayName("Urban flooding", "/maps/city.mindmap3d")).toBe("city");
    expect(mapDisplayName("Urban flooding", null)).toBe("Urban flooding");
    expect(mapDisplayName("", null)).toBe("Untitled map");
    expect(mapDisplayName(undefined, "   ")).toBe("Untitled map");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
