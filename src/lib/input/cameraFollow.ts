export type FollowAction = "focus" | "nudge" | "hold";

/**
 * Off-screen or farther than `limit` eases the camera onto the point.
 * Inside the view but near the edge, pan just enough to clear the margin.
 */
export function cameraFollowAction(input: {
  ndcX: number;
  ndcY: number;
  ndcZ: number;
  distance: number;
  limit?: number;
}): FollowAction {
  const limit = input.limit ?? 22;
  if (input.ndcZ < -1 || input.ndcZ > 1 || Math.abs(input.ndcX) > 1 || Math.abs(input.ndcY) > 1) return "focus";
  if (input.distance > limit) return "focus";
  if (Math.abs(input.ndcX) > 0.74 || Math.abs(input.ndcY) > 0.74) return "nudge";
  return "hold";
}

/** Reduced motion cuts. Otherwise camera moves run about 280 ms. */
export function cameraMoveMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : 280;
}
