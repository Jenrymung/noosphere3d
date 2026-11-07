import { describe, expect, it } from "vitest";
import { MapSession } from "../core/session";

describe("node coordinates", () => {
  it("keeps each position edit as its own undo step", () => {
    const session = MapSession.create({ id: "coords", now: "2026-11-07T00:00:00.000Z" });
    session.dispatch({ type: "addNode", id: "n", node: { text: "Node", position: { x: 0, y: 0, z: 0 } } });
    session.dispatch({ type: "moveNodes", moves: [{ id: "n", position: { x: 1, y: 0, z: 0 } }] });
    session.dispatch({ type: "moveNodes", moves: [{ id: "n", position: { x: 1, y: 2, z: 0 } }] });
    expect(session.doc.nodes.n?.position).toEqual({ x: 1, y: 2, z: 0 });
    expect(session.history.undoDepth).toBe(3);
    expect(session.undo()).toBe(true);
    expect(session.doc.nodes.n?.position).toEqual({ x: 1, y: 0, z: 0 });
    expect(session.undo()).toBe(true);
    expect(session.doc.nodes.n?.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
