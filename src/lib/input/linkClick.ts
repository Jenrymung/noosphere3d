/** A click confirms the aimed node. The pointer wins when it is over a node. */
export function linkPointerConfirm(aimedId: string | null, clickedId: string | null): { targetId: string | null; create: boolean } {
  const targetId = clickedId ?? aimedId;
  return { targetId, create: targetId != null };
}
