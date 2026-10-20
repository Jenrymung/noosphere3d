import type { LinkDirection, LinePattern } from "../core/types";

export interface LineSample {
  color: string;
  pattern: LinePattern;
  direction: LinkDirection;
  /** Drawn beside the stroke so the direction is not carried by colour alone. */
  arrow: "forward" | "both" | "none";
}

export function lineSample(type: { color: string; pattern: LinePattern; direction: LinkDirection }): LineSample {
  return {
    color: type.color,
    pattern: type.pattern,
    direction: type.direction,
    arrow: type.direction === "bidirectional" ? "both" : type.direction === "undirected" ? "none" : "forward",
  };
}
