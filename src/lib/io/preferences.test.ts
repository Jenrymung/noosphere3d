import { describe, expect, it } from "vitest";
import { addFavourite, DEFAULT_PREFERENCES, normalizePreferences, removeFavourite } from "./preferences";

describe("preferences", () => {
  it("shows the axis gizmo unless the preference turns it off", () => {
    expect(DEFAULT_PREFERENCES.showAxisGizmo).toBe(true);
    expect(normalizePreferences({}).showAxisGizmo).toBe(true);
    expect(normalizePreferences({ showAxisGizmo: false }).showAxisGizmo).toBe(false);
  });

  it("keeps the pre-made maps until the owner removes them, and never needs a file delete", () => {
    expect(normalizePreferences({}).favouriteMaps.map((item) => item.builtin)).toEqual(["stress", "sample"]);
    expect(normalizePreferences({ favouriteMaps: [] }).favouriteMaps).toEqual([]);
    const withFile = addFavourite(DEFAULT_PREFERENCES.favouriteMaps, {
      id: "file:/maps/city.mindmap3d",
      label: "city",
      kind: "file",
      path: "/maps/city.mindmap3d",
    });
    expect(withFile.added).toBe(true);
    expect(withFile.list).toHaveLength(3);
    const again = addFavourite(withFile.list, withFile.list[2]!);
    expect(again.added).toBe(false);
    const removed = removeFavourite(withFile.list, "builtin-sample");
    expect(removed.map((item) => item.id)).toEqual(["builtin-stress", "file:/maps/city.mindmap3d"]);
    expect(removed.find((item) => item.kind === "file")?.path).toBe("/maps/city.mindmap3d");
    const stored = normalizePreferences({ favouriteMaps: removed });
    expect(stored.favouriteMaps.map((item) => item.label)).toEqual(["2,304 nodes", "city"]);
  });
});
