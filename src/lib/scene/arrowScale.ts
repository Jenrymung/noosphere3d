/** Cone arrowheads stay at least this tall on screen, matching the icon minimum. */
export const MIN_ARROW_PX = 12;

/**
 * Scale applied in view space so a cone of `worldHeight` is at least `minPx` tall.
 * Already-large arrowheads stay at 1.
 */
export function arrowScreenScale(input: {
  worldHeight: number;
  distance: number;
  tanHalfFov: number;
  viewportHeight: number;
  minPx?: number;
}): number {
  const minPx = input.minPx ?? MIN_ARROW_PX;
  const worldPerPx = (2 * input.tanHalfFov * Math.max(input.distance, 0.2)) / Math.max(input.viewportHeight, 1);
  const needed = minPx * worldPerPx;
  return Math.max(needed / Math.max(input.worldHeight, 1e-4), 1);
}

/**
 * Replaces Three.js `project_vertex` for instanced cones.
 * The tip stays on the path; the cone grows in view space up to {@link MIN_ARROW_PX}.
 */
export function arrowProjectChunk(): string {
  return `
vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );
vec4 arrowTip = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
mvPosition = modelViewMatrix * mvPosition;
float arrowDist = max( -arrowTip.z, 0.2 );
float worldPerPx = ( 2.0 * uTan * arrowDist ) / max( uHeight, 1.0 );
float worldHeight = length( instanceMatrix[1].xyz ) * 0.32;
float boost = max( ( uMinPx * worldPerPx ) / max( worldHeight, 0.0001 ), 1.0 );
mvPosition.xyz = arrowTip.xyz + ( mvPosition.xyz - arrowTip.xyz ) * boost;
gl_Position = projectionMatrix * mvPosition;
`;
}
