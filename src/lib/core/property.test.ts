import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { generateKeyBetween } from "fractional-indexing";
import { LinkIndex, sortedLinkTypes, sortedWaypoints } from "./graph";
import { MapSession } from "./session";
import type { Command } from "./commands";
import { checkInvariants } from "../io/integrity";
import { loadMap } from "../io/load";
import { serialize } from "../io/serialize";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

describe("command sequences", () => {
  it("undo, redo, round-trip and indexes hold for random webs", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), fc.integer({ min: 12, max: 28 }), (seed, steps) => {
        const rand = mulberry32(seed);
        const session = MapSession.create({ id: "prop", title: "Property", now: "2026-10-20T00:00:00.000Z" });
        const original = structuredClone(session.doc);
        const nodeIds: string[] = [];
        const linkIds: string[] = [];
        let serial = 0;

        for (let step = 0; step < steps; step += 1) {
          const command = nextCommand(step);
          if (!command) continue;
          session.dispatch(command);
          expect(checkInvariants(session.doc)).toEqual([]);
          expect(session.index.snapshot()).toEqual(LinkIndex.from(session.doc).snapshot());
        }

        const finalDoc = structuredClone(session.doc);
        const depth = session.history.undoDepth;
        for (let i = 0; i < depth; i += 1) expect(session.undo()).toBe(true);
        expect(session.doc).toEqual(original);
        expect(session.index.snapshot()).toEqual(LinkIndex.from(session.doc).snapshot());
        for (let i = 0; i < depth; i += 1) expect(session.redo()).toBe(true);
        expect(session.doc).toEqual(finalDoc);

        const text = serialize(session.doc);
        expect(serialize(loadMap(JSON.parse(text)).doc)).toBe(text);
        expect(session.doc.links).toBeDefined();

        function nextCommand(step: number): Command | null {
          const roll = rand();
          if (nodeIds.length < 3 || roll < 0.16) {
            const id = `n${serial++}`;
            nodeIds.push(id);
            return {
              type: "addNode",
              id,
              node: {
                text: roll < 0.08 ? `plain ${id}` : `# Node ${id}`,
                position: { x: Math.round(rand() * 20) - 10, y: Math.round(rand() * 10), z: Math.round(rand() * 8) },
                ...(rand() < 0.2 ? { title: rand() < 0.5 ? `Title ${id}` : "  spaced\nname " } : {}),
              },
            };
          }
          if (roll < 0.28) {
            return {
              type: "editText",
              target: "node",
              id: pick(rand, nodeIds),
              text: `edited ${step}`,
            };
          }
          if (roll < 0.36) {
            return {
              type: "setTitle",
              target: "node",
              id: pick(rand, nodeIds),
              title: rand() < 0.2 ? null : `Name ${step}`,
            };
          }
          if (roll < 0.46) {
            const id = pick(rand, nodeIds);
            return {
              type: "moveNodes",
              moves: [{ id, position: { x: rand() * 5, y: rand() * 5, z: rand() * 5 } }],
            };
          }
          if (roll < 0.62 || linkIds.length === 0) {
            const source = pick(rand, nodeIds);
            const target = rand() < 0.08 ? source : pick(rand, nodeIds);
            const id = `l${serial++}`;
            linkIds.push(id);
            const typeId = pick(rand, sortedLinkTypes(session.doc)).id;
            return { type: "addLink", id, link: { source, target, typeId, text: rand() < 0.5 ? "" : `# Why ${step}` } };
          }
          const liveLinks = linkIds.filter((id) => session.doc.links[id]);
          if (liveLinks.length === 0) {
            const source = pick(rand, nodeIds);
            const id = `l${serial++}`;
            linkIds.push(id);
            return {
              type: "addLink",
              id,
              link: { source, target: source, typeId: "relates-to", text: "" },
            };
          }
          if (roll < 0.7) {
            return {
              type: "setLinkType",
              linkId: pick(rand, liveLinks),
              typeId: pick(rand, sortedLinkTypes(session.doc)).id,
            };
          }
          if (roll < 0.76) {
            return { type: "reverseLink", linkId: pick(rand, liveLinks) };
          }
          if (roll < 0.82) {
            const types = sortedLinkTypes(session.doc);
            if (types.length < 2) return null;
            const victim = types[types.length - 1];
            const keep = types[0];
            return { type: "deleteLinkType", id: victim.id, reassignTo: keep.id };
          }
          if (roll < 0.88) {
            const id = `t${serial++}`;
            const types = sortedLinkTypes(session.doc);
            return {
              type: "addLinkType",
              id,
              linkType: {
                order: generateKeyBetween(types.at(-1)?.type.order ?? null, null),
                name: `type ${id}`,
                color: "#336699",
                pattern: "dashed",
                width: "normal",
                direction: rand() < 0.5 ? "directed" : "undirected",
              },
            };
          }
          if (roll < 0.94) {
            const linkId = pick(rand, liveLinks);
            const link = session.doc.links[linkId];
            if (!link || Object.keys(link.waypoints ?? {}).length >= 64) return null;
            const last = sortedWaypoints(link).at(-1)?.waypoint.order ?? null;
            const waypointId = `w${serial++}`;
            return {
              type: "addWaypoint",
              linkId,
              waypointId,
              waypoint: {
                order: generateKeyBetween(last, null),
                position: { x: rand(), y: rand(), z: rand() },
              },
            };
          }
          const nodeId = pick(rand, nodeIds);
          nodeIds.splice(nodeIds.indexOf(nodeId), 1);
          for (let i = linkIds.length - 1; i >= 0; i -= 1) {
            const link = session.doc.links[linkIds[i]];
            if (link && (link.source === nodeId || link.target === nodeId)) linkIds.splice(i, 1);
          }
          return { type: "deleteNodes", ids: [nodeId] };
        }
      }),
      { numRuns: 25 },
    );
  });
});
