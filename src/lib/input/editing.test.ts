import { describe, expect, it } from "vitest";
import { MapSession } from "../core/session";
import { linkOriginOnSelect, stepEscape } from "./escape";
import { GRAB_SNAP, GrabOperator } from "./grab";

describe("escape steps", () => {
  const base = {
    panel: "navigate" as const,
    editFromReader: false,
    pinned: false,
    nodeId: "n-flood",
    linkId: null as string | null,
    linkOriginId: null as string | null,
  };

  it("walks Edit back to the Reader, then leaves the selection in the scene", () => {
    expect(stepEscape({ ...base, panel: "edit", editFromReader: true })).toEqual({ kind: "close-edit", next: "reader" });
    expect(stepEscape({ ...base, panel: "reader" })).toEqual({ kind: "close-reader" });
    expect(stepEscape({ ...base, panel: "edit", editFromReader: false })).toEqual({ kind: "close-edit", next: "navigate" });
  });

  it("returns a selected link to the node you arrived from", () => {
    expect(
      stepEscape({ ...base, linkId: "l4", linkOriginId: "n-drainage", nodeId: "n-flood" }),
    ).toEqual({ kind: "return-to-node", nodeId: "n-drainage" });
  });

  it("keeps the arrival node while cycling links, and records it on the first link", () => {
    expect(linkOriginOnSelect({ linkId: null, nodeId: "n-drainage", linkOriginId: null })).toBe("n-drainage");
    expect(linkOriginOnSelect({ linkId: "l4", nodeId: "n-flood", linkOriginId: "n-drainage" })).toBe("n-drainage");
  });

  it("clears a selected node in Navigate and leaves a pinned reader for the scene", () => {
    expect(stepEscape(base)).toEqual({ kind: "clear-selection" });
    expect(stepEscape({ ...base, panel: "reader", pinned: true })).toEqual({ kind: "clear-selection" });
    expect(stepEscape({ ...base, nodeId: null })).toEqual({ kind: "noop" });
  });
});

describe("grab operator", () => {
  const origin = { x: 1, y: 2, z: 3 };

  it("cancels back to the exact start and confirms the moved position", () => {
    const grab = new GrabOperator(origin);
    grab.add({ x: 2, y: -1, z: 0.5 });
    expect(grab.confirm()).toEqual({ x: 3, y: 1, z: 3.5 });
    expect(new GrabOperator(origin).cancel()).toEqual(origin);
    expect(origin).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("locks to a world axis, snaps, and shrinks the delta while precise", () => {
    const locked = new GrabOperator(origin);
    locked.toggleAxis("x");
    locked.add({ x: 1.2, y: 4, z: -3 });
    expect(locked.position()).toEqual({ x: 2.2, y: 2, z: 3 });
    locked.toggleAxis("x");
    expect(locked.position().y).not.toBe(2);

    const snapped = new GrabOperator(origin);
    snapped.add({ x: 0.4, y: 0.2, z: -0.8 }, { snap: GRAB_SNAP });
    expect(snapped.position()).toEqual({ x: 1.5, y: 2, z: 2 });

    const fine = new GrabOperator(origin);
    const coarse = new GrabOperator(origin);
    fine.add({ x: 1, y: 0, z: 0 }, { precision: true });
    coarse.add({ x: 1, y: 0, z: 0 });
    expect(fine.position().x).toBeCloseTo(1.2);
    expect(coarse.position().x).toBeCloseTo(2);
  });
});

describe("editing commands", () => {
  it("groups a tab-created node and its link into one undo step", () => {
    const session = MapSession.create({ id: "map", title: "Scratch", now: "2026-01-01T00:00:00.000Z" });
    session.dispatch({
      type: "addNode",
      id: "a",
      node: { text: "Seed", position: { x: 0, y: 0, z: 0 } },
    });
    const now = 1_000;
    session.dispatch(
      { type: "addNode", id: "b", node: { text: "Next", position: { x: 2, y: 0, z: 0 } } },
      { groupKey: "tab:b", now },
    );
    session.dispatch(
      { type: "addLink", id: "l", link: { source: "a", target: "b", typeId: "relates-to", text: "" } },
      { groupKey: "tab:b", now },
    );
    expect(session.history.undoDepth).toBe(2);
    expect(session.undo()).toBe(true);
    expect(session.doc.nodes.b).toBeUndefined();
    expect(session.doc.links.l).toBeUndefined();
    expect(session.doc.nodes.a.text).toBe("Seed");
  });

  it("merges a burst of typing and keeps the position after a move", () => {
    const session = MapSession.create({ id: "map", now: "2026-01-01T00:00:00.000Z" });
    session.dispatch({ type: "addNode", id: "a", node: { text: "", position: { x: 0, y: 0, z: 0 } } });
    session.dispatch({ type: "editText", target: "node", id: "a", text: "H" }, { groupKey: "edit:node:a", now: 10 });
    session.dispatch({ type: "editText", target: "node", id: "a", text: "Hi" }, { groupKey: "edit:node:a", now: 40 });
    session.dispatch({ type: "setTitle", target: "node", id: "a", title: "Hi" }, { groupKey: "edit:node:a", now: 50 });
    session.closeGroup();
    session.dispatch({ type: "moveNodes", moves: [{ id: "a", position: { x: 3, y: 1, z: 0 } }] });
    expect(session.doc.nodes.a.position).toEqual({ x: 3, y: 1, z: 0 });
    expect(session.undo()).toBe(true);
    expect(session.doc.nodes.a.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(session.doc.nodes.a.text).toBe("Hi");
    expect(session.undo()).toBe(true);
    expect(session.doc.nodes.a.text).toBe("");
    expect(session.doc.nodes.a.title).toBeUndefined();
  });
});
