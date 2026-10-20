import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { LinkIndex, visibleNeighbourIds } from "../core/graph";
import { createEmptyMap } from "../core/document";
import type { MapDocument, Vec3 } from "../core/types";
import { spatialNavConfig } from "./spatialNav.config";
import {
  chooseDepthTarget,
  chooseSpatialTarget,
  projectPoint,
  typicalSpacing,
  type ArrowDirection,
  type CameraFrame,
  type DepthSense,
  type ScreenPoint,
  type SpatialCandidate,
  type SpatialNavInput,
} from "./spatial";

const VIEWPORT = { width: 1280, height: 800 };

function at(id: string, x: number, y: number, depth = 10): SpatialCandidate {
  return { id, screen: { x, y, depth }, world: { x, y, z: depth } };
}

const origin: ScreenPoint = { x: 0, y: 0, depth: 10 };

function move(input: Omit<SpatialNavInput, "viewport" | "typicalSpacing" | "currentWorld"> & { currentWorld?: Vec3 }) {
  const currentWorld = input.currentWorld ?? { x: input.current.x, y: input.current.y, z: input.current.depth };
  return chooseSpatialTarget({
    ...input,
    currentWorld,
    viewport: VIEWPORT,
    typicalSpacing: typicalSpacing([currentWorld, ...input.candidates.map((candidate) => candidate.world)]),
  });
}

describe("spatial navigation", () => {
  it("picks the node in the arrow's direction", () => {
    const candidates = [at("right", 100, 4), at("left", -80, 2), at("up", 6, 90), at("down", -4, -70)];
    expect(move({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe("right");
    expect(move({ currentId: "c", current: origin, candidates, direction: "left" }).nextId).toBe("left");
    expect(move({ currentId: "c", current: origin, candidates, direction: "up" }).nextId).toBe("up");
    expect(move({ currentId: "c", current: origin, candidates, direction: "down" }).nextId).toBe("down");
  });

  it("prefers a nearer aligned node over a farther one", () => {
    const candidates = [at("far", 140, 8), at("near", 40, 0)];
    expect(move({ currentId: "c", current: origin, candidates, direction: "right" }).nextId).toBe("near");
  });

  it("widens to 90° and otherwise bumps", () => {
    const wide = move({
      currentId: "c",
      current: origin,
      candidates: [at("diag", 20, 70)],
      direction: "right",
    });
    expect(wide.widened).toBe(true);
    expect(wide.nextId).toBe("diag");
    const bump = move({
      currentId: "c",
      current: origin,
      candidates: [at("behind", -10, 80)],
      direction: "right",
    });
    expect(bump.bumped).toBe(true);
    expect(bump.nextId).toBeNull();
  });

  it("returns to the node just left when the opposite arrow is pressed", () => {
    const result = move({
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
          const result = move({ currentId: "c", current: origin, candidates, direction });
          if (!result.nextId) return;
          const chosen = candidates.find((candidate) => candidate.id === result.nextId)!;
          const dx = chosen.screen.x - origin.x;
          const dy = chosen.screen.y - origin.y;
          const length = Math.hypot(dx, dy);
          const axis = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }[direction];
          const dot = (dx / length) * axis[0] + (dy / length) * axis[1];
          const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
          const limit = ((result.widened ? spatialNavConfig.fallbackConeDeg : spatialNavConfig.coneHalfAngleDeg) * Math.PI) / 180 + 1e-6;
          expect(theta).toBeLessThanOrEqual(limit);
        },
      ),
      { numRuns: 40 },
    );
  });
});

const VIEW: Pick<CameraFrame, "fovDeg" | "width" | "height"> = { fovDeg: 50, width: 1280, height: 800 };

function fixture(nodes: Record<string, Vec3>, links: [string, string][] = [], hidden = false): MapDocument {
  const doc = createEmptyMap({ id: "fixture", now: "2026-10-20T00:00:00.000Z" });
  for (const [id, position] of Object.entries(nodes)) {
    doc.nodes[id] = { text: `# ${id}`, position };
  }
  links.forEach(([source, target], index) => {
    doc.links[`l${index}`] = { source, target, typeId: "relates-to", text: "" };
  });
  if (hidden) doc.view = { linkTypeFilters: { "relates-to": "hidden" } };
  return doc;
}

function aim(doc: MapDocument, camera: CameraFrame, currentId: string) {
  const current = projectPoint(doc.nodes[currentId].position, camera);
  if (!current) throw new Error(`selection ${currentId} is behind the camera`);
  const linked = visibleNeighbourIds(doc, LinkIndex.from(doc), currentId);
  const candidates: SpatialCandidate[] = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === currentId) continue;
    const screen = projectPoint(node.position, camera);
    if (!screen) continue;
    candidates.push({ id, screen, world: node.position, linked: linked.has(id) });
  }
  return {
    currentId,
    current,
    currentWorld: doc.nodes[currentId].position,
    candidates,
    viewport: { width: camera.width, height: camera.height },
    typicalSpacing: typicalSpacing(Object.values(doc.nodes).map((node) => node.position)),
    cameraPosition: camera.position,
  };
}

function arrow(doc: MapDocument, camera: CameraFrame, currentId: string, direction: ArrowDirection) {
  const { cameraPosition: _camera, ...input } = aim(doc, camera, currentId);
  return chooseSpatialTarget({ ...input, direction });
}

function depth(doc: MapDocument, camera: CameraFrame, currentId: string, sense: DepthSense) {
  const { currentId: _id, ...input } = aim(doc, camera, currentId);
  return chooseDepthTarget({ ...input, sense });
}

describe("section 6.3 layouts", () => {
  const gridNodes: Record<string, Vec3> = {};
  for (const [id, x, y] of [
    ["nw", -2, 2],
    ["n", 0, 2],
    ["ne", 2, 2],
    ["w", -2, 0],
    ["sel", 0, 0],
    ["e", 2, 0],
    ["sw", -2, -2],
    ["s", 0, -2],
    ["se", 2, -2],
  ] as const) {
    gridNodes[id] = { x, y, z: 0 };
  }
  const gridCamera: CameraFrame = { ...VIEW, position: { x: 0, y: 0, z: 14 }, target: { x: 0, y: 0, z: 0 } };
  const grid = fixture(gridNodes, [
    ["sel", "e"],
    ["sel", "w"],
    ["sel", "n"],
    ["sel", "s"],
  ]);

  it("walks a facing grid to the orthogonal neighbour", () => {
    expect(arrow(grid, gridCamera, "sel", "right").nextId).toBe("e");
    expect(arrow(grid, gridCamera, "sel", "left").nextId).toBe("w");
    expect(arrow(grid, gridCamera, "sel", "up").nextId).toBe("n");
    expect(arrow(grid, gridCamera, "sel", "down").nextId).toBe("s");
    expect(depth(grid, gridCamera, "sel", "closer")).toBeNull();
    expect(depth(grid, gridCamera, "sel", "further")).toBeNull();
  });

  it("stays in the near cluster, and depth steps into the far one", () => {
    const doc = fixture(
      {
        sel: { x: 0, y: 0, z: 0 },
        east: { x: 2, y: 0, z: 0 },
        west: { x: -2, y: 0, z: 0 },
        north: { x: 0, y: 2, z: 0 },
        south: { x: 0, y: -2, z: 0 },
        "far-core": { x: 0.15, y: 0.05, z: -22 },
        "far-e": { x: 2.2, y: 0.1, z: -22 },
        "far-w": { x: -1.8, y: -0.05, z: -22 },
        "far-n": { x: 0.2, y: 2.1, z: -22.3 },
      },
      [
        ["sel", "east"],
        ["sel", "west"],
        ["sel", "north"],
        ["sel", "south"],
        ["far-core", "far-e"],
      ],
    );
    const camera: CameraFrame = { ...VIEW, position: { x: 0, y: 0, z: 16 }, target: { x: 0, y: 0, z: 0 } };
    expect(arrow(doc, camera, "sel", "right").nextId).toBe("east");
    expect(arrow(doc, camera, "sel", "left").nextId).toBe("west");
    expect(arrow(doc, camera, "sel", "up").nextId).toBe("north");
    expect(arrow(doc, camera, "sel", "down").nextId).toBe("south");
    expect(depth(doc, camera, "sel", "closer")).toBeNull();
    expect(depth(doc, camera, "sel", "further")).toBe("far-core");
  });

  it("walks a line that recedes in depth one step at a time", () => {
    const doc = fixture(
      {
        a: { x: 0, y: 0, z: 0 },
        b: { x: 1.2, y: 0, z: -1.6 },
        c: { x: 2.4, y: 0, z: -3.2 },
        d: { x: 3.6, y: 0, z: -4.8 },
        above: { x: 1.2, y: 2, z: -1.6 },
        below: { x: 1.2, y: -2, z: -1.6 },
      },
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["b", "above"],
        ["b", "below"],
      ],
    );
    const camera: CameraFrame = { ...VIEW, position: { x: -2, y: 0, z: 10 }, target: { x: 1.8, y: 0, z: -2.4 } };
    expect(arrow(doc, camera, "b", "right").nextId).toBe("c");
    expect(arrow(doc, camera, "b", "left").nextId).toBe("a");
    expect(arrow(doc, camera, "b", "up").nextId).toBe("above");
    expect(arrow(doc, camera, "b", "down").nextId).toBe("below");
    expect(depth(doc, camera, "b", "closer")).toBe("a");
    expect(depth(doc, camera, "b", "further")).toBe("c");
  });

  it("prefers the linked node when screen distance matches, unless that type is hidden", () => {
    const nodes = {
      sel: { x: 0, y: 0, z: 0 },
      linked: { x: 2.4, y: 0.7, z: 0 },
      plain: { x: 2.4, y: -0.15, z: 0 },
      west: { x: -2.2, y: 0, z: 0 },
      north: { x: 0, y: 2.2, z: 0 },
      south: { x: 0, y: -2.2, z: 0 },
    };
    const links: [string, string][] = [
      ["sel", "linked"],
      ["sel", "west"],
      ["sel", "north"],
      ["sel", "south"],
    ];
    const camera: CameraFrame = { ...VIEW, position: { x: 0, y: 0, z: 12 }, target: { x: 0, y: 0, z: 0 } };
    const shown = fixture(nodes, links);
    expect(arrow(shown, camera, "sel", "right").nextId).toBe("linked");
    expect(arrow(shown, camera, "sel", "left").nextId).toBe("west");
    expect(arrow(shown, camera, "sel", "up").nextId).toBe("north");
    expect(arrow(shown, camera, "sel", "down").nextId).toBe("south");
    expect(depth(shown, camera, "sel", "closer")).toBeNull();
    expect(depth(shown, camera, "sel", "further")).toBeNull();

    const concealed = fixture(nodes, links, true);
    expect(arrow(concealed, camera, "sel", "right").nextId).toBe("plain");
  });

  it("keeps a node on the 60° edge and leaves one just outside for the widen", () => {
    const degrees = Math.PI / 180;
    const edgeReach = 3;
    const outsideReach = 1.8;
    const doc = fixture(
      {
        sel: { x: 0, y: 0, z: 0 },
        edge: { x: edgeReach * Math.cos(60 * degrees), y: edgeReach * Math.sin(60 * degrees), z: 0 },
        outside: { x: outsideReach * Math.cos(61 * degrees), y: outsideReach * Math.sin(61 * degrees), z: 0 },
        west: { x: -2.5, y: 0, z: 0 },
        north: { x: 0, y: 2.5, z: 0 },
        south: { x: 0, y: -2.5, z: 0 },
      },
      [
        ["sel", "west"],
        ["sel", "north"],
        ["sel", "south"],
      ],
    );
    const camera: CameraFrame = { ...VIEW, position: { x: 0, y: 0, z: 12 }, target: { x: 0, y: 0, z: 0 } };
    expect(arrow(doc, camera, "sel", "right").nextId).toBe("edge");
    expect(arrow(doc, camera, "sel", "left").nextId).toBe("west");
    expect(arrow(doc, camera, "sel", "up").nextId).toBe("outside");
    expect(arrow(doc, camera, "sel", "down").nextId).toBe("south");
    expect(depth(doc, camera, "sel", "closer")).toBeNull();
    expect(depth(doc, camera, "sel", "further")).toBeNull();
  });
});
