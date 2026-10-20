import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { urbanFloodingDocument } from "../io/sampleMap";
import { stressMap } from "../scene/dummyMap";
import type { MapDocument, Vec3 } from "../core/types";
import {
  chooseDepthTarget,
  chooseSpatialTarget,
  projectPoint,
  type ArrowDirection,
  type CameraFrame,
  type ScreenPoint,
  type SpatialCandidate,
} from "./spatial";

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

  it("prefers a linked node over a closer unlinked diagonal", () => {
    const candidates = [
      at("diagonal", 40, 4, 12),
      { ...at("linked", 110, 10, 10), linked: true },
    ];
    expect(chooseSpatialTarget({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe(
      "linked",
    );
  });

  it("ranks a far node on the selection below a side node", () => {
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

const VIEW: Pick<CameraFrame, "fovDeg" | "width" | "height"> = { fovDeg: 50, width: 1280, height: 800 };

function neighbourIds(doc: MapDocument, nodeId: string): Set<string> {
  const ids = new Set<string>();
  for (const link of Object.values(doc.links)) {
    if (link.source === nodeId && link.target !== nodeId) ids.add(link.target);
    if (link.target === nodeId && link.source !== nodeId) ids.add(link.source);
  }
  return ids;
}

function projected(
  doc: MapDocument,
  camera: CameraFrame,
  currentId: string,
): { current: ScreenPoint; candidates: SpatialCandidate[] } {
  const current = projectPoint(doc.nodes[currentId].position, camera);
  if (!current) throw new Error(`selection ${currentId} is behind the camera`);
  const linked = neighbourIds(doc, currentId);
  const candidates: SpatialCandidate[] = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === currentId) continue;
    const screen = projectPoint(node.position, camera);
    if (!screen) continue;
    candidates.push({ id, screen, linked: linked.has(id) });
  }
  return { current, candidates };
}

function step(doc: MapDocument, camera: CameraFrame, currentId: string, direction: ArrowDirection): string | null {
  const { current, candidates } = projected(doc, camera, currentId);
  return chooseSpatialTarget({ currentId, current, candidates, direction }).nextId;
}

describe("spatial layouts", () => {
  it("steps along the cubic lattice instead of the diagonal or a far cluster", () => {
    const doc = stressMap();
    const here = doc.nodes["s2-3-3-2"].position;
    const camera: CameraFrame = {
      ...VIEW,
      position: { x: here.x + 7, y: here.y + 5, z: here.z + 9 },
      target: here,
    };
    expect(step(doc, camera, "s2-3-3-2", "right")).toBe("s2-4-3-2");
    expect(step(doc, camera, "s2-3-3-2", "left")).toBe("s2-2-3-2");
    expect(step(doc, camera, "s2-3-3-2", "up")).toBe("s2-3-4-2");
    expect(step(doc, camera, "s2-3-3-2", "down")).toBe("s2-3-2-2");
  });

  it("moves through the urban-flooding sample along its links", () => {
    const doc = urbanFloodingDocument();
    const camera: CameraFrame = {
      ...VIEW,
      position: doc.view!.camera!.position,
      target: doc.view!.camera!.target,
      fovDeg: doc.view!.camera!.fov ?? 50,
    };
    expect(step(doc, camera, "n-flood", "right")).toBe("n-drainage");
    expect(step(doc, camera, "n-flood", "left")).toBe("n-rain");
    const { current, candidates } = projected(doc, camera, "n-flood");
    const up = chooseSpatialTarget({ currentId: "n-flood", current, candidates, direction: "up" });
    expect(up.widened).toBe(true);
    expect(up.nextId).toBe("n-rain");
    expect(step(doc, camera, "n-rain", "right")).toBe("n-flood");
    expect(step(doc, camera, "n-drainage", "left")).toBe("n-flood");
  });

  it("stays inside a dense cluster that sits in front of a far one", () => {
    const doc = urbanFloodingDocument();
    doc.nodes = {};
    doc.links = {};
    const place = (id: string, position: Vec3, title: string) => {
      doc.nodes[id] = { text: `# ${title}`, position };
    };
    const link = (id: string, source: string, target: string) => {
      doc.links[id] = { source, target, typeId: "relates-to", text: "" };
    };
    place("sel", { x: 0, y: 0, z: 0 }, "Here");
    place("east", { x: 1.7, y: 0.1, z: 0.1 }, "East");
    place("west", { x: -1.7, y: -0.1, z: 0 }, "West");
    place("north", { x: 0.1, y: 1.7, z: -0.1 }, "North");
    place("south", { x: -0.05, y: -1.7, z: 0.1 }, "South");
    place("diag", { x: 0.9, y: -0.45, z: 0.7 }, "Diagonal");
    place("pack", { x: 0.4, y: 0.35, z: -0.2 }, "Packed");
    place("far-a", { x: 0.15, y: -8, z: -28 }, "Far A");
    place("far-b", { x: 1.35, y: -7.6, z: -28.6 }, "Far B");
    place("far-c", { x: -0.65, y: -6.9, z: -27.6 }, "Far C");
    place("far-d", { x: 0.65, y: -8.7, z: -29.2 }, "Far D");
    link("l-east", "sel", "east");
    link("l-west", "sel", "west");
    link("l-north", "sel", "north");
    link("l-south", "sel", "south");
    link("l-far", "far-a", "far-b");
    link("l-far-2", "far-b", "far-c");
    link("l-far-3", "far-c", "far-d");
    const camera: CameraFrame = {
      ...VIEW,
      position: { x: 0, y: 3, z: 14 },
      target: { x: 0, y: 0, z: 0 },
    };
    expect(step(doc, camera, "sel", "right")).toBe("east");
    expect(step(doc, camera, "sel", "left")).toBe("west");
    expect(step(doc, camera, "sel", "up")).toBe("north");
    expect(step(doc, camera, "sel", "down")).toBe("south");
  });
});
