import { neighbours, sortedLinkTypes, type LinkIndex } from "../core/graph";
import { nodeTitle } from "../core/title";
import type { MapDocument } from "../core/types";

export interface TreeNodeRef {
  id: string;
  title: string;
  /** A loop names the same node and does not list that node's links again. */
  loop: boolean;
}

export interface TreeLinkItem {
  linkId: string;
  phrase: string;
  other: TreeNodeRef;
}

export interface TreeGroup {
  typeId: string;
  typeName: string;
  links: TreeLinkItem[];
}

export interface NeighbourhoodTree {
  empty: boolean;
  nodeId: string | null;
  title: string;
  accessibleName: string;
  summary: string;
  groups: TreeGroup[];
}

export function wordCount(text: string | undefined): number {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function titleOf(doc: MapDocument, id: string): string {
  const node = doc.nodes[id];
  return node ? nodeTitle(node) || "Untitled" : "Missing node";
}

export function neighbourhoodTree(doc: MapDocument, index: LinkIndex, nodeId: string | null): NeighbourhoodTree {
  if (!nodeId || !doc.nodes[nodeId]) {
    return {
      empty: true,
      nodeId: null,
      title: "",
      accessibleName: "Nothing selected",
      summary: "Nothing selected",
      groups: [],
    };
  }
  const node = doc.nodes[nodeId];
  const title = nodeTitle(node) || "Untitled";
  const words = wordCount(node.text);
  const nearby = neighbours(doc, index, nodeId);
  const byType = new Map<string, TreeLinkItem[]>();
  for (const item of nearby) {
    const link = doc.links[item.linkId];
    if (!link) continue;
    const typeName = doc.linkTypes[link.typeId]?.name ?? "Unknown type";
    const loop = item.role === "self";
    const otherId = loop ? nodeId : item.nodeId;
    const otherTitle = titleOf(doc, otherId);
    const phrase = loop ? `${title} ${typeName} itself` : `${titleOf(doc, link.source)} ${typeName} ${titleOf(doc, link.target)}`;
    const list = byType.get(link.typeId) ?? [];
    list.push({ linkId: item.linkId, phrase, other: { id: otherId, title: otherTitle, loop } });
    byType.set(link.typeId, list);
  }
  const groups: TreeGroup[] = [];
  for (const { id, type } of sortedLinkTypes(doc)) {
    const links = byType.get(id);
    if (!links || links.length === 0) continue;
    groups.push({ typeId: id, typeName: type.name, links });
  }
  for (const [typeId, links] of byType) {
    if (groups.some((group) => group.typeId === typeId)) continue;
    groups.push({ typeId, typeName: doc.linkTypes[typeId]?.name ?? "Unknown type", links });
  }
  const linkCount = groups.reduce((sum, group) => sum + group.links.length, 0);
  const parts = groups.map((group) => `${group.links.length} ${group.typeName}`);
  const linkSentence = linkCount === 0 ? "No links" : linkCount === 1 ? `1 link: ${parts[0]}` : `${linkCount} links: ${parts.join(", ")}`;
  return {
    empty: false,
    nodeId,
    title,
    accessibleName: `${title}, document, ${words} ${words === 1 ? "word" : "words"}, ${linkCount} ${linkCount === 1 ? "link" : "links"}`,
    summary: `Node: ${title}. ${linkSentence}`,
    groups,
  };
}
