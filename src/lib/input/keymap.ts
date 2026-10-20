/** Shortcuts the help sheet and the reserved-key check read. Handlers use the same chords. */

export interface Chord {
  /** Character from KeyboardEvent.key. Symbol shortcuts (/ and ?) use this. */
  key?: string;
  /** Physical KeyboardEvent.code. Letters and digits use this. */
  code?: string;
  /** Ctrl on Linux/Windows, Cmd on macOS. */
  mod?: boolean;
  /** Ctrl on every platform. Tab switching uses this so Cmd+Tab stays with macOS. */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface Binding {
  id: string;
  group: string;
  keys: string;
  action: string;
  chords: Chord[];
  /** Dev/test label toggles stay out of the cheat sheet. */
  devOnly?: boolean;
}

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const RESERVED = new Set(["Meta+KeyH", "Meta+KeyM", "Meta+KeyQ", "Meta+Space", "Meta+Tab", "Alt+Tab", "Alt+F4"]);

function token(chord: Chord, modKey: "Ctrl" | "Meta"): string {
  const parts: string[] = [];
  if (chord.mod) parts.push(modKey);
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  parts.push(chord.code ?? (chord.key === " " ? "Space" : (chord.key ?? "")));
  return parts.join("+");
}

export function reservedConflicts(bindings: readonly Binding[]): string[] {
  const hits: string[] = [];
  for (const binding of bindings) {
    for (const chord of binding.chords) {
      const variants = chord.mod ? [token(chord, "Ctrl"), token(chord, "Meta")] : [token(chord, "Ctrl")];
      for (const variant of variants) {
        if (RESERVED.has(variant)) hits.push(`${binding.id}: ${variant}`);
      }
    }
  }
  return hits;
}

/** "/" and "?" match event.key and may need Shift. Letters and digits match event.code. */
export function matchesChord(chord: Chord, event: KeyLike): boolean {
  const symbol = chord.key === "/" || chord.key === "?";
  if (chord.key != null && event.key !== chord.key) return false;
  if (chord.code != null && event.code !== chord.code) return false;
  if (!symbol && Boolean(chord.alt) !== event.altKey) return false;
  if (!symbol && Boolean(chord.shift) !== event.shiftKey) return false;
  if (symbol) return !event.metaKey && !event.ctrlKey && !event.altKey;
  if (chord.ctrl) return event.ctrlKey && !event.metaKey;
  if (chord.mod) return (event.ctrlKey || event.metaKey) && !event.altKey;
  return !event.ctrlKey && !event.metaKey;
}

export function bindingById(id: string): Binding {
  const found = KEYMAP.find((binding) => binding.id === id);
  if (!found) throw new Error(`Unknown shortcut ${id}`);
  return found;
}

export function helpSections(bindings: readonly Binding[] = KEYMAP): { title: string; rows: { keys: string; action: string }[] }[] {
  const sections: { title: string; rows: { keys: string; action: string }[] }[] = [];
  for (const binding of bindings) {
    if (binding.devOnly) continue;
    let section = sections.find((item) => item.title === binding.group);
    if (!section) {
      section = { title: binding.group, rows: [] };
      sections.push(section);
    }
    section.rows.push({ keys: binding.keys, action: binding.action });
  }
  return sections;
}

const digit = (n: number): Chord => ({ code: `Digit${n}` });

export const KEYMAP: Binding[] = [
  { id: "tab-new", group: "Navigate", keys: "Tab", action: "New linked node, then Edit", chords: [{ key: "Tab" }] },
  { id: "shift-tab", group: "Navigate", keys: "Shift+Tab", action: "New linked node after picking a type", chords: [{ key: "Tab", shift: true }] },
  { id: "mod-enter", group: "Navigate", keys: "Mod+Enter", action: "New unlinked node, then Edit", chords: [{ key: "Enter", mod: true }] },
  { id: "enter-read", group: "Navigate", keys: "Enter", action: "Open the Reader", chords: [{ key: "Enter" }] },
  { id: "edit", group: "Navigate", keys: "E", action: "Edit the selection", chords: [{ code: "KeyE" }] },
  { id: "link", group: "Navigate", keys: "L", action: "Start a link", chords: [{ code: "KeyL" }] },
  { id: "grab", group: "Navigate", keys: "G", action: "Grab the selected node", chords: [{ code: "KeyG" }] },
  { id: "view", group: "Navigate", keys: "V", action: "Orbit the view with the mouse", chords: [{ code: "KeyV" }] },
  { id: "delete", group: "Navigate", keys: "Delete / Backspace", action: "Delete the selection", chords: [{ key: "Delete" }, { key: "Backspace" }] },
  { id: "undo", group: "Navigate", keys: "Mod+Z", action: "Undo", chords: [{ code: "KeyZ", mod: true }] },
  { id: "redo", group: "Navigate", keys: "Mod+Shift+Z / Ctrl+Y", action: "Redo", chords: [{ code: "KeyZ", mod: true, shift: true }, { code: "KeyY", ctrl: true }] },
  { id: "type-digit", group: "Links", keys: "1–9", action: "Set the selected link’s type", chords: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit) },
  { id: "type-picker", group: "Links", keys: "T", action: "Type picker for the selected link", chords: [{ code: "KeyT" }] },
  { id: "type-cycle", group: "Links", keys: "Shift+T / Alt+Shift+T", action: "Next / previous type", chords: [{ code: "KeyT", shift: true }, { code: "KeyT", shift: true, alt: true }] },
  { id: "reverse", group: "Links", keys: "R", action: "Reverse the selected link", chords: [{ code: "KeyR" }] },
  { id: "arrows", group: "Move", keys: "Arrow keys", action: "Nearest node in that screen direction", chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }, { key: "ArrowUp" }, { key: "ArrowDown" }] },
  { id: "depth", group: "Move", keys: "Mod+Up / Mod+Down", action: "Nearer / farther node", chords: [{ key: "ArrowUp", mod: true }, { key: "ArrowDown", mod: true }] },
  { id: "history", group: "Move", keys: "B / Shift+B", action: "Back / forward through nodes you visited", chords: [{ code: "KeyB" }, { code: "KeyB", shift: true }] },
  { id: "cycle-links", group: "Move", keys: "] / [", action: "Next / previous visible link", chords: [{ code: "BracketRight" }, { code: "BracketLeft" }] },
  { id: "cycle-type", group: "Move", keys: "Alt+] / Alt+[", action: "Next / previous link of the active type", chords: [{ code: "BracketRight", alt: true }, { code: "BracketLeft", alt: true }] },
  { id: "follow", group: "Move", keys: ". / ,", action: "Follow the active type forward / backward", chords: [{ key: "." }, { key: "," }] },
  { id: "orbit", group: "Camera", keys: "Shift+Arrows", action: "Orbit around the focus", chords: [{ key: "ArrowLeft", shift: true }] },
  { id: "pan", group: "Camera", keys: "Alt+Arrows", action: "Pan", chords: [{ key: "ArrowLeft", alt: true }] },
  { id: "zoom", group: "Camera", keys: "= / -", action: "Zoom in / out", chords: [{ code: "Equal" }, { code: "Minus" }] },
  { id: "focus", group: "Camera", keys: "F", action: "Focus the selection", chords: [{ code: "KeyF" }] },
  { id: "frame", group: "Camera", keys: "Shift+F / Home", action: "Frame the whole map", chords: [{ code: "KeyF", shift: true }, { code: "Home" }] },
  { id: "palette", group: "Global", keys: "/ or Mod+K", action: "Command palette. In Link mode, / still searches for a node", chords: [{ key: "/" }, { code: "KeyK", mod: true }] },
  { id: "help", group: "Global", keys: "?", action: "Shortcut cheat sheet", chords: [{ key: "?" }] },
  { id: "escape", group: "Global", keys: "Esc", action: "Step back one level", chords: [{ key: "Escape" }] },
  { id: "new-tab", group: "Global", keys: "Mod+T / Mod+N", action: "New map in a new tab", chords: [{ code: "KeyT", mod: true }, { code: "KeyN", mod: true }] },
  { id: "open", group: "Global", keys: "Mod+O", action: "Open a map", chords: [{ code: "KeyO", mod: true }] },
  { id: "save", group: "Global", keys: "Mod+S", action: "Save now", chords: [{ code: "KeyS", mod: true }] },
  { id: "save-as", group: "Global", keys: "Mod+Shift+S", action: "Save as", chords: [{ code: "KeyS", mod: true, shift: true }] },
  { id: "close-tab", group: "Global", keys: "Mod+W", action: "Close the current tab", chords: [{ code: "KeyW", mod: true }] },
  { id: "preferences", group: "Global", keys: "Mod+,", action: "Preferences", chords: [{ key: ",", mod: true }] },
  { id: "pin", group: "Global", keys: "Mod+\\", action: "Pin or unpin the Reader", chords: [{ code: "Backslash", mod: true }] },
  { id: "regions", group: "Global", keys: "F6 / Shift+F6", action: "Move focus: tabs, scene, Reader, status", chords: [{ key: "F6" }, { key: "F6", shift: true }] },
  { id: "legend", group: "Global", keys: "Shift+L", action: "Legend", chords: [{ code: "KeyL", shift: true }] },
  { id: "manager", group: "Global", keys: "Mod+Shift+L", action: "Link-type manager", chords: [{ code: "KeyL", mod: true, shift: true }] },
  {
    id: "filter-digits",
    group: "Global",
    keys: "Alt+1–9 / Alt+0",
    action: "Hide or show a type / show every type",
    chords: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ code: `Digit${n}`, alt: true })),
  },
  { id: "tab-next", group: "Tabs", keys: "Ctrl+Tab / Ctrl+Shift+Tab", action: "Next / previous tab", chords: [{ code: "Tab", ctrl: true }, { code: "Tab", ctrl: true, shift: true }] },
  { id: "reopen", group: "Tabs", keys: "Mod+Shift+T", action: "Reopen the last closed tab", chords: [{ code: "KeyT", mod: true, shift: true }] },
  { id: "tab-number", group: "Tabs", keys: "Mod+1–8 / Mod+9", action: "Go to a numbered tab, or the last tab", chords: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ code: `Digit${n}`, mod: true })) },
  { id: "reader-edit", group: "Reader", keys: "E or Enter", action: "Switch to Edit", chords: [{ code: "KeyE" }, { key: "Enter" }] },
  { id: "reader-close", group: "Reader", keys: "Esc", action: "Close the Reader", chords: [{ key: "Escape" }] },
  { id: "edit-commit", group: "Edit", keys: "Esc or Mod+Enter", action: "Commit and return to the Reader", chords: [{ key: "Escape" }, { key: "Enter", mod: true }] },
  { id: "edit-title", group: "Edit", keys: "Alt+T", action: "Move between the title and the body", chords: [{ code: "KeyT", alt: true }] },
  { id: "link-search", group: "Link mode", keys: "/", action: "Pick the target by name", chords: [{ key: "/" }] },
  { id: "link-confirm", group: "Link mode", keys: "Enter or click", action: "Create the link", chords: [{ key: "Enter" }] },
  { id: "link-cancel", group: "Link mode", keys: "Esc or right-click", action: "Cancel", chords: [{ key: "Escape" }] },
  { id: "link-new", group: "Link mode", keys: "N", action: "New node as the target", chords: [{ code: "KeyN" }] },
  { id: "grab-keep", group: "Grab", keys: "Enter or click", action: "Keep the move", chords: [{ key: "Enter" }] },
  { id: "grab-cancel", group: "Grab", keys: "Esc or right-click", action: "Put the node back", chords: [{ key: "Escape" }] },
  { id: "view-keep", group: "View", keys: "Enter or click", action: "Keep the camera", chords: [{ key: "Enter" }] },
  { id: "view-cancel", group: "View", keys: "Esc or right-click", action: "Restore the camera", chords: [{ key: "Escape" }] },
  { id: "label-dev", group: "Dev", keys: "` / Shift+`", action: "Label drawing toggles", chords: [{ code: "Backquote" }, { code: "Backquote", shift: true }], devOnly: true },
];
