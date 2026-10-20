import type { LinkIndex } from "../core/graph";
import type { MapDocument } from "../core/types";

/** Visible links touching a node, in id order. Hidden link types are skipped. */
export function visibleLinkIds(doc: MapDocument, index: LinkIndex, nodeId: string): string[] {
  const ids = index.byNode.get(nodeId);
  if (!ids) return [];
  const out: string[] = [];
  for (const id of ids) {
    const link = doc.links[id];
    if (!link) continue;
    if (doc.view?.linkTypeFilters?.[link.typeId] === "hidden") continue;
    out.push(id);
  }
  out.sort();
  return out;
}

export function cycleLink(ids: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const index = current == null ? -1 : ids.indexOf(current);
  if (index < 0) return delta > 0 ? ids[0] : ids[ids.length - 1];
  return ids[(index + delta + ids.length) % ids.length];
}
