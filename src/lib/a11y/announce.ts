import type { LinkIndex } from "../core/graph";
import { linkLabel, nodeTitle } from "../core/title";
import type { MapDocument } from "../core/types";
import type { HintMode } from "../input/hints";
import { neighbourhoodTree } from "./tree";

export function announceLink(doc: MapDocument, linkId: string): string {
  const link = doc.links[linkId];
  if (!link) return "Missing link";
  const type = doc.linkTypes[link.typeId];
  const typeName = type?.name ?? "Unknown type";
  const source = nodeTitle(doc.nodes[link.source] ?? { text: "" }) || "Untitled";
  const target = nodeTitle(doc.nodes[link.target] ?? { text: "" }) || "Untitled";
  const label = linkLabel(link, type);
  if (link.source === link.target) return `Link: ${source} ${typeName} itself`;
  if (label.title) return `Link: ${label.title}, type ${typeName}, from ${source} to ${target}`;
  return `Link: ${source} ${typeName} ${target}`;
}

export function announceOpened(title: string): string {
  return `Opened ${title}. Press E to edit, Escape to close`;
}

export function announceMode(mode: HintMode): string {
  switch (mode) {
    case "navigate":
      return "Navigate";
    case "read":
      return "Reader";
    case "edit":
      return "Edit";
    case "link":
      return "Link mode";
    case "grab":
      return "Grab";
    case "view":
      return "View";
  }
}

export function liveAnnouncement(input: {
  doc: MapDocument;
  index: LinkIndex;
  nodeId: string | null;
  linkId: string | null;
  panel: "closed" | "read" | "edit";
  openedTitle: string | null;
  linkMode: boolean;
  operator: string;
}): string {
  if (input.panel === "edit" && input.openedTitle) return `Editing ${input.openedTitle}. Escape returns to the Reader`;
  if (input.panel === "read" && input.openedTitle) return announceOpened(input.openedTitle);
  if (input.linkMode) {
    const tree = neighbourhoodTree(input.doc, input.index, input.nodeId);
    return `Link mode. ${tree.summary}`;
  }
  if (input.operator === "grab") return "Grab. Arrows nudge, Enter keeps, Escape restores";
  if (input.operator === "view") return "View. Enter keeps the camera, Escape restores it";
  if (input.linkId && input.doc.links[input.linkId]) return announceLink(input.doc, input.linkId);
  return neighbourhoodTree(input.doc, input.index, input.nodeId).summary;
}
