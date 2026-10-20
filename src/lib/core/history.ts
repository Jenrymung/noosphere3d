import { applyPatches, type Patch } from "immer";
import type { MapDocument, SelectionSnapshot } from "./types";

/** Typing in one edit session merges until this much time passes, or the group is closed. */
export const GROUPING_WINDOW_MS = 1500;
export const HISTORY_LIMIT = 500;

export interface HistoryEntry {
  label: string;
  forward: Patch[];
  inverse: Patch[];
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
  groupKey?: string;
  groupAt: number;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  push(entry: HistoryEntry): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (
      last &&
      entry.groupKey &&
      last.groupKey === entry.groupKey &&
      entry.groupAt - last.groupAt <= GROUPING_WINDOW_MS &&
      entry.groupAt >= last.groupAt
    ) {
      last.forward = [...last.forward, ...entry.forward];
      last.inverse = [...entry.inverse, ...last.inverse];
      last.selectionAfter = entry.selectionAfter;
      last.groupAt = entry.groupAt;
    } else {
      this.undoStack.push(entry);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Leaving Edit mode ends the current typing group. */
  closeGroup(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last) last.groupKey = undefined;
  }

  undo(doc: MapDocument): { doc: MapDocument; selection: SelectionSnapshot } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    const next = applyPatches(doc, entry.inverse) as MapDocument;
    this.redoStack.push(entry);
    return { doc: next, selection: entry.selectionBefore };
  }

  redo(doc: MapDocument): { doc: MapDocument; selection: SelectionSnapshot } | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    const next = applyPatches(doc, entry.forward) as MapDocument;
    this.undoStack.push(entry);
    return { doc: next, selection: entry.selectionAfter };
  }
}
