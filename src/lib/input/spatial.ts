import type { Vec3 } from "../core/types";

export type ArrowDirection = "left" | "right" | "up" | "down";

export interface ScreenPoint {
  /** CSS pixels, origin bottom-left, y up. */
  x: number;
  y: number;
  /** Distance in front of the camera, world units. */
  depth: number;
}

export interface SpatialCandidate {
  id: string;
  screen: ScreenPoint;
  /** True when this node shares a link with the selection. */
  linked?: boolean;
}

export const SPATIAL_CONE_DEG = 60;
export const SPATIAL_WIDE_DEG = 90;

/**
 * One score, lowest wins. Every term lives here so the ranking can be tuned
 * without a second rejection rule.
 * Angle and screen distance pull toward the arrow. Depth is strong enough that
 * a far node sitting on the selection loses to a nearer one. Link is a bonus
 * (a multiplier below 1) for a node directly connected to the selection.
 */
export interface SpatialWeights {
  angle: number;
  screen: number;
  depth: number;
  /** World units that count as one step of the depth penalty. */
  depthStep: number;
  /** Score multiplier for a node linked to the selection. */
  link: number;
}

export const SPATIAL_WEIGHTS: SpatialWeights = {
  angle: 5,
  screen: 1,
  depth: 3,
  depthStep: 8,
  link: 0.38,
};

const DIRECTION: Record<ArrowDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
};

const OPPOSITE: Record<ArrowDirection, ArrowDirection> = {
  left: "right",
  right: "left",
  up: "down",
  down: "up",
};

export interface SpatialNavInput {
  currentId: string;
  current: ScreenPoint;
  candidates: SpatialCandidate[];
  direction: ArrowDirection;
  /** The node we arrived from, when the last move was also spatial. */
  previousId?: string | null;
  previousDirection?: ArrowDirection | null;
  coneDeg?: number;
  widenDeg?: number;
  weights?: Partial<SpatialWeights>;
}

export interface SpatialNavResult {
  nextId: string | null;
  bumped: boolean;
  widened: boolean;
  reversed: boolean;
}

function angleBetween(dx: number, dy: number, direction: ArrowDirection): number {
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.PI;
  const axis = DIRECTION[direction];
  const dot = (dx / length) * axis.x + (dy / length) * axis.y;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function resolveWeights(override?: Partial<SpatialWeights>): SpatialWeights {
  return { ...SPATIAL_WEIGHTS, ...override };
}

/** Lowest score wins. The 60° denominator stays put when the cone widens to 90°. */
export function scoreSpatialCandidate(
  current: ScreenPoint,
  candidate: SpatialCandidate,
  theta: number,
  weights: SpatialWeights = SPATIAL_WEIGHTS,
): number {
  const dx = candidate.screen.x - current.x;
  const dy = candidate.screen.y - current.y;
  const distance = Math.hypot(dx, dy);
  const coneRad = (SPATIAL_CONE_DEG * Math.PI) / 180;
  const alignment = 1 + weights.angle * (theta / coneRad) ** 2;
  const depthGap = Math.abs(candidate.screen.depth - current.depth);
  const depthFactor = 1 + weights.depth * (depthGap / weights.depthStep);
  const linkFactor = candidate.linked ? weights.link : 1;
  return distance * weights.screen * alignment * depthFactor * linkFactor;
}

/**
 * Screen-space cone scoring. Lowest score wins. If the cone is empty it widens
 * once from ±60° to ±90°. The opposite arrow returns to the node we just left.
 */
export function chooseSpatialTarget(input: SpatialNavInput): SpatialNavResult {
  const coneDeg = input.coneDeg ?? SPATIAL_CONE_DEG;
  const widenDeg = input.widenDeg ?? SPATIAL_WIDE_DEG;
  const weights = resolveWeights(input.weights);

  if (
    input.previousId &&
    input.previousDirection &&
    OPPOSITE[input.previousDirection] === input.direction &&
    input.candidates.some((candidate) => candidate.id === input.previousId)
  ) {
    return { nextId: input.previousId, bumped: false, widened: false, reversed: true };
  }

  const picked = pickCone(input, coneDeg, weights);
  if (picked) return { nextId: picked, bumped: false, widened: false, reversed: false };
  const wide = pickCone(input, widenDeg, weights);
  if (wide) return { nextId: wide, bumped: false, widened: true, reversed: false };
  return { nextId: null, bumped: true, widened: true, reversed: false };
}

function pickCone(input: SpatialNavInput, coneDeg: number, weights: SpatialWeights): string | null {
  const coneRad = (coneDeg * Math.PI) / 180;
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const candidate of input.candidates) {
    if (candidate.id === input.currentId) continue;
    const dx = candidate.screen.x - input.current.x;
    const dy = candidate.screen.y - input.current.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) continue;
    const theta = angleBetween(dx, dy, input.direction);
    if (theta > coneRad + 1e-8) continue;
    const score = scoreSpatialCandidate(input.current, candidate, theta, weights);
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && (bestId === null || candidate.id < bestId))) {
      bestScore = score;
      bestId = candidate.id;
    }
  }
  return bestId;
}

export type DepthSense = "closer" | "further";

/**
 * Mod+arrow depth step: the next node that is nearer or farther and close on screen.
 */
export function chooseDepthTarget(
  current: ScreenPoint,
  candidates: SpatialCandidate[],
  sense: DepthSense,
): string | null {
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const delta =
      sense === "closer" ? current.depth - candidate.screen.depth : candidate.screen.depth - current.depth;
    if (delta < 0.05) continue;
    const screenDist = Math.hypot(candidate.screen.x - current.x, candidate.screen.y - current.y);
    const score = screenDist + delta * 8;
    if (score < bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }
  return bestId;
}

export interface CameraFrame {
  position: Vec3;
  target: Vec3;
  up?: Vec3;
  fovDeg: number;
  width: number;
  height: number;
}

/**
 * Pinhole projection used by tests and by anything that does not have a Three.js camera.
 * Y is up. Points on or behind the camera plane return null.
 */
export function projectPoint(world: Vec3, camera: CameraFrame): ScreenPoint | null {
  const up = camera.up ?? { x: 0, y: 1, z: 0 };
  const fx = camera.target.x - camera.position.x;
  const fy = camera.target.y - camera.position.y;
  const fz = camera.target.z - camera.position.z;
  const fl = Math.hypot(fx, fy, fz);
  if (fl < 1e-8) return null;
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl };
  let rx = forward.y * up.z - forward.z * up.y;
  let ry = forward.z * up.x - forward.x * up.z;
  let rz = forward.x * up.y - forward.y * up.x;
  const rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-8) return null;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * forward.z - rz * forward.y;
  const uy = rz * forward.x - rx * forward.z;
  const uz = rx * forward.y - ry * forward.x;
  const dx = world.x - camera.position.x;
  const dy = world.y - camera.position.y;
  const dz = world.z - camera.position.z;
  const camX = dx * rx + dy * ry + dz * rz;
  const camY = dx * ux + dy * uy + dz * uz;
  const camZ = dx * forward.x + dy * forward.y + dz * forward.z;
  if (camZ <= 0.05) return null;
  const aspect = camera.width / Math.max(camera.height, 1);
  const tan = Math.tan((camera.fovDeg * Math.PI) / 360);
  const ndcX = camX / (camZ * tan * aspect);
  const ndcY = camY / (camZ * tan);
  return {
    x: (ndcX * 0.5 + 0.5) * camera.width,
    y: (ndcY * 0.5 + 0.5) * camera.height,
    depth: camZ,
  };
}
