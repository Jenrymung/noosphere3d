/**
 * One active operator at a time. Confirm keeps the live state.
 * Cancel returns the snapshot taken when the operator started.
 * The view operator is the first one; grab and link can use the same shape later.
 */
export interface Operator<T> {
  readonly kind: string;
  confirm(): T;
  cancel(): T;
}

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec;
  target: Vec;
}

const PHI_MIN = 0.08;
const PHI_MAX = Math.PI - 0.08;

export class ViewOperator implements Operator<CameraPose> {
  readonly kind = "view";
  private readonly snapshot: CameraPose;
  private pose: CameraPose;

  constructor(pose: CameraPose) {
    this.snapshot = clonePose(pose);
    this.pose = clonePose(pose);
  }

  get current(): CameraPose {
    return clonePose(this.pose);
  }

  confirm(): CameraPose {
    return clonePose(this.pose);
  }

  cancel(): CameraPose {
    return clonePose(this.snapshot);
  }

  orbitAngles(dTheta: number, dPhi: number): void {
    const offset = orbitOffset(sub(this.pose.position, this.pose.target), dTheta, dPhi);
    this.pose = { target: cloneVec(this.pose.target), position: add(this.pose.target, offset) };
  }

  /** Pixel deltas. Dragging right orbits; dragging down tilts toward the ground. Shift is not involved. */
  orbitPixels(dx: number, dy: number): void {
    this.orbitAngles(-dx * 0.005, -dy * 0.005);
  }

  pan(dxWorld: number, dyWorld: number): void {
    const basis = cameraBasis(this.pose);
    const delta = add(scale(basis.right, dxWorld), scale(basis.up, dyWorld));
    this.pose = { position: add(this.pose.position, delta), target: add(this.pose.target, delta) };
  }

  panPixels(dx: number, dy: number): void {
    const distance = Math.max(len(sub(this.pose.position, this.pose.target)), 0.5);
    const scalePerPixel = distance * 0.0016;
    this.pan(dx * scalePerPixel, -dy * scalePerPixel);
  }

  dolly(factor: number, min = 1.4, max = 500): void {
    const offset = sub(this.pose.position, this.pose.target);
    const next = clamp(len(offset) * factor, min, max);
    const direction = len(offset) < 1e-6 ? { x: 0, y: 0.35, z: 1 } : offset;
    this.pose = { target: cloneVec(this.pose.target), position: add(this.pose.target, scale(norm(direction), next)) };
  }

  dollyPixels(dy: number): void {
    this.dolly(Math.exp(dy * 0.006));
  }
}

export function orbitOffset(offset: Vec, dTheta: number, dPhi: number): Vec {
  const radius = Math.max(len(offset), 1e-4);
  let theta = Math.atan2(offset.x, offset.z);
  let phi = Math.acos(clamp(offset.y / radius, -1, 1));
  theta += dTheta;
  phi = clamp(phi + dPhi, PHI_MIN, PHI_MAX);
  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta),
  };
}

export function cameraBasis(pose: CameraPose): { right: Vec; up: Vec; forward: Vec } {
  const forward = norm(sub(pose.target, pose.position));
  const worldUp = Math.abs(forward.y) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = norm(cross(forward, worldUp));
  const up = norm(cross(right, forward));
  return { right, up, forward };
}

function clonePose(pose: CameraPose): CameraPose {
  return { position: cloneVec(pose.position), target: cloneVec(pose.target) };
}

function cloneVec(value: Vec): Vec {
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

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len(value: Vec): number {
  return Math.hypot(value.x, value.y, value.z);
}

function norm(value: Vec): Vec {
  const distance = len(value);
  if (distance < 1e-8) return { x: 0, y: 0, z: 0 };
  return scale(value, 1 / distance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
