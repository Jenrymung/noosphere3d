import type { LinePattern, LineWidth } from "../core/types";

/** Screen-space stroke for the link-mode rubber band. */
export interface RubberStroke {
  color: string;
  dashed: boolean;
  dashSize: number;
  gapSize: number;
  linewidth: number;
}

const NEUTRAL: RubberStroke = {
  color: "#9bb0c4",
  dashed: true,
  dashSize: 0.22,
  gapSize: 0.16,
  linewidth: 3,
};

/**
 * No pre-picked type keeps the neutral dashed band.
 * A pre-picked type contributes its colour, dash pattern, and width,
 * using the same dash and width steps as a drawn link of that type.
 */
export function rubberStroke(type?: { color: string; pattern: LinePattern; width: LineWidth } | null): RubberStroke {
  if (!type) return { ...NEUTRAL };
  const dashed = type.pattern !== "solid";
  return {
    color: type.color,
    dashed,
    dashSize: type.pattern === "dotted" ? 0.12 : 0.42,
    gapSize: type.pattern === "dotted" ? 0.22 : 0.32,
    linewidth: type.width === "thick" ? 4.5 : type.width === "thin" ? 1.25 : 2.4,
  };
}
