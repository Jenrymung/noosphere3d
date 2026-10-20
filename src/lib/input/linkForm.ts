import type { LinkDirection, LinePattern, LineWidth } from "../core/types";

export interface TypeDraft {
  name: string;
  color: string;
  pattern: LinePattern;
  width: LineWidth;
  direction: LinkDirection;
  icon: string;
  description: string;
}
