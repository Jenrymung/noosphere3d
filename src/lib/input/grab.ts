export interface Vec {
  x: number;
  y: number;
  z: number;
}

export type GrabAxis = "x" | "y" | "z";

/**
 * Grab moves a node in the camera plane. X/Y/Z locks the offset to one world
 * axis from the start position. Shift scales the delta down. Ctrl snaps.
 * Cancel returns the start position; confirm returns the live one.
 */
export class GrabOperator {
  readonly origin: Vec;
  private offset: Vec = { x: 0, y: 0, z: 0 };
  axis: GrabAxis | null = null;

  constructor(origin: Vec) {
    this.origin = { ...origin };
  }

  toggleAxis(axis: GrabAxis): void {
    this.axis = this.axis === axis ? null : axis;
  }

  add(delta: Vec, options?: { precision?: boolean; snap?: number | null }): void {
    const scale = options?.precision ? 0.2 : 1;
    this.offset = {
      x: this.offset.x + delta.x * scale,
      y: this.offset.y + delta.y * scale,
      z: this.offset.z + delta.z * scale,
    };
    if (options?.snap) this.snapOffset(options.snap);
  }

  position(): Vec {
    const offset = this.constrained();
    return { x: this.origin.x + offset.x, y: this.origin.y + offset.y, z: this.origin.z + offset.z };
  }

  confirm(): Vec {
    return this.position();
  }

  cancel(): Vec {
    return { ...this.origin };
  }

  private constrained(): Vec {
    if (!this.axis) return { ...this.offset };
    return {
      x: this.axis === "x" ? this.offset.x : 0,
      y: this.axis === "y" ? this.offset.y : 0,
      z: this.axis === "z" ? this.offset.z : 0,
    };
  }

  private snapOffset(step: number): void {
    const snap = (value: number) => Math.round(value / step) * step;
    if (!this.axis || this.axis === "x") this.offset.x = snap(this.offset.x);
    if (!this.axis || this.axis === "y") this.offset.y = snap(this.offset.y);
    if (!this.axis || this.axis === "z") this.offset.z = snap(this.offset.z);
  }
}

export const GRAB_SNAP = 0.5;
