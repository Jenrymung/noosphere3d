import { describe, expect, it } from "vitest";
import { follow, linksForPair, neighbours } from "./graph";
import { MapSession } from "./session";
import { urbanFloodingDocument } from "../io/sampleMap";

describe("graph queries", () => {
  const session = MapSession.load(urbanFloodingDocument());
  const doc = session.doc;
  const index = session.index;

  it("lists neighbours and both links of a pair", () => {
    const rain = neighbours(doc, index, "n-rain").map((item) => item.linkId);
    expect(rain).toEqual(["l1", "l2"]);
    expect(linksForPair(index, "n-flood", "n-rain")).toEqual(["l1", "l2"]);
    expect(linksForPair(index, "n-flood", "n-drainage").sort()).toEqual(["l3", "l4"]);
  });

  it("follows a directed type forward and backward", () => {
    expect(follow(doc, index, "n-rain", "causes", "forward")).toEqual([{ linkId: "l1", nodeId: "n-flood" }]);
    expect(follow(doc, index, "n-rain", "causes", "backward")).toEqual([]);
    expect(follow(doc, index, "n-flood", "causes", "backward")).toEqual([{ linkId: "l1", nodeId: "n-rain" }]);
    expect(follow(doc, index, "n-flood", "depends-on", "forward")).toEqual([
      { linkId: "l3", nodeId: "n-drainage" },
    ]);
  });

  it("walks an undirected type in either sense and can skip a hidden link", () => {
    const forward = follow(doc, index, "n-rain", "relates-to", "forward");
    const backward = follow(doc, index, "n-rain", "relates-to", "backward");
    expect(forward).toEqual(backward);
    expect(forward).toEqual([{ linkId: "l2", nodeId: "n-flood" }]);
    expect(follow(doc, index, "n-rain", "relates-to", "forward", () => false)).toEqual([]);
  });

  it("includes a self-link", () => {
    const session = MapSession.create({ id: "m", now: "2026-10-20T00:00:00.000Z" });
    session.dispatch({ type: "addNode", id: "n", node: { text: "# N", position: { x: 0, y: 0, z: 0 } } });
    session.dispatch({
      type: "addLink",
      id: "loop",
      link: { source: "n", target: "n", typeId: "causes", text: "" },
    });
    expect(neighbours(session.doc, session.index, "n")).toEqual([{ linkId: "loop", nodeId: "n", role: "self" }]);
    expect(follow(session.doc, session.index, "n", "causes", "forward")).toEqual([{ linkId: "loop", nodeId: "n" }]);
    expect(follow(session.doc, session.index, "n", "causes", "backward")).toEqual([{ linkId: "loop", nodeId: "n" }]);
  });
});
