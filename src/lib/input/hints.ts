export type HintMode = "navigate" | "read" | "edit" | "link" | "grab" | "view";

export function statusHint(mode: HintMode): string {
  switch (mode) {
    case "navigate":
      return "Arrows move · Enter reads · / or Mod+K commands";
    case "read":
      return "E edits · Esc closes · F6 moves between regions";
    case "edit":
      return "Esc or Mod+Enter returns to the Reader";
    case "link":
      return "Arrows or hover aim · Enter or click creates · / finds a name · Esc cancels";
    case "grab":
      return "Arrows nudge · Enter keeps · Esc restores";
    case "view":
      return "Drag orbits · Enter keeps · Esc restores";
  }
}
