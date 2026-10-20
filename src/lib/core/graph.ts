import { compareOrder } from "./order";
import type { Link, LinkDirection, MapDocument } from "./types";

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

interface IndexedLink {
  source: string;
  target: string;
  typeId: string;
}

/**
 * Links by node, by type, and by unordered endpoint pair.
 * `sync` updates only the links that changed since the last call.
 */
export class LinkIndex {
  readonly byNode = new Map<string, Set<string>>();
  readonly byType = new Map<string, Set<string>>();
  readonly byPair = new Map<string, Set<string>>();
  private readonly links = new Map<string, IndexedLink>();

  static from(doc: MapDocument): LinkIndex {
    const index = new LinkIndex();
    index.sync(doc);
    return index;
  }

  snapshot(): { byNode: Record<string, string[]>; byType: Record<string, string[]>; byPair: Record<string, string[]> } {
    const dump = (map: Map<string, Set<string>>) => {
      const out: Record<string, string[]> = {};
      for (const key of [...map.keys()].sort()) out[key] = [...map.get(key)!].sort();
      return out;
    };
    return { byNode: dump(this.byNode), byType: dump(this.byType), byPair: dump(this.byPair) };
  }

  sync(doc: MapDocument): void {
    const next = new Set(Object.keys(doc.links));
    for (const id of [...this.links.keys()]) {
      if (!next.has(id)) this.remove(id);
    }
    for (const [id, link] of Object.entries(doc.links)) {
      const prev = this.links.get(id);
      if (prev && prev.source === link.source && prev.target === link.target && prev.typeId === link.typeId) continue;
      if (prev) this.remove(id);
      this.add(id, link);
    }
  }

  private add(id: string, link: Link): void {
    this.links.set(id, { source: link.source, target: link.target, typeId: link.typeId });
    this.push(this.byNode, link.source, id);
    this.push(this.byNode, link.target, id);
    this.push(this.byType, link.typeId, id);
    this.push(this.byPair, pairKey(link.source, link.target), id);
  }

  private remove(id: string): void {
    const prev = this.links.get(id);
    if (!prev) return;
    this.links.delete(id);
    this.drop(this.byNode, prev.source, id);
    this.drop(this.byNode, prev.target, id);
    this.drop(this.byType, prev.typeId, id);
    this.drop(this.byPair, pairKey(prev.source, prev.target), id);
  }

  private push(map: Map<string, Set<string>>, key: string, id: string): void {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(id);
  }

  private drop(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }
}

export interface Neighbour {
  linkId: string;
  nodeId: string;
  role: "outgoing" | "incoming" | "self";
}

export function neighbours(doc: MapDocument, index: LinkIndex, nodeId: string): Neighbour[] {
  const ids = index.byNode.get(nodeId);
  if (!ids) return [];
  const found: Neighbour[] = [];
  for (const linkId of ids) {
    const link = doc.links[linkId];
    if (!link) continue;
    if (link.source === nodeId && link.target === nodeId) {
      found.push({ linkId, nodeId, role: "self" });
    } else if (link.source === nodeId) {
      found.push({ linkId, nodeId: link.target, role: "outgoing" });
    } else if (link.target === nodeId) {
      found.push({ linkId, nodeId: link.source, role: "incoming" });
    }
  }
  found.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  return found;
}

/** Neighbours joined by a link whose type is not hidden. Self-links are skipped. */
export function visibleNeighbourIds(doc: MapDocument, index: LinkIndex, nodeId: string): Set<string> {
  const ids = new Set<string>();
  for (const item of neighbours(doc, index, nodeId)) {
    if (item.role === "self") continue;
    const link = doc.links[item.linkId];
    if (!link) continue;
    if (doc.view?.linkTypeFilters?.[link.typeId] === "hidden") continue;
    ids.add(item.nodeId);
  }
  return ids;
}

export interface FollowHit {
  linkId: string;
  nodeId: string;
}

export type FollowSense = "forward" | "backward";

/**
 * Step from a node along links of one type.
 * Directed types walk outgoing for "forward" and incoming for "backward".
 * Undirected and bidirectional types can be walked either way, so both senses
 * return the other end. Self-links are included in both senses.
 */
export function follow(
  doc: MapDocument,
  index: LinkIndex,
  nodeId: string,
  typeId: string,
  sense: FollowSense,
  include?: (linkId: string) => boolean,
): FollowHit[] {
  const type = doc.linkTypes[typeId];
  const ids = index.byType.get(typeId);
  if (!type || !ids) return [];
  const hits: FollowHit[] = [];
  for (const linkId of ids) {
    if (include && !include(linkId)) continue;
    const link = doc.links[linkId];
    if (!link) continue;
    const next = otherEnd(link, nodeId, type.direction, sense);
    if (next != null) hits.push({ linkId, nodeId: next });
  }
  hits.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  return hits;
}

function otherEnd(link: Link, nodeId: string, direction: LinkDirection, sense: FollowSense): string | null {
  const atSource = link.source === nodeId;
  const atTarget = link.target === nodeId;
  if (!atSource && !atTarget) return null;
  if (link.source === link.target) return nodeId;
  if (direction === "undirected" || direction === "bidirectional") {
    return atSource ? link.target : link.source;
  }
  if (sense === "forward" && atSource) return link.target;
  if (sense === "backward" && atTarget) return link.source;
  return null;
}

export function linksForPair(index: LinkIndex, a: string, b: string): string[] {
  const set = index.byPair.get(pairKey(a, b));
  return set ? [...set].sort() : [];
}

export function sortedLinkTypes(doc: MapDocument): { id: string; type: MapDocument["linkTypes"][string] }[] {
  return Object.entries(doc.linkTypes)
    .sort((a, b) => compareOrder(a[1].order, a[0], b[1].order, b[0]))
    .map(([id, type]) => ({ id, type }));
}

export function sortedWaypoints(link: Link): { id: string; waypoint: NonNullable<Link["waypoints"]>[string] }[] {
  if (!link.waypoints) return [];
  return Object.entries(link.waypoints)
    .sort((a, b) => compareOrder(a[1].order, a[0], b[1].order, b[0]))
    .map(([id, waypoint]) => ({ id, waypoint }));
}
