export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface PlacementInput {
  anchor: Vec;
  /** Every node that must stay put. This list is not modified. */
  existing: readonly Vec[];
  /** Nodes already linked to the anchor, used to fan the new one away from them. */
  neighbours: readonly Vec[];
  /** Unit vector from the camera toward the focus. */
  forward: Vec;
  /** Preferred direction, used for an unlinked node placed in front of the camera. */
  prefer?: Vec;
  baseDistance?: number;
  clearance?: number;
}

const DIRECTIONS = 48;

/**
 * Pick a free point near the anchor. Tries the base distance, then 1.5× and 2×
 * if the neighbourhood is crowded, then nudges only the new point.
 */
export function placeNode(input: PlacementInput): Vec {
  const base = input.baseDistance ?? 2.4;
  const clearance = input.clearance ?? 1.35;
  const existing = input.existing.map(clone);
  let best = add(input.anchor, scale(norm(input.prefer ?? input.forward), base));
  let bestScore = Number.POSITIVE_INFINITY;
  let bestClear = 0;
  for (const factor of [1, 1.5, 2]) {
    const distance = base * factor;
    for (const direction of sphereDirections(DIRECTIONS)) {
      const candidate = add(input.anchor, scale(direction, distance));
      const score = scoreCandidate(candidate, direction, input);
      const room = clearanceOf(candidate, existing);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
        bestClear = room;
      }
    }
    if (bestClear >= clearance) break;
  }
  return nudge(best, existing, clearance);
}

function scoreCandidate(candidate: Vec, direction: Vec, input: PlacementInput): number {
  let score = 0;
  const clearance = input.clearance ?? 1.35;
  for (const other of input.existing) {
    const distance = len(sub(candidate, other));
    if (distance < clearance) score += 80 * (clearance - distance) + 20;
    else score += 1.2 / distance;
  }
  if (input.neighbours.length > 0) {
    let away = { x: 0, y: 0, z: 0 };
    for (const neighbour of input.neighbours) away = add(away, norm(sub(neighbour, input.anchor)));
    const awayDir = norm(scale(away, -1));
    if (len(awayDir) > 0.1) score += (1 - dot(direction, awayDir)) * 2.2;
  }
  const forward = norm(input.forward);
  if (dot(direction, forward) < -0.15) score += 2.4;
  score += Math.abs(dot(direction, forward)) * 0.45;
  if (input.prefer) score += (1 - dot(direction, norm(input.prefer))) * 0.8;
  return score;
}

function nudge(point: Vec, existing: readonly Vec[], clearance: number): Vec {
  let next = clone(point);
  const reach = clearance * 2.1;
  for (let step = 0; step < 8; step += 1) {
    let push = { x: 0, y: 0, z: 0 };
    for (const other of existing) {
      const delta = sub(next, other);
      const distance = len(delta);
      if (distance < 1e-4) {
        push = add(push, { x: clearance, y: 0.2, z: 0 });
        continue;
      }
      if (distance < reach) push = add(push, scale(delta, (reach - distance) / distance));
    }
    next = add(next, scale(push, 0.45));
  }
  return next;
}

function clearanceOf(point: Vec, existing: readonly Vec[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const other of existing) best = Math.min(best, len(sub(point, other)));
  return best;
}

function sphereDirections(count: number): Vec[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const directions: Vec[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    directions.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return directions;
}

function clone(value: Vec): Vec {
  return { x: value.x, y: value.y, z: value.z };
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec, factor: number): Vec {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function len(value: Vec): number {
  return Math.hypot(value.x, value.y, value.z);
}

function norm(value: Vec): Vec {
  const distance = len(value);
  if (distance < 1e-8) return { x: 0, y: 0, z: 1 };
  return scale(value, 1 / distance);
}
