import { CatmullRomCurve3, Vector3 } from "three";
import { pairKey } from "../core/graph";

/** Plain positions so routing can be tested without a scene graph. */
export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface FanLink {
  id: string;
  source: string;
  target: string;
  /** Waypoint routes are drawn, but they do not take a slot in the auto fan. */
  hasWaypoints: boolean;
}

export interface FanSlot {
  fanIndex: number;
  fanCount: number;
  auto: boolean;
}

export interface RouteRequest {
  source: Vec;
  target: Vec;
  sourceRadius: number;
  targetRadius: number;
  waypoints?: Vec[];
  /** Index among the auto-routed links of this pair. Ignored for waypoints and self-links. */
  fanIndex?: number;
  fanCount?: number;
  /** Extra world-unit bow from the link style, added along the fan direction. */
  bow?: number;
  /** 0-based segment whose arc-length middle holds the label. */
  labelSegment?: number;
}

export interface RoutedLink {
  points: Vec[];
  /** Billboard anchor: arc-length middle, a segment middle, or the top of a self-link loop. */
  label: Vec;
  /** Unit direction of the path as it arrives at the target, pointing toward the target. */
  endDirection: Vec;
  /** Unit direction of the path as it leaves the source. */
  startDirection: Vec;
}

const SAMPLES_PER_SPAN = 8;

export function iconRadius(size?: number): number {
  return Math.max(0.22, (size ?? 0.8) * 0.46);
}

/**
 * Group every link between the same two nodes. Waypoint links are marked
 * `auto: false` and the remaining links fan at equal angles around the axis.
 * Link ids are sorted so the slot does not depend on object order.
 */
export function fanSlots(links: FanLink[]): Map<string, FanSlot> {
  const groups = new Map<string, FanLink[]>();
  for (const link of links) {
    const key = pairKey(link.source, link.target);
    const list = groups.get(key);
    if (list) list.push(link);
    else groups.set(key, [link]);
  }
  const out = new Map<string, FanSlot>();
  for (const list of groups.values()) {
    const auto = list.filter((link) => !link.hasWaypoints).sort(byId);
    const autoIndex = new Map(auto.map((link, index) => [link.id, index]));
    for (const link of list) {
      if (link.hasWaypoints) {
        out.set(link.id, { fanIndex: 0, fanCount: 0, auto: false });
        continue;
      }
      out.set(link.id, { fanIndex: autoIndex.get(link.id) ?? 0, fanCount: auto.length, auto: true });
    }
  }
  return out;
}

export function routeLink(request: RouteRequest): RoutedLink {
  const waypoints = request.waypoints ?? [];
  if (samePoint(request.source, request.target)) {
    return selfLoop(request.source, request.sourceRadius);
  }
  if (waypoints.length > 0) return waypointRoute(request, waypoints);
  return fanRoute(request);
}

function fanRoute(request: RouteRequest): RoutedLink {
  const fanCount = Math.max(1, request.fanCount ?? 1);
  const fanIndex = request.fanIndex ?? 0;
  const { sourceRadius, targetRadius } = separatedRadii(
    request.source,
    request.target,
    request.sourceRadius,
    request.targetRadius,
  );
  const start = onSurface(request.source, request.target, sourceRadius);
  const end = onSurface(request.target, request.source, targetRadius);
  const axis = norm(sub(end, start));
  const { side, binormal } = frame(axis);
  // Angle 0 arches toward world up, so a pair reads as up/down from a level camera
  // instead of collapsing along the line of sight. Further links step around the axis.
  let primary = Math.abs(binormal.y) >= Math.abs(side.y) ? binormal : side;
  if (primary.y < 0) primary = scale(primary, -1);
  const secondary = norm(cross(axis, primary));
  const angle = fanCount <= 1 ? 0 : (fanIndex / fanCount) * Math.PI * 2;
  const dir = norm(add(scale(primary, Math.cos(angle)), scale(secondary, Math.sin(angle))));
  const distance = len(sub(request.target, request.source));
  const base = Math.max(0.42, distance * 0.2);
  const growth = fanCount <= 1 ? 1 : 1 + (fanCount - 1) * 0.12;
  const bow = base * growth + (request.bow ?? 0);
  const control = add(scale(add(start, end), 0.5), scale(dir, bow));
  const points = sampleQuadratic(start, control, end, SAMPLES_PER_SPAN * 2);
  return finish(points, arcMidpoint(points));
}

function waypointRoute(request: RouteRequest, waypoints: Vec[]): RoutedLink {
  const { sourceRadius, targetRadius } = separatedRadii(
    request.source,
    request.target,
    request.sourceRadius,
    request.targetRadius,
  );
  const knots = [
    onSurface(request.source, waypoints[0], sourceRadius),
    ...waypoints.map(clone),
    onSurface(request.target, waypoints[waypoints.length - 1], targetRadius),
  ];
  const spans = knots.length - 1;
  const curve = new CatmullRomCurve3(
    knots.map((point) => new Vector3(point.x, point.y, point.z)),
    false,
    "centripetal",
  );
  const sampled = curve.getPoints(spans * SAMPLES_PER_SPAN).map(fromVector);
  const segment = request.labelSegment;
  const label =
    segment != null && segment >= 0 && segment < spans
      ? arcMidpoint(sampled.slice(segment * SAMPLES_PER_SPAN, segment * SAMPLES_PER_SPAN + SAMPLES_PER_SPAN + 1))
      : arcMidpoint(sampled);
  return finish(sampled, label);
}

function selfLoop(center: Vec, radius: number): RoutedLink {
  const loopR = 0.52;
  const cx = center.x + radius + loopR + 0.08;
  const cy = center.y;
  const cz = center.z;
  const points: Vec[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const angle = Math.PI + (i / steps) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * loopR, y: cy + Math.sin(angle) * loopR, z: cz });
  }
  return finish(points, { x: cx, y: cy + loopR, z: cz });
}

function finish(points: Vec[], label: Vec): RoutedLink {
  return {
    points,
    label,
    startDirection: segmentDirection(points, false),
    endDirection: segmentDirection(points, true),
  };
}

function sampleQuadratic(a: Vec, control: Vec, b: Vec, steps: number): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push(add(add(scale(a, u * u), scale(control, 2 * u * t)), scale(b, t * t)));
  }
  return points;
}

function arcMidpoint(points: Vec[]): Vec {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const distance = len(sub(points[i], points[i - 1]));
    lengths.push(distance);
    total += distance;
  }
  if (total < 1e-6) return points[Math.floor(points.length / 2)];
  let walked = 0;
  const half = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (walked + lengths[i] >= half) {
      const t = lengths[i] < 1e-8 ? 0 : (half - walked) / lengths[i];
      return lerp(points[i], points[i + 1], t);
    }
    walked += lengths[i];
  }
  return points[points.length - 1];
}

function segmentDirection(points: Vec[], atEnd: boolean): Vec {
  if (atEnd) {
    for (let i = points.length - 1; i > 0; i -= 1) {
      const direction = sub(points[i], points[i - 1]);
      if (len(direction) > 1e-6) return norm(direction);
    }
  } else {
    for (let i = 1; i < points.length; i += 1) {
      const direction = sub(points[i], points[i - 1]);
      if (len(direction) > 1e-6) return norm(direction);
    }
  }
  return { x: 0, y: 1, z: 0 };
}

function separatedRadii(source: Vec, target: Vec, sourceRadius: number, targetRadius: number) {
  const distance = len(sub(target, source));
  const maxSum = distance * 0.72;
  if (sourceRadius + targetRadius <= maxSum) return { sourceRadius, targetRadius };
  const scaleBy = maxSum / Math.max(sourceRadius + targetRadius, 1e-6);
  return { sourceRadius: sourceRadius * scaleBy, targetRadius: targetRadius * scaleBy };
}

function onSurface(center: Vec, toward: Vec, radius: number): Vec {
  const direction = sub(toward, center);
  const distance = len(direction);
  if (distance < 1e-6) return add(center, { x: radius, y: 0, z: 0 });
  return add(center, scale(direction, radius / distance));
}

function frame(axis: Vec): { side: Vec; binormal: Vec } {
  const up = Math.abs(axis.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const side = norm(cross(axis, up));
  const binormal = norm(cross(axis, side));
  return { side, binormal };
}

function samePoint(a: Vec, b: Vec): boolean {
  return len(sub(a, b)) < 1e-4;
}

function byId(a: FanLink, b: FanLink): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function fromVector(point: Vector3): Vec {
  return { x: point.x, y: point.y, z: point.z };
}

function clone(point: Vec): Vec {
  return { x: point.x, y: point.y, z: point.z };
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(point: Vec, factor: number): Vec {
  return { x: point.x * factor, y: point.y * factor, z: point.z * factor };
}

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len(point: Vec): number {
  return Math.hypot(point.x, point.y, point.z);
}

function norm(point: Vec): Vec {
  const distance = len(point);
  if (distance < 1e-8) return { x: 0, y: 0, z: 0 };
  return scale(point, 1 / distance);
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return add(scale(a, 1 - t), scale(b, t));
}

/** Perpendicular distance from `point` to the segment axis through `origin` and `toward`. */
export function axisOffset(point: Vec, origin: Vec, toward: Vec): Vec {
  const axis = norm(sub(toward, origin));
  const relative = sub(point, origin);
  const along = relative.x * axis.x + relative.y * axis.y + relative.z * axis.z;
  return sub(relative, scale(axis, along));
}
