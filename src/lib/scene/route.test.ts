import { describe, expect, it } from "vitest";
import { urbanFloodingDocument } from "../io/sampleMap";
import { sortedWaypoints } from "../core/graph";
import { axisOffset, fanSlots, iconRadius, routeLink, type FanLink, type Vec } from "./route";

function length(value: Vec): number {
  return Math.hypot(value.x, value.y, value.z);
}

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleBetween(a: Vec, b: Vec): number {
  const denom = length(a) * length(b);
  if (denom < 1e-8) return 0;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

describe("link routing", () => {
  const source = { x: 0, y: 0, z: 0 };
  const target = { x: 4, y: 0, z: 0 };

  it("fans two links to opposite sides and three links at 120 degrees", () => {
    const pair = [0, 1].map((fanIndex) =>
      routeLink({ source, target, sourceRadius: 0.4, targetRadius: 0.4, fanIndex, fanCount: 2 }),
    );
    const offsets = pair.map((route) => axisOffset(route.label, source, target));
    expect(angleBetween(offsets[0], offsets[1])).toBeGreaterThan(170);

    const triple = [0, 1, 2].map((fanIndex) =>
      routeLink({ source, target, sourceRadius: 0.4, targetRadius: 0.4, fanIndex, fanCount: 3 }),
    );
    const tripleOffsets = triple.map((route) => axisOffset(route.label, source, target));
    expect(angleBetween(tripleOffsets[0], tripleOffsets[1])).toBeGreaterThan(110);
    expect(angleBetween(tripleOffsets[0], tripleOffsets[1])).toBeLessThan(130);
    expect(angleBetween(tripleOffsets[1], tripleOffsets[2])).toBeGreaterThan(110);
    expect(angleBetween(tripleOffsets[1], tripleOffsets[2])).toBeLessThan(130);
  });

  it("arches a single link upward so the bow is visible from a level camera", () => {
    const route = routeLink({ source, target, sourceRadius: 0.4, targetRadius: 0.4, fanCount: 1 });
    expect(route.label.y).toBeGreaterThan(0.25);
  });

  it("grows the bow as more links share the pair", () => {
    const one = routeLink({ source, target, sourceRadius: 0.3, targetRadius: 0.3, fanIndex: 0, fanCount: 1 });
    const crowded = routeLink({ source, target, sourceRadius: 0.3, targetRadius: 0.3, fanIndex: 0, fanCount: 5 });
    expect(length(axisOffset(crowded.label, source, target))).toBeGreaterThan(length(axisOffset(one.label, source, target)));
  });

  it("stops the curve on the node surface so arrowheads sit outside the icon", () => {
    const route = routeLink({ source, target, sourceRadius: 0.5, targetRadius: 0.5, fanCount: 1 });
    expect(distance(route.points[0], source)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(distance(route.points[route.points.length - 1], target)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(route.endDirection.x).toBeGreaterThan(0.7);
  });

  it("draws a self-link loop with the label at the top", () => {
    const route = routeLink({
      source,
      target: source,
      sourceRadius: 0.4,
      targetRadius: 0.4,
    });
    expect(route.label.y).toBeGreaterThan(0.4);
    for (const point of route.points) expect(point.y).toBeLessThanOrEqual(route.label.y + 1e-6);
    expect(Math.min(...route.points.map((point) => distance(point, source)))).toBeGreaterThanOrEqual(0.4);
  });

  it("leaves waypoint links out of the fan and threads the sample pins", () => {
    const doc = urbanFloodingDocument();
    const links: FanLink[] = Object.entries(doc.links).map(([id, link]) => ({
      id,
      source: link.source,
      target: link.target,
      hasWaypoints: sortedWaypoints(link).length > 0,
    }));
    const slots = fanSlots(links);
    expect(slots.get("l1")).toEqual({ fanIndex: 0, fanCount: 2, auto: true });
    expect(slots.get("l2")).toEqual({ fanIndex: 1, fanCount: 2, auto: true });
    expect(slots.get("l3")?.auto).toBe(false);
    expect(slots.get("l4")).toEqual({ fanIndex: 0, fanCount: 1, auto: true });

    const rain = doc.nodes["n-rain"].position;
    const flood = doc.nodes["n-flood"].position;
    const causes = routeLink({
      source: rain,
      target: flood,
      sourceRadius: iconRadius(doc.nodes["n-rain"].style?.size),
      targetRadius: iconRadius(doc.nodes["n-flood"].style?.size),
      fanIndex: 0,
      fanCount: 2,
    });
    const related = routeLink({
      source: rain,
      target: flood,
      sourceRadius: iconRadius(doc.nodes["n-rain"].style?.size),
      targetRadius: iconRadius(doc.nodes["n-flood"].style?.size),
      fanIndex: 1,
      fanCount: 2,
    });
    expect(angleBetween(axisOffset(causes.label, rain, flood), axisOffset(related.label, rain, flood))).toBeGreaterThan(170);

    const drainage = doc.links.l3;
    const pins = sortedWaypoints(drainage).map((entry) => entry.waypoint.position);
    const routed = routeLink({
      source: doc.nodes[drainage.source].position,
      target: doc.nodes[drainage.target].position,
      sourceRadius: iconRadius(),
      targetRadius: iconRadius(),
      waypoints: pins,
      labelSegment: drainage.style?.labelSegment,
    });
    for (const pin of pins) {
      expect(routed.points.some((point) => distance(point, pin) < 1e-3)).toBe(true);
    }
    const segmentMid = {
      x: (pins[0].x + pins[1].x) / 2,
      y: (pins[0].y + pins[1].y) / 2,
      z: (pins[0].z + pins[1].z) / 2,
    };
    expect(distance(routed.label, segmentMid)).toBeLessThan(distance(routed.label, doc.nodes["n-flood"].position));
  });
});
