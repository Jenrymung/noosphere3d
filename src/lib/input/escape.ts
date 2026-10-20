export type PanelMode = "navigate" | "reader" | "edit";

export interface EscapeState {
  panel: PanelMode;
  /** Edit was opened from the Reader, so the first Esc returns there. */
  editFromReader: boolean;
  /** Pinned reader stays visible, but focus is in the scene, so Esc acts on the selection. */
  pinned: boolean;
  nodeId: string | null;
  linkId: string | null;
  /** The node that was current when this link became the selection. */
  linkOriginId: string | null;
}

export type EscapeStep =
  | { kind: "close-edit"; next: "reader" | "navigate" }
  | { kind: "close-reader" }
  | { kind: "return-to-node"; nodeId: string }
  | { kind: "clear-selection" }
  | { kind: "noop" };

/**
 * One Esc. Edit returns to the Reader only when Edit was opened from it.
 * A focused Reader closes next. In Navigate, a link returns to the node
 * you arrived from, and a node clears the selection.
 */
export function stepEscape(state: EscapeState): EscapeStep {
  if (state.panel === "edit") {
    return { kind: "close-edit", next: state.editFromReader ? "reader" : "navigate" };
  }
  if (state.panel === "reader" && !state.pinned) return { kind: "close-reader" };
  if (state.linkId) {
    if (state.linkOriginId && state.linkOriginId !== state.linkId) {
      return { kind: "return-to-node", nodeId: state.linkOriginId };
    }
    return { kind: "clear-selection" };
  }
  if (state.nodeId) return { kind: "clear-selection" };
  return { kind: "noop" };
}

/**
 * The origin is the node that was current when the link first became selected.
 * Cycling to another link keeps that origin.
 */
export function linkOriginOnSelect(state: {
  linkId: string | null;
  nodeId: string | null;
  linkOriginId: string | null;
}): string | null {
  if (state.linkId) return state.linkOriginId;
  return state.nodeId;
}
