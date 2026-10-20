import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { chooseDepthTarget, chooseSpatialTarget, projectPoint, type ScreenPoint, type SpatialCandidate } from "./spatial";

function at(id: string, x: number, y: number, depth = 10): SpatialCandidate {
  return { id, screen: { x, y, depth } };
}

const origin: ScreenPoint = { x: 0, y: 0, depth: 10 };

describe("spatial navigation", () => {
  it("picks the node in the arrow's direction", () => {
    const candidates = [at("right", 100, 4), at("left", -80, 2), at("up", 6, 90), at("down", -4, -70)];
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe(
      "right",
    );
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "left" }).nextId).toBe("left");
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "up" }).nextId).toBe("up");
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "down" }).nextId).toBe("down");
  });

  it("prefers a nearer aligned node over a farther one", () => {
    const candidates = [at("far", 140, 8), at("near", 40, 0)];
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe(
      "near",
    );
  });

  it("widens to 90° and otherwise bumps", () => {
    const wide = chooseSpatialTarget({
      currentId: "c",
      current: origin,
      candidates: [at("diag", 20, 70)],
      direction: "right",
    });
    expect(wide.widened).toBe(true);
    expect(wide.nextId).toBe("diag");
    const bump = chooseSpatialTarget({
      currentId: "c",
      current: origin,
      candidates: [at("behind", -10, 80)],
      direction: "right",
    });
    expect(bump.bumped).toBe(true);
    expect(bump.nextId).toBeNull();
  });

  it("returns to the node just left when the opposite arrow is pressed", () => {
    const result = chooseSpatialTarget({
      currentId: "b",
      current: { x: 50, y: 0, depth: 10 },
      candidates: [at("a", 0, 0), at("other", 10, 30)],
      direction: "left",
      previousId: "a",
      previousDirection: "right",
    });
    expect(result.reversed).toBe(true);
    expect(result.nextId).toBe("a");
  });

  it("skips a far node that projects onto the selection", () => {
    const candidates = [at("alias", 6, 2, 40), at("side", 70, 8, 11)];
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe(
      "side",
    );
  });

  it("penalises a large depth jump when screen scores are close", () => {
    const candidates = [at("same", 50, 0, 10), at("deep", 48, 0, 40)];
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe(
      "same",
    );
  });

  it("steps in depth toward a node that is close on screen", () => {
    const candidates = [at("near", 12, 4, 6), at("far", 10, 0, 30), at("side", 200, 0, 4)];
    expect(chooseDepthTarget(origin, candidates, "closer")).toBe("near");
    expect(chooseDepthTarget(origin, candidates, "further")).toBe("far");
  });

  it("projects a point in front of the camera and rejects one behind it", () => {
    const camera = {
      position: { x: 0, y: 0, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      fovDeg: 90,
      width: 100,
      height: 100,
    };
    const center = projectPoint({ x: 0, y: 0, z: 0 }, camera);
    expect(center?.x).toBeCloseTo(50);
    expect(center?.y).toBeCloseTo(50);
    expect(center?.depth).toBeCloseTo(10);
    const edge = projectPoint({ x: 10, y: 0, z: 0 }, camera);
    expect(edge?.x).toBeCloseTo(100);
    expect(projectPoint({ x: 0, y: 0, z: 20 }, camera)).toBeNull();
  });

  it("never picks a candidate outside the cone it claims to use", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: fc.integer({ min: -400, max: 400 }), y: fc.integer({ min: -400, max: 400 }) }), {
          minLength: 1,
          maxLength: 25,
        }),
        fc.constantFrom("left" as const, "right" as const, "up" as const, "down" as const),
        (points, direction) => {
          const candidates = points.map((point, index) => at(`p${index}`, point.x, point.y));
          const result = chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction });
          if (!result.nextId) return;
          const chosen = candidates.find((candidate) => candidate.id === result.nextId)!;
          const dx = chosen.screen.x - origin.x;
          const dy = chosen.screen.y - origin.y;
          const length = Math.hypot(dx, dy);
          const axis = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }[direction];
          const dot = (dx / length) * axis[0] + (dy / length) * axis[1];
          const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
          const limit = ((result.widened ? 90 : 60) * Math.PI) / 180 + 1e-6;
          expect(theta).toBeLessThanOrEqual(limit);
        },
      ),
      { numRuns: 40 },
    );
  });
});
