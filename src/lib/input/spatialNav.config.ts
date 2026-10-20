/**
 * One place for spatial-navigation weights and cone limits (plan section 6.3).
 * Starting values from the plan. Fixture tests must keep passing if these change.
 */
export const spatialNavConfig = {
  wAngle: 1,
  wScreen: 1,
  wDepth: 1.5,
  wLink: 0.3,
  /** Cone half-angle, degrees. θmax for the first pass. */
  coneHalfAngleDeg: 60,
  /** Widened cone when the first pass is empty, degrees. */
  fallbackConeDeg: 90,
} as const;
