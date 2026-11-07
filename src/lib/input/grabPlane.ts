export interface PlaneVec {
  x: number;
  y: number;
  z: number;
}

/**
 * Ray against the camera-facing plane through the node's depth.
 * A parallel ray, or one that hits behind the camera, returns null.
 */
export function intersectRayPlane(origin: PlaneVec, direction: PlaneVec, planePoint: PlaneVec, planeNormal: PlaneVec): PlaneVec | null {
  const denom = direction.x * planeNormal.x + direction.y * planeNormal.y + direction.z * planeNormal.z;
  if (Math.abs(denom) < 1e-8) return null;
  const t =
    ((planePoint.x - origin.x) * planeNormal.x +
      (planePoint.y - origin.y) * planeNormal.y +
      (planePoint.z - origin.z) * planeNormal.z) /
    denom;
  if (t < 0) return null;
  return {
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  };
}

/**
 * The node follows the cursor 1:1 on that plane.
 * Shift (precision) keeps one fifth of the cursor travel, the same factor as keyboard fine movement.
 */
export function grabPositionOnPlane(args: {
  origin: PlaneVec;
  anchorHit: PlaneVec;
  currentHit: PlaneVec;
  precision: boolean;
}): PlaneVec {
  const scale = args.precision ? 0.2 : 1;
  return {
    x: args.origin.x + (args.currentHit.x - args.anchorHit.x) * scale,
    y: args.origin.y + (args.currentHit.y - args.anchorHit.y) * scale,
    z: args.origin.z + (args.currentHit.z - args.anchorHit.z) * scale,
  };
}
