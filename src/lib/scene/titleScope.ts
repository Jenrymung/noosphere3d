/** What the Show titles control draws. Off, then nodes, then nodes and links. */
export type TitleScope = "off" | "nodes" | "nodes-and-links";

export const TITLE_SCOPE_ORDER: readonly TitleScope[] = ["off", "nodes", "nodes-and-links"];

export function nextTitleScope(current: TitleScope): TitleScope {
  const index = TITLE_SCOPE_ORDER.indexOf(current);
  return TITLE_SCOPE_ORDER[(index + 1) % TITLE_SCOPE_ORDER.length] ?? "nodes";
}

export function titleScopeLabel(scope: TitleScope): string {
  if (scope === "off") return "Off";
  if (scope === "nodes") return "Nodes only";
  return "Nodes and links";
}
