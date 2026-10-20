import { describe, expect, it } from "vitest";
import { MapSession } from "../core/session";
import {
  cycleFilter,
  cycleTypeId,
  cycleTypedLink,
  deleteTypeCommands,
  filterSummary,
  followVisible,
  freshType,
  fuzzyRank,
  linkCommit,
  shiftedOrder,
  soloFilters,
  toggleShownHidden,
  typeIdForDigit,
  typeRows,
  withFilter,
} from "./linkOps";

function mapWithChain() {
  const session = MapSession.create({ id: "map", title: "Chain", now: "2026-01-01T00:00:00.000Z" });
  session.dispatch({ type: "addNode", id: "a", node: { text: "# Rain", position: { x: 0, y: 0, z: 0 } } });
  session.dispatch({ type: "addNode", id: "b", node: { text: "# Flood", position: { x: 2, y: 0, z: 0 } } });
  session.dispatch({ type: "addNode", id: "c", node: { text: "# Pump", position: { x: 4, y: 0, z: 0 } } });
  session.dispatch({
    type: "addLink",
    id: "ab",
    link: { source: "a", target: "b", typeId: "causes", text: "runoff" },
  });
  session.dispatch({
    type: "addLink",
    id: "ab2",
    link: { source: "a", target: "b", typeId: "relates-to", text: "" },
  });
  session.dispatch({
    type: "addLink",
    id: "bc",
    link: { source: "b", target: "c", typeId: "causes", text: "" },
  });
  return session;
}

describe("link types", () => {
  it("numbers the first nine types and cycles in registry order", () => {
    const session = MapSession.create({ id: "map", title: "Types", now: "2026-01-01T00:00:00.000Z" });
    expect(typeIdForDigit(session.doc, 1)).toBe("relates-to");
    expect(typeIdForDigit(session.doc, 2)).toBe("causes");
    expect(typeIdForDigit(session.doc, 10)).toBeNull();
    expect(cycleTypeId(session.doc, "relates-to", 1)).toBe("causes");
    expect(cycleTypeId(session.doc, "relates-to", -1)).toBe(typeRows(session.doc).at(-1)?.id);
  });

  it("fuzzy-matches names and descriptions", () => {
    const session = MapSession.create({ id: "map", title: "Types", now: "2026-01-01T00:00:00.000Z" });
    const ranked = fuzzyRank(typeRows(session.doc), "cau", (row) => `${row.name} ${row.description ?? ""}`);
    expect(ranked[0]?.id).toBe("causes");
    expect(fuzzyRank(typeRows(session.doc), "zzzz", (row) => row.name)).toEqual([]);
  });

  it("groups a run of type changes into one undo step", () => {
    const session = mapWithChain();
    const now = 5_000;
    session.dispatch({ type: "setLinkType", linkId: "ab", typeId: "supports" }, { groupKey: "type-cycle:ab", now });
    session.dispatch({ type: "setLinkType", linkId: "ab", typeId: "part-of" }, { groupKey: "type-cycle:ab", now: now + 200 });
    expect(session.doc.links.ab.typeId).toBe("part-of");
    expect(session.history.undoDepth).toBe(7);
    session.undo();
    expect(session.doc.links.ab.typeId).toBe("causes");
  });
});

describe("type filters and follow", () => {
  it("cycles filter states and summarises what is hidden", () => {
    expect(cycleFilter("shown")).toBe("dimmed");
    expect(cycleFilter("dimmed")).toBe("hidden");
    expect(cycleFilter("hidden")).toBe("shown");
    expect(toggleShownHidden("dimmed")).toBe("hidden");
    expect(toggleShownHidden("hidden")).toBe("shown");
    const filters = withFilter(soloFilters(["relates-to", "causes"], "causes"), "supports", "hidden");
    expect(filters.causes).toBeUndefined();
    expect(filters["relates-to"]).toBe("dimmed");
    expect(filterSummary(filters)).toBe("1 type hidden · 1 type dimmed");
    expect(filterSummary({})).toBe("");
  });

  it("follows a type in direction and skips hidden types", () => {
    const session = mapWithChain();
    expect(followVisible(session.doc, session.index, "a", "causes", "forward").map((hit) => hit.nodeId)).toEqual(["b"]);
    expect(followVisible(session.doc, session.index, "b", "causes", "backward").map((hit) => hit.nodeId)).toEqual(["a"]);
    expect(cycleTypedLink(session.doc, session.index, "a", "causes", null, 1)).toBe("ab");
    session.setLinkFilters({ causes: "hidden" });
    expect(followVisible(session.doc, session.index, "a", "causes", "forward")).toEqual([]);
    expect(cycleTypedLink(session.doc, session.index, "a", "causes", null, 1)).toBeNull();
    expect(session.history.canUndo).toBe(true);
    session.undo();
    expect(session.doc.view?.linkTypeFilters?.causes).toBe("hidden");
  });

  it("deletes a type by reassignment or by removing its links, as one undo", () => {
    const session = mapWithChain();
    const reassign = deleteTypeCommands(session.doc, "causes", { mode: "reassign", to: "relates-to" });
    const now = 9_000;
    for (const command of reassign) session.dispatch(command, { groupKey: "delete-type:causes", now });
    expect(session.doc.linkTypes.causes).toBeUndefined();
    expect(session.doc.links.ab.typeId).toBe("relates-to");
    expect(session.doc.links.bc.typeId).toBe("relates-to");
    session.undo();
    expect(session.doc.links.ab.typeId).toBe("causes");

    const removing = deleteTypeCommands(session.doc, "causes", { mode: "delete-links", to: "relates-to" });
    for (const command of removing) session.dispatch(command, { groupKey: "delete-type:causes", now: now + 10 });
    expect(session.doc.links.ab).toBeUndefined();
    expect(session.doc.links.bc).toBeUndefined();
    expect(session.doc.links.ab2.typeId).toBe("relates-to");
    session.undo();
    expect(session.doc.links.ab.typeId).toBe("causes");
    expect(session.doc.links.bc).toBeDefined();
  });

  it("creates a type after the current set and can move its order key", () => {
    const session = MapSession.create({ id: "map", title: "Types", now: "2026-01-01T00:00:00.000Z" });
    const created = freshType(session.doc, "Collaborates");
    session.dispatch({ type: "addLinkType", id: created.id, linkType: created.linkType });
    expect(session.doc.linkTypes[created.id].name).toBe("Collaborates");
    expect(session.doc.linkTypes[created.id].direction).toBe("directed");
    const before = typeRows(session.doc).map((row) => row.id);
    const order = shiftedOrder(
      typeRows(session.doc).map((row) => ({ id: row.id, order: row.order })),
      created.id,
      -1,
    );
    expect(order).toBeTruthy();
    session.dispatch({ type: "reorderLinkType", id: created.id, order: order! });
    const after = typeRows(session.doc).map((row) => row.id);
    expect(after.indexOf(created.id)).toBe(before.indexOf(created.id) - 1);
  });
});

describe("link confirm", () => {
  it("uses a pre-picked type, otherwise the picker, unless the skip setting is on", () => {
    expect(linkCommit("causes", false, "relates-to")).toEqual({ kind: "create", typeId: "causes" });
    expect(linkCommit(null, false, "relates-to")).toEqual({ kind: "pick" });
    expect(linkCommit(null, true, "supports")).toEqual({ kind: "create", typeId: "supports" });
  });
});
