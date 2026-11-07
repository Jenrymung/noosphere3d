import { describe, expect, it } from "vitest";
import { grabPositionOnPlane, intersectRayPlane } from "./grabPlane";

describe("camera-plane grab", () => {
  it("hits the camera-facing plane at the node's depth", () => {
    const hit = intersectRayPlane(
      { x: 2, y: -1, z: 10 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    expect(hit).toEqual({ x: 2, y: -1, z: 0 });
    expect(intersectRayPlane({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeNull();
  });

  it("tracks the cursor 1:1, and Shift keeps a fifth of that travel", () => {
    const origin = { x: 1, y: 2, z: 3 };
    const anchor = { x: 4, y: 5, z: 3 };
    const current = { x: 9, y: 1, z: 3 };
    expect(grabPositionOnPlane({ origin, anchorHit: anchor, currentHit: current, precision: false })).toEqual({
      x: 6,
      y: -2,
      z: 3,
    });
    expect(grabPositionOnPlane({ origin, anchorHit: anchor, currentHit: current, precision: true })).toEqual({
      x: 2,
      y: 1.2,
      z: 3,
    });
  });
});
