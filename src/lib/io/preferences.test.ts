import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizePreferences } from "./preferences";

describe("preferences", () => {
  it("shows the axis gizmo unless the preference turns it off", () => {
    expect(DEFAULT_PREFERENCES.showAxisGizmo).toBe(true);
    expect(normalizePreferences({}).showAxisGizmo).toBe(true);
    expect(normalizePreferences({ showAxisGizmo: false }).showAxisGizmo).toBe(false);
  });
});
