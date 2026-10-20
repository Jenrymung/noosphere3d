import { describe, expect, it } from "vitest";
import { createEmptyMap } from "../core/document";
import { LinkIndex } from "../core/graph";
import type { MapDocument } from "../core/types";
import { chooseSpatialTarget, typicalSpacing } from "../input/spatial";
import { loadMap } from "../io/load";
import { serialize } from "../io/serialize";

function web(count: number): MapDocument {
  const doc = createEmptyMap({ id: "perf-web", title: "Perf", now: "2026-10-20T00:00:00.000Z" });
  for (let i = 0; i < count; i += 1) {
    doc.nodes[`n${i}`] = {
      text: `Node ${i}`,
      position: { x: i % 80, y: Math.floor(i / 80) % 40, z: i % 5 },
    };
    if (i > 0) {
      doc.links[`l${i}`] = { source: `n${i - 1}`, target: `n${i}`, typeId: "relates-to", text: "" };
    }
  }
  return doc;
}

function roundTrip(doc: MapDocument): number {
  const started = performance.now();
  const text = serialize(doc);
  const parsed = JSON.parse(text) as unknown;
  loadMap(parsed);
  return performance.now() - started;
}

describe("section 9 file size", () => {
  it("opens and saves a 5,000-node map in under a second", () => {
    const doc = web(5_000);
    expect(Object.keys(doc.nodes)).toHaveLength(5_000);
    const ms = roundTrip(doc);
    console.log(`5000-node serialize, parse, and load: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1_000);
  });

  it("opens and saves a 10,000-node map", () => {
    const doc = web(10_000);
    const started = performance.now();
    const loaded = loadMap(JSON.parse(serialize(doc)) as unknown);
    const ms = performance.now() - started;
    expect(Object.keys(loaded.doc.nodes)).toHaveLength(10_000);
    expect(LinkIndex.from(loaded.doc).byNode.size).toBe(10_000);
    console.log(`10000-node serialize, parse, load, and index: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(2_000);
  });

  it("picks a neighbour among 5,000 on-screen nodes quickly", () => {
    const candidates = Array.from({ length: 5_000 }, (_, index) => ({
      id: `n${index}`,
      screen: { x: index * 4, y: 100, depth: 10 },
      world: { x: index, y: 0, z: 0 },
      linked: index === 1,
    }));
    const currentWorld = { x: 0, y: 0, z: 0 };
    const spacingStarted = performance.now();
    const spacing = typicalSpacing([currentWorld, ...candidates.map((candidate) => candidate.world)]);
    const spacingMs = performance.now() - spacingStarted;
    console.log(`typical spacing for 5000 nodes: ${spacingMs.toFixed(1)} ms (${spacing.toFixed(2)})`);
    expect(spacingMs).toBeLessThan(250);
    const started = performance.now();
    const pick = chooseSpatialTarget({
      currentId: "n0",
      current: { x: 0, y: 100, depth: 10 },
      currentWorld,
      candidates,
      direction: "right",
      viewport: { width: 1280, height: 800 },
      typicalSpacing: spacing,
    });
    const ms = performance.now() - started;
    expect(pick.nextId).toBe("n1");
    console.log(`spatial pick among 5000 candidates: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
