import type { Vec3 } from "../core/types";
import { spatialNavConfig } from "./spatialNav.config";

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
  world: Vec3;
  /** True when a visible link joins this node to the selection. Hidden types do not count. */
  linked?: boolean;
}

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
  currentWorld: Vec3;
  candidates: SpatialCandidate[];
  direction: ArrowDirection;
  /** The node we arrived from, when the last move was also spatial. */
  previousId?: string | null;
  previousDirection?: ArrowDirection | null;
  viewport: { width: number; height: number };
  /** Median nearest-neighbour distance. Normalises the 3D term. */
  typicalSpacing: number;
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

export function viewportDiagonal(viewport: { width: number; height: number }): number {
  return Math.hypot(viewport.width, viewport.height);
}

/** Median nearest-neighbour distance. One node, or a pile on one point, uses 1. */
export function typicalSpacing(points: readonly Vec3[]): number {
  if (points.length < 2) return 1;
  const nearest: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const distance = Math.hypot(
        points[i].x - points[j].x,
        points[i].y - points[j].y,
        points[i].z - points[j].z,
      );
      if (distance < best) best = distance;
    }
    if (Number.isFinite(best) && best > 1e-6) nearest.push(best);
  }
  if (nearest.length === 0) return 1;
  nearest.sort((a, b) => a - b);
  const mid = Math.floor((nearest.length - 1) / 2);
  return nearest.length % 2 === 1 ? nearest[mid] : (nearest[mid] + nearest[mid + 1]) / 2;
}

/**
 * Section 6.3 score. Lower is better.
 * `score = wAngle·(θ/θmax)² + wScreen·(screenDist / viewportDiagonal) + wDepth·(dist3D / typicalSpacing) − wLink·[linked]`
 */
export function spatialScore(input: {
  theta: number;
  thetaMax: number;
  screenDist: number;
  viewportDiagonal: number;
  dist3D: number;
  typicalSpacing: number;
  linked: boolean;
}): number {
  const { wAngle, wScreen, wDepth, wLink } = spatialNavConfig;
  const spacing = Math.max(input.typicalSpacing, 1e-6);
  const diagonal = Math.max(input.viewportDiagonal, 1);
  const thetaMax = Math.max(input.thetaMax, 1e-6);
  return (
    wAngle * (input.theta / thetaMax) ** 2 +
    wScreen * (input.screenDist / diagonal) +
    wDepth * (input.dist3D / spacing) -
    (input.linked ? wLink : 0)
  );
}

/**
 * Screen-space cone, then one score. If the cone is empty it widens once
 * from the config half-angle to the fallback cone. The opposite arrow returns
 * to the node we just left.
 */
export function chooseSpatialTarget(input: SpatialNavInput): SpatialNavResult {
  const coneDeg = spatialNavConfig.coneHalfAngleDeg;
  const widenDeg = spatialNavConfig.fallbackConeDeg;

  if (
    input.previousId &&
    input.previousDirection &&
    OPPOSITE[input.previousDirection] === input.direction &&
    input.candidates.some((candidate) => candidate.id === input.previousId)
  ) {
    return { nextId: input.previousId, bumped: false, widened: false, reversed: true };
  }

  const picked = pickCone(input, coneDeg);
  if (picked) return { nextId: picked, bumped: false, widened: false, reversed: false };
  const wide = pickCone(input, widenDeg);
  if (wide) return { nextId: wide, bumped: false, widened: true, reversed: false };
  return { nextId: null, bumped: true, widened: true, reversed: false };
}

function pickCone(input: SpatialNavInput, coneDeg: number): string | null {
  const coneRad = (coneDeg * Math.PI) / 180;
  const diagonal = viewportDiagonal(input.viewport);
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
    const score = spatialScore({
      theta,
      thetaMax: coneRad,
      screenDist: distance,
      viewportDiagonal: diagonal,
      dist3D: Math.hypot(
        candidate.world.x - input.currentWorld.x,
        candidate.world.y - input.currentWorld.y,
        candidate.world.z - input.currentWorld.z,
      ),
      typicalSpacing: input.typicalSpacing,
      linked: candidate.linked === true,
    });
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && (bestId === null || candidate.id < bestId))) {
      bestScore = score;
      bestId = candidate.id;
    }
  }
  return bestId;
}

export type DepthSense = "closer" | "further";

export interface DepthNavInput {
  current: ScreenPoint;
  currentWorld: Vec3;
  cameraPosition: Vec3;
  candidates: SpatialCandidate[];
  sense: DepthSense;
  viewport: { width: number; height: number };
  typicalSpacing: number;
}

/**
 * Mod+arrow uses the same score. θ is how far the candidate sits off the line
 * of sight through the selection. Candidates must be nearer or farther; there
 * is no second depth rule.
 */
export function chooseDepthTarget(input: DepthNavInput): string | null {
  const thetaMax = (spatialNavConfig.coneHalfAngleDeg * Math.PI) / 180;
  const diagonal = viewportDiagonal(input.viewport);
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const candidate of input.candidates) {
    const delta =
      input.sense === "closer"
        ? input.current.depth - candidate.screen.depth
        : candidate.screen.depth - input.current.depth;
    if (delta < 0.05) continue;
    const screenDist = Math.hypot(candidate.screen.x - input.current.x, candidate.screen.y - input.current.y);
    const score = spatialScore({
      theta: angleOffSight(input.cameraPosition, input.currentWorld, candidate.world),
      thetaMax,
      screenDist,
      viewportDiagonal: diagonal,
      dist3D: Math.hypot(
        candidate.world.x - input.currentWorld.x,
        candidate.world.y - input.currentWorld.y,
        candidate.world.z - input.currentWorld.z,
      ),
      typicalSpacing: input.typicalSpacing,
      linked: candidate.linked === true,
    });
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && (bestId === null || candidate.id < bestId))) {
      bestScore = score;
      bestId = candidate.id;
    }
  }
  return bestId;
}

function angleOffSight(camera: Vec3, current: Vec3, candidate: Vec3): number {
  const ax = current.x - camera.x;
  const ay = current.y - camera.y;
  const az = current.z - camera.z;
  const bx = candidate.x - camera.x;
  const by = candidate.y - camera.y;
  const bz = candidate.z - camera.z;
  const al = Math.hypot(ax, ay, az);
  const bl = Math.hypot(bx, by, bz);
  if (al < 1e-8 || bl < 1e-8) return Math.PI;
  const dot = (ax * bx + ay * by + az * bz) / (al * bl);
  return Math.acos(Math.min(1, Math.max(-1, dot)));
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
