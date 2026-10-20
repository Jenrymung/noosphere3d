import { describe, expect, it } from "vitest";
import { arrowProjectChunk, arrowScreenScale } from "./arrowScale";
import { placeNode } from "./placement";

function length(value: { x: number; y: number; z: number }): number {
  return Math.hypot(value.x, value.y, value.z);
}

describe("auto placement", () => {
  const forward = { x: 0, y: 0, z: -1 };

  it("keeps existing nodes where they are and leaves a gap", () => {
    const existing = [
      { x: 0, y: 0, z: 0 },
      { x: 2.2, y: 0, z: 0 },
    ];
    const snapshot = existing.map((point) => ({ ...point }));
    const placed = placeNode({
      anchor: existing[0],
      existing,
      neighbours: [existing[1]],
      forward,
      baseDistance: 2.4,
      clearance: 1.4,
    });
    expect(existing).toEqual(snapshot);
    for (const other of existing) {
      expect(length({ x: placed.x - other.x, y: placed.y - other.y, z: placed.z - other.z })).toBeGreaterThan(1.2);
    }
    expect(placed.x).toBeLessThan(0.4);
  });

  it("steps farther out when the base ring is crowded", () => {
    const existing = [{ x: 0, y: 0, z: 0 }];
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      existing.push({ x: Math.cos(angle) * 2.4, y: Math.sin(angle) * 0.2, z: Math.sin(angle) * 2.4 });
    }
    const placed = placeNode({
      anchor: existing[0],
      existing,
      neighbours: existing.slice(1, 4),
      forward,
      baseDistance: 2.4,
      clearance: 1.3,
    });
    const distance = length(placed);
    expect(distance).toBeGreaterThan(2.8);
  });

  it("puts an unlinked node in front of the camera", () => {
    const placed = placeNode({
      anchor: { x: 0, y: 0, z: 0 },
      existing: [],
      neighbours: [],
      forward,
      prefer: forward,
      baseDistance: 2.4,
    });
    expect(placed.z).toBeLessThan(-1);
  });
});

describe("arrowhead screen size", () => {
  it("grows a distant cone up to the minimum and leaves a near one alone", () => {
    const tan = Math.tan((50 * Math.PI) / 180 / 2);
    const near = arrowScreenScale({ worldHeight: 0.32, distance: 6, tanHalfFov: tan, viewportHeight: 900 });
    const far = arrowScreenScale({ worldHeight: 0.22, distance: 80, tanHalfFov: tan, viewportHeight: 900 });
    const chunk = arrowProjectChunk();
    expect(chunk).toContain("uMinPx");
    expect(chunk).toContain("0.32");
    expect(chunk).toContain("boost");
    expect(near).toBe(1);
    expect(far).toBeGreaterThan(2);
  });
});
