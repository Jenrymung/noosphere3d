import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { clockFor, freshTrack, isDirty, markEdited, markSaved, promptFor } from "../app/tabState";
import { MapSession } from "../core/session";
import { DEFAULT_PREFERENCES } from "./preferences";
import { shouldAutosave, shouldWriteRecovery } from "./saveController";
import { serialize } from "./serialize";

describe("view state and autosave", () => {
  it("does not autosave a camera or filter change until a document edit writes them", () => {
    const session = MapSession.create({ id: "map-notes", title: "Notes", now: "2026-10-20T00:00:00.000Z" });
    session.dispatch({ type: "addNode", id: "n1", node: { text: "Ideas", position: { x: 0, y: 0, z: 0 } } });
    const track = freshTrack("recovery-notes");
    track.path = "/maps/notes.mindmap3d";
    markSaved(track, session.history.stateId, { modifiedMs: 1_000, len: 8 }, 1_000, false);
    const savedId = session.history.stateId;
    const undoDepth = session.history.undoDepth;

    session.setLinkFilters({ causes: "hidden" });
    expect(session.history.stateId).toBe(savedId);
    expect(session.history.undoDepth).toBe(undoDepth);
    expect(session.doc.view?.camera).toBeUndefined();
    expect(session.doc.view?.linkTypeFilters).toEqual({ causes: "hidden" });
    expect(isDirty(track, session.history.stateId)).toBe(false);

    const autosave = { ...DEFAULT_PREFERENCES, saveMode: "autosave" as const };
    const quiet = clockFor(track, autosave, session.history.stateId);
    expect(shouldAutosave(quiet, 60_000, "tick")).toBe(false);
    expect(shouldAutosave(quiet, 60_000, "blur")).toBe(false);
    expect(shouldAutosave(quiet, 60_000, "close")).toBe(false);
    expect(shouldWriteRecovery(quiet, 60_000)).toBe(false);
    expect(promptFor(track, DEFAULT_PREFERENCES, session.history.stateId)).toBe(false);
    expect(shouldAutosave({ ...quiet, mode: "manual" }, 60_000, "tick")).toBe(false);
    expect(shouldAutosave({ ...quiet, mode: "manual" }, 60_000, "close")).toBe(false);

    session.dispatch({ type: "editText", target: "node", id: "n1", text: "Ideas revised" });
    expect(session.history.stateId).not.toBe(savedId);
    markEdited(track, session.history.stateId, 70_000);
    const edited = clockFor(track, autosave, session.history.stateId);
    expect(edited.dirty).toBe(true);
    expect(shouldAutosave(edited, 72_000, "tick")).toBe(true);
    expect(shouldAutosave(edited, 70_050, "blur")).toBe(true);
    expect(shouldAutosave(edited, 70_050, "close")).toBe(true);

    const pose = { position: { x: 4, y: 5, z: 6 }, target: { x: 0, y: 1, z: 0 } };
    const text = serialize(
      produce(session.doc, (draft) => {
        draft.view ??= {};
        draft.view.camera = { position: { ...pose.position }, target: { ...pose.target } };
      }),
    );
    const parsed = JSON.parse(text) as {
      view: { linkTypeFilters: Record<string, string>; camera: { position: typeof pose.position; target: typeof pose.target } };
    };
    expect(parsed.view.linkTypeFilters).toEqual({ causes: "hidden" });
    expect(parsed.view.camera.position).toEqual(pose.position);
    expect(parsed.view.camera.target).toEqual(pose.target);
    expect(session.doc.view?.camera).toBeUndefined();
  });
});
