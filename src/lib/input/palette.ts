import { fuzzyRank } from "./linkOps";

export interface PaletteCommand {
  id: string;
  label: string;
  keys: string;
}

export interface PaletteNode {
  id: string;
  title: string;
  text: string;
}

export type PaletteHit =
  | { kind: "command"; id: string; label: string; keys: string }
  | { kind: "node"; id: string; label: string };

export function parsePaletteQuery(raw: string): { scope: "all" | "commands" | "nodes"; query: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith(">")) return { scope: "commands", query: trimmed.slice(1).trim() };
  if (trimmed.startsWith("@")) return { scope: "nodes", query: trimmed.slice(1).trim() };
  return { scope: "all", query: trimmed };
}

export function paletteResults(commands: readonly PaletteCommand[], nodes: readonly PaletteNode[], raw: string, limit = 20): PaletteHit[] {
  const parsed = parsePaletteQuery(raw);
  const commandHits: PaletteHit[] =
    parsed.scope === "nodes"
      ? []
      : fuzzyRank(commands, parsed.query, (command) => command.label).map((command) => ({
          kind: "command",
          id: command.id,
          label: command.label,
          keys: command.keys,
        }));
  const nodeHits: PaletteHit[] =
    parsed.scope === "commands"
      ? []
      : fuzzyRank(nodes, parsed.query, (node) => `${node.title} ${node.text}`).map((node) => ({
          kind: "node",
          id: node.id,
          label: node.title || "Untitled",
        }));
  return [...commandHits, ...nodeHits].slice(0, limit);
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  { id: "save", label: "Save", keys: "Mod+S" },
  { id: "save-as", label: "Save as", keys: "Mod+Shift+S" },
  { id: "open", label: "Open", keys: "Mod+O" },
  { id: "new-tab", label: "New tab", keys: "Mod+T" },
  { id: "close-tab", label: "Close tab", keys: "Mod+W" },
  { id: "preferences", label: "Preferences", keys: "Mod+," },
  { id: "undo", label: "Undo", keys: "Mod+Z" },
  { id: "redo", label: "Redo", keys: "Mod+Shift+Z" },
  { id: "help", label: "Shortcut help", keys: "?" },
  { id: "about", label: "About", keys: "Help" },
  { id: "updates", label: "Check for updates", keys: "Help" },
  { id: "legend", label: "Legend", keys: "Shift+L" },
  { id: "types", label: "Link-type manager", keys: "Mod+Shift+L" },
  { id: "link", label: "Start a link", keys: "L" },
  { id: "frame", label: "Frame the map", keys: "Shift+F" },
  { id: "focus", label: "Focus selection", keys: "F" },
  { id: "new-node", label: "New unlinked node", keys: "Mod+Enter" },
  { id: "delete", label: "Delete selection", keys: "Delete" },
  { id: "gizmo", label: "Show or hide the axis gizmo", keys: "Preferences" },
];
