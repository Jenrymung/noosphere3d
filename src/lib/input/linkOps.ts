import { generateKeyBetween } from "fractional-indexing";
import type { Command } from "../core/commands";
import { follow, sortedLinkTypes, type FollowSense } from "../core/graph";
import type { LinkIndex } from "../core/graph";
import { orderKeyAfter } from "../core/order";
import type { LinkDirection, LinkType, LinkTypeFilter, LinePattern, LineWidth, MapDocument } from "../core/types";
import { cycleLink, visibleLinkIds } from "./cycle";

export interface TypeRow {
  digit: number | null;
  id: string;
  name: string;
  color: string;
  pattern: LinePattern;
  width: LineWidth;
  direction: LinkDirection;
  icon?: string;
  description?: string;
  count: number;
  order: string;
}

const TYPE_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#999999"];

export function typeRows(doc: MapDocument): TypeRow[] {
  const counts = new Map<string, number>();
  for (const link of Object.values(doc.links)) counts.set(link.typeId, (counts.get(link.typeId) ?? 0) + 1);
  return sortedLinkTypes(doc).map((item, index) => ({
    digit: index < 9 ? index + 1 : null,
    id: item.id,
    name: item.type.name,
    color: item.type.color,
    pattern: item.type.pattern,
    width: item.type.width,
    direction: item.type.direction,
    icon: item.type.icon,
    description: item.type.description,
    count: counts.get(item.id) ?? 0,
    order: item.type.order,
  }));
}

export function typeIdForDigit(doc: MapDocument, digit: number): string | null {
  if (digit < 1 || digit > 9) return null;
  return typeRows(doc).find((row) => row.digit === digit)?.id ?? null;
}

export function cycleTypeId(doc: MapDocument, currentId: string, delta: 1 | -1): string | null {
  const rows = typeRows(doc);
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.id === currentId);
  const start = index < 0 ? (delta > 0 ? -1 : 0) : index;
  return rows[(start + delta + rows.length) % rows.length].id;
}

/** Higher scores rank first. A subsequence match still counts; a gap returns nothing. */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  const hay = text.toLowerCase();
  if (!needle) return 1;
  const exact = hay.indexOf(needle);
  if (exact >= 0) return 100 - exact + needle.length / Math.max(hay.length, 1);
  let at = 0;
  let gaps = 0;
  for (const char of needle) {
    const found = hay.indexOf(char, at);
    if (found < 0) return null;
    gaps += found - at;
    at = found + 1;
  }
  return 10 - gaps / Math.max(hay.length, 1);
}

export function fuzzyRank<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  const ranked = items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, textOf(item)) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score != null);
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.map((entry) => entry.item);
}

export function cycleFilter(state: LinkTypeFilter | undefined): LinkTypeFilter {
  if (state === "dimmed") return "hidden";
  if (state === "hidden") return "shown";
  return "dimmed";
}

/** Alt+digit flips between drawn and hidden. A dimmed type becomes hidden. */
export function toggleShownHidden(state: LinkTypeFilter | undefined): LinkTypeFilter {
  return state === "hidden" ? "shown" : "hidden";
}

export function soloFilters(ids: readonly string[], keepId: string): Record<string, LinkTypeFilter> {
  const filters: Record<string, LinkTypeFilter> = {};
  for (const id of ids) if (id !== keepId) filters[id] = "dimmed";
  return filters;
}

export function filterSummary(filters: Record<string, LinkTypeFilter> | undefined): string {
  let hidden = 0;
  let dimmed = 0;
  for (const value of Object.values(filters ?? {})) {
    if (value === "hidden") hidden += 1;
    else if (value === "dimmed") dimmed += 1;
  }
  const parts: string[] = [];
  if (hidden === 1) parts.push("1 type hidden");
  else if (hidden > 1) parts.push(`${hidden} types hidden`);
  if (dimmed === 1) parts.push("1 type dimmed");
  else if (dimmed > 1) parts.push(`${dimmed} types dimmed`);
  return parts.join(" · ");
}

export function withFilter(
  filters: Record<string, LinkTypeFilter> | undefined,
  id: string,
  state: LinkTypeFilter,
): Record<string, LinkTypeFilter> {
  const next = { ...(filters ?? {}) };
  if (state === "shown") delete next[id];
  else next[id] = state;
  return next;
}

export function linksOfType(doc: MapDocument, index: LinkIndex, nodeId: string, typeId: string): string[] {
  return visibleLinkIds(doc, index, nodeId).filter((id) => doc.links[id]?.typeId === typeId);
}

export function cycleTypedLink(
  doc: MapDocument,
  index: LinkIndex,
  nodeId: string,
  typeId: string,
  current: string | null,
  delta: 1 | -1,
): string | null {
  return cycleLink(linksOfType(doc, index, nodeId, typeId), current, delta);
}

export function followVisible(
  doc: MapDocument,
  index: LinkIndex,
  nodeId: string,
  typeId: string,
  sense: FollowSense,
): { linkId: string; nodeId: string }[] {
  return follow(doc, index, nodeId, typeId, sense, (linkId) => doc.view?.linkTypeFilters?.[doc.links[linkId]?.typeId ?? ""] !== "hidden");
}

export function linkCommit(
  prePicked: string | null,
  skipPicker: boolean,
  fallbackTypeId: string,
): { kind: "create"; typeId: string } | { kind: "pick" } {
  if (prePicked) return { kind: "create", typeId: prePicked };
  if (skipPicker) return { kind: "create", typeId: fallbackTypeId };
  return { kind: "pick" };
}

export function freshType(doc: MapDocument, name: string): { id: string; linkType: LinkType } {
  const trimmed = name.trim() || "New type";
  const base = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "type";
  let id = base;
  let n = 2;
  while (doc.nodes[id] || doc.links[id] || doc.linkTypes[id]) {
    id = `${base}-${n}`;
    n += 1;
  }
  const rows = typeRows(doc);
  return {
    id,
    linkType: {
      order: orderKeyAfter(rows.map((row) => row.order)),
      name: trimmed,
      color: TYPE_COLORS[rows.length % TYPE_COLORS.length],
      pattern: "solid",
      width: "normal",
      direction: "directed",
    },
  };
}

export function shiftedOrder(sorted: { id: string; order: string }[], id: string, delta: -1 | 1): string | null {
  const index = sorted.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sorted.length) return null;
  if (delta < 0) {
    const before = sorted[target - 1]?.order ?? null;
    return generateKeyBetween(before, sorted[target].order);
  }
  const after = sorted[target + 1]?.order ?? null;
  return generateKeyBetween(sorted[target].order, after);
}

export function deleteTypeCommands(
  doc: MapDocument,
  typeId: string,
  choice: { mode: "reassign" | "delete-links"; to: string },
): Command[] {
  const commands: Command[] = [];
  if (choice.mode === "delete-links") {
    const ids = Object.entries(doc.links)
      .filter(([, link]) => link.typeId === typeId)
      .map(([id]) => id);
    if (ids.length > 0) commands.push({ type: "deleteLinks", ids });
  }
  commands.push({ type: "deleteLinkType", id: typeId, reassignTo: choice.to });
  return commands;
}
