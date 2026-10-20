export type PanelSlot = "closed" | "read" | "edit";

export type ModEnterAction = { kind: "create-unlinked" } | { kind: "commit-to-reader" } | { kind: "noop" };

/**
 * Mod+Enter creates an unlinked node only while navigating.
 * A pinned reader with the scene focused is still Navigate.
 * In Edit it commits and opens the Reader.
 */
export function modEnterAction(state: {
  panel: PanelSlot;
  pinned: boolean;
  overlayFocused: boolean;
}): ModEnterAction {
  if (state.panel === "edit") return { kind: "commit-to-reader" };
  if (state.panel === "closed") return { kind: "create-unlinked" };
  if (state.panel === "read" && state.pinned && !state.overlayFocused) return { kind: "create-unlinked" };
  return { kind: "noop" };
}
