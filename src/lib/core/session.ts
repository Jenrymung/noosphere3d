import { enablePatches, produce, produceWithPatches } from "immer";
import { loadMap, type LoadedMap } from "../io/load";
import { checkInvariants } from "../io/integrity";
import { applyCommand, CommandError, type Command } from "./commands";
import { LinkIndex } from "./graph";
import { History } from "./history";
import { createEmptyMap, type CreateMapOptions } from "./document";
import { emptySelection, type Issue, type LinkTypeFilter, type MapDocument, type SelectionSnapshot } from "./types";

enablePatches();

export interface DispatchOptions {
  /** Same key within the grouping window merges into one undo step (typing). */
  groupKey?: string;
  /** Clock for tests. Defaults to Date.now(). */
  now?: number;
}

/**
 * One document, its undo history, and its graph index.
 * A future tab strip holds one of these per open map.
 * Camera, mode and filters-as-UI-state stay outside this object.
 */
export class MapSession {
  doc: MapDocument;
  readonly history = new History();
  readonly index: LinkIndex;
  selection: SelectionSnapshot = emptySelection();
  readonly warnings: Issue[];
  readonly readOnly: boolean;
  readonly migratedFrom: number | null;

  private constructor(loaded: LoadedMap) {
    this.doc = loaded.doc;
    this.warnings = loaded.warnings;
    this.readOnly = loaded.readOnly;
    this.migratedFrom = loaded.migratedFrom;
    this.index = LinkIndex.from(loaded.doc);
  }

  static create(options?: CreateMapOptions): MapSession {
    return new MapSession({
      doc: createEmptyMap(options),
      warnings: [],
      readOnly: false,
      migratedFrom: null,
      migrations: [],
    });
  }

  static load(input: unknown): MapSession {
    return new MapSession(loadMap(input));
  }

  dispatch(command: Command, options?: DispatchOptions): void {
    if (this.readOnly) throw new CommandError("This map is read-only");
    const now = options?.now ?? Date.now();
    const [next, forward, inverse] = produceWithPatches(this.doc, (draft) => {
      applyCommand(draft, command);
    });
    const errors = checkInvariants(next);
    if (errors.length > 0) {
      throw new CommandError(errors.map((issue) => issue.message).join("; "));
    }
    const selectionBefore = { ...this.selection };
    this.doc = next;
    this.noteSelection(command);
    if (forward.length > 0) {
      this.history.push({
        label: command.type,
        forward,
        inverse,
        selectionBefore,
        selectionAfter: { ...this.selection },
        groupKey: options?.groupKey,
        groupAt: now,
      });
    }
    this.index.sync(this.doc);
  }

  undo(): boolean {
    const result = this.history.undo(this.doc);
    if (!result) return false;
    this.doc = result.doc;
    this.selection = result.selection;
    this.index.sync(this.doc);
    return true;
  }

  redo(): boolean {
    const result = this.history.redo(this.doc);
    if (!result) return false;
    this.doc = result.doc;
    this.selection = result.selection;
    this.index.sync(this.doc);
    return true;
  }

  closeGroup(): void {
    this.history.closeGroup();
  }

  /** View filters stay out of undo. Shown types are stored by omission. */
  setLinkFilters(filters: Record<string, LinkTypeFilter>): void {
    this.doc = produce(this.doc, (draft) => {
      if (!draft.view) draft.view = {};
      const cleaned: Record<string, LinkTypeFilter> = {};
      for (const [id, value] of Object.entries(filters)) {
        if (value === "dimmed" || value === "hidden") cleaned[id] = value;
      }
      if (Object.keys(cleaned).length === 0) delete draft.view.linkTypeFilters;
      else draft.view.linkTypeFilters = cleaned;
      if (!draft.view.camera && !draft.view.linkTypeFilters) delete draft.view;
    });
  }

  private noteSelection(command: Command): void {
    if (command.type === "deleteNodes" && this.selection.nodeId && command.ids.includes(this.selection.nodeId)) {
      this.selection = { ...this.selection, nodeId: null };
    }
    if (this.selection.linkId && !this.doc.links[this.selection.linkId]) {
      this.selection = { ...this.selection, linkId: null };
    }
  }
}
