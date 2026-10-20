import type { Link, LinkType, MapNode } from "./types";
import { MAX_TITLE_LENGTH } from "./types";

/**
 * Stored titles are single-line. Line breaks become spaces; an empty result
 * means "remove the field and derive from Markdown instead".
 */
export function normalizeTitle(input: string): string {
  const collapsed = input.replace(/[\r\n]+/g, " ").replace(/[ \t\f\v]+/g, " ").trim();
  return collapsed.slice(0, MAX_TITLE_LENGTH);
}

/** Strip the inline marks we expect in a one-line title. Not a full Markdown parser. */
export function stripInlineMarkdown(input: string): string {
  let s = input.trim();
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/~~([^~]*?)~~/g, "$1");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Explicit title if it is non-empty after normalisation; otherwise the first
 * heading when the text starts with one, else the first non-empty line.
 * The derived title is not stored.
 */
export function deriveTitle(explicit: string | undefined, text: string | undefined): string {
  if (explicit != null) {
    const normalized = normalizeTitle(explicit);
    if (normalized.length > 0) return normalized;
  }
  const lines = (text ?? "").split(/\r?\n/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (heading) return stripInlineMarkdown(heading[1]).slice(0, MAX_TITLE_LENGTH);
    return stripInlineMarkdown(raw).slice(0, MAX_TITLE_LENGTH);
  }
  return "";
}

export function nodeTitle(node: MapNode): string {
  return deriveTitle(node.title, node.text);
}

export interface LinkLabel {
  /** Null when the link has no explicit or derived title. */
  title: string | null;
  /** Type icon (if any) plus the type name. */
  typeLine: string;
}

export function linkTypeLine(type: LinkType | undefined): string {
  if (!type) return "Unknown type";
  return type.icon ? `${type.icon} ${type.name}` : type.name;
}

export function linkLabel(link: Link, type: LinkType | undefined): LinkLabel {
  const derived = deriveTitle(link.title, link.text);
  return {
    title: derived.length > 0 ? derived : null,
    typeLine: linkTypeLine(type),
  };
}
