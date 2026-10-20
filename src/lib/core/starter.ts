import type { LinkType } from "./types";

/**
 * The seven approved starter types. Readable ids stay stable across maps so
 * copy/paste and templates can match them. Field values match the sample file.
 */
export function starterLinkTypes(): Record<string, LinkType> {
  return {
    "relates-to": {
      order: "a0",
      name: "relates to",
      color: "#999999",
      pattern: "solid",
      width: "normal",
      direction: "undirected",
    },
    causes: {
      order: "a1",
      name: "leads to / causes",
      color: "#E69F00",
      pattern: "solid",
      width: "normal",
      direction: "directed",
      icon: "→",
      description: "A causes or results in B.",
    },
    "part-of": {
      order: "a2",
      name: "part of",
      color: "#0072B2",
      pattern: "solid",
      width: "thick",
      direction: "directed",
      icon: "◆",
    },
    "depends-on": {
      order: "a3",
      name: "depends on",
      color: "#CC79A7",
      pattern: "dashed",
      width: "normal",
      direction: "directed",
      icon: "⚙",
    },
    contradicts: {
      order: "a4",
      name: "contradicts",
      color: "#D55E00",
      pattern: "dashed",
      width: "thick",
      direction: "undirected",
      icon: "✕",
    },
    "example-of": {
      order: "a5",
      name: "example of",
      color: "#56B4E9",
      pattern: "dotted",
      width: "normal",
      direction: "directed",
      icon: "●",
    },
    supports: {
      order: "a6",
      name: "supports",
      color: "#009E73",
      pattern: "solid",
      width: "normal",
      direction: "directed",
      icon: "+",
    },
  };
}

export const RELATES_TO_ID = "relates-to";

export function placeholderLinkType(order: string): LinkType {
  return {
    order,
    name: "Unknown type",
    color: "#999999",
    pattern: "solid",
    width: "normal",
    direction: "undirected",
  };
}
