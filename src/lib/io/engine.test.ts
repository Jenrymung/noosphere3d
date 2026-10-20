import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";
import { createEmptyMap } from "../core/document";
import { MapSession } from "../core/session";
import { nodeTitle } from "../core/title";
import { CURRENT_MINOR, CURRENT_VERSION } from "../core/types";
import { checkInvariants } from "./integrity";
import { loadMap } from "./load";
import { urbanFloodingDocument } from "./sampleMap";
import { STRESS_NODE_COUNT, stressMap } from "../scene/dummyMap";
import { serialize } from "./serialize";

const sampleFile = fileURLToPath(new URL("../../../samples/urban-flooding.mindmap3d", import.meta.url));

describe("stress map", () => {
  it("builds a few thousand valid nodes and links", () => {
    const doc = stressMap();
    expect(Object.keys(doc.nodes)).toHaveLength(STRESS_NODE_COUNT);
    expect(Object.keys(doc.links).length).toBeGreaterThan(4000);
    const loaded = loadMap(doc);
    expect(loaded.warnings).toEqual([]);
    expect(checkInvariants(loaded.doc)).toEqual([]);
  });
});

describe("sample file", () => {
  it("matches the canonical serialization of the section 7.2 document", () => {
    const canonical = serialize(urbanFloodingDocument());
    if (!existsSync(sampleFile)) {
      mkdirSync(dirname(sampleFile), { recursive: true });
      writeFileSync(sampleFile, canonical);
    }
    const text = readFileSync(sampleFile, "utf8");
    expect(text).toBe(canonical);
    const loaded = loadMap(JSON.parse(text));
    expect(loaded.readOnly).toBe(false);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.migratedFrom).toBeNull();
    expect(serialize(loaded.doc)).toBe(text);
    expect(nodeTitle(loaded.doc.nodes["n-flood"])).toBe("Flooding (city centre)");
    expect(loaded.doc.links.l1.source).toBe(loaded.doc.links.l2.source);
    expect(loaded.doc.links.l3.source).toBe(loaded.doc.links.l4.target);
    expect(loaded.doc.settings?.resourcesFolder).toBe("Urban flooding.resources");
  });

  it("writes object keys in a stable order", () => {
    const text = serialize(urbanFloodingDocument());
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "format",
      "version",
      "id",
      "meta",
      "settings",
      "view",
      "linkTypes",
      "nodes",
      "links",
      "extensions",
    ]);
    expect(Object.keys(parsed.nodes as object)).toEqual(["n-drainage", "n-flood", "n-rain"]);
    expect(Object.keys(parsed.links as object)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(Object.keys(parsed.linkTypes as object)[0]).toBe("relates-to");
    expect(Object.keys(parsed.linkTypes as object).at(-1)).toBe("01JB2X9Z0000000000000000T1");
    const l3 = (parsed.links as Record<string, { waypoints: object }>).l3;
    expect(Object.keys(l3.waypoints)).toEqual(["w-01", "w-02"]);
  });
});

describe("integrity repairs", () => {
  it("drops a dangling link, fills an unknown type, and resets a bad position", () => {
    const doc = urbanFloodingDocument();
    doc.links.lbad = { source: "n-rain", target: "missing", typeId: "causes", text: "" };
    doc.links.lunknown = { source: "n-rain", target: "n-flood", typeId: "nope", text: "" };
    doc.nodes["n-rain"].position = { x: Number.NaN, y: 1, z: 0 };
    doc.nodes["n-flood"].title = "  Line\nbreak  ";
    const loaded = loadMap(doc);
    expect(loaded.doc.links.lbad).toBeUndefined();
    expect(loaded.doc.linkTypes.nope?.name).toBe("Unknown type");
    expect(loaded.doc.links.lunknown.typeId).toBe("nope");
    expect(loaded.doc.nodes["n-rain"].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(loaded.doc.nodes["n-flood"].title).toBe("Line break");
    expect(loaded.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["link-dropped", "unknown-type", "position-reset", "title-normalized"]),
    );
    expect(checkInvariants(loaded.doc)).toEqual([]);
  });

  it("keeps self-links and refuses a resources path that escapes", () => {
    const doc = urbanFloodingDocument();
    doc.links.lself = { source: "n-flood", target: "n-flood", typeId: "relates-to", text: "" };
    doc.settings!.resourcesFolder = "maps/../../secret";
    const loaded = loadMap(doc);
    expect(loaded.doc.links.lself).toMatchObject({ source: "n-flood", target: "n-flood" });
    expect(loaded.doc.settings?.resourcesFolder).toBeUndefined();
  });

  it("restores relates-to when the registry is empty, and repairs a bad default", () => {
    const doc = urbanFloodingDocument();
    doc.linkTypes = {} as typeof doc.linkTypes;
    for (const link of Object.values(doc.links)) link.typeId = "ghost";
    doc.settings!.defaultLinkTypeId = "nope";
    const loaded = loadMap(doc);
    expect(loaded.doc.linkTypes["relates-to"].name).toBe("relates to");
    expect(loaded.doc.linkTypes.ghost.name).toBe("Unknown type");
    expect(loaded.doc.settings?.defaultLinkTypeId).toBe("relates-to");
  });

  it("caps waypoints and renames an id that collides with a link type", () => {
    const doc = urbanFloodingDocument();
    doc.nodes["relates-to"] = { text: "# Clash", position: { x: 1, y: 0, z: 0 } };
    doc.links.lclash = { source: "relates-to", target: "n-flood", typeId: "causes", text: "" };
    const waypoints: Record<string, { order: string; position: { x: number; y: number; z: number } }> = {};
    for (let i = 0; i < 70; i += 1) {
      waypoints[`w${i}`] = { order: `a${i}`, position: { x: i, y: 0, z: 0 } };
    }
    doc.links.l3.waypoints = waypoints;
    const loaded = loadMap(doc);
    expect(loaded.doc.nodes["relates-to"]).toBeUndefined();
    expect(loaded.doc.nodes["relates-to~2"].text).toBe("# Clash");
    expect(loaded.doc.links.lclash.source).toBe("relates-to~2");
    expect(Object.keys(loaded.doc.links.l3.waypoints ?? {})).toHaveLength(64);
  });
});

describe("migrations", () => {
  it("migrates a dummy v0 array document to v1", () => {
    const loaded = loadMap({
      format: "mindmap3d",
      version: 0,
      title: "Old notes",
      nodes: [
        { id: "a", text: "# Alpha", x: 1, y: 2, z: 3 },
        { id: "b", text: "Beta", x: 0, y: 0, z: 0 },
      ],
      links: [{ id: "ab", source: "a", target: "b", text: "joined" }],
    });
    expect(loaded.migratedFrom).toBe(0);
    expect(loaded.migrations).toEqual(["v0-arrays-to-v1-records"]);
    expect(loaded.doc.version).toBe(1);
    expect(loaded.doc.nodes.a.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(loaded.doc.links.ab.typeId).toBe("relates-to");
    expect(loaded.doc.linkTypes.causes.direction).toBe("directed");
    expect(loaded.doc.meta?.title).toBe("Old notes");
    expect(checkInvariants(loaded.doc)).toEqual([]);
  });

  it("refuses a file made with a newer major version and does not change it", () => {
    const doc = urbanFloodingDocument();
    doc.version = 2;
    const before = JSON.stringify(doc);
    expect(() => loadMap(doc)).toThrow(/made with a newer version/);
    expect(() => MapSession.load(doc)).toThrow(/made with a newer version/);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("opens a newer minor version and round-trips unknown fields", () => {
    const raw = JSON.parse(serialize(urbanFloodingDocument())) as Record<string, unknown>;
    raw.minor = 4;
    raw.reviewNote = { keep: true };
    const nodes = raw.nodes as Record<string, Record<string, unknown>>;
    nodes["n-flood"].glow = "soft";
    (nodes["n-flood"].position as Record<string, unknown>).anchor = "centre";
    const links = raw.links as Record<string, Record<string, unknown>>;
    links.l1.weight = 3;
    const waypoints = (links.l3.waypoints as Record<string, Record<string, unknown>>);
    waypoints["w-01"].note = "bend";
    const types = raw.linkTypes as Record<string, Record<string, unknown>>;
    types.causes.emphasis = "high";
    (raw.meta as Record<string, unknown>).editor = "planner";
    (raw.settings as Record<string, unknown>).grid = 0.5;

    const loaded = loadMap(raw);
    expect(loaded.readOnly).toBe(false);
    expect(loaded.doc.version).toBe(CURRENT_VERSION);
    expect(loaded.doc.minor).toBe(4);
    expect(loaded.doc.minor).toBeGreaterThan(CURRENT_MINOR);
    const session = MapSession.load(raw);
    session.dispatch({
      type: "editText",
      target: "node",
      id: "n-rain",
      text: "# Heavy rain\nStill the same map.",
    });
    const saved = JSON.parse(serialize(session.doc)) as Record<string, unknown>;
    expect(saved.minor).toBe(4);
    expect(saved.reviewNote).toEqual({ keep: true });
    expect((saved.nodes as Record<string, Record<string, unknown>>)["n-flood"].glow).toBe("soft");
    expect(
      ((saved.nodes as Record<string, { position: Record<string, unknown> }>)["n-flood"].position).anchor,
    ).toBe("centre");
    expect((saved.links as Record<string, Record<string, unknown>>).l1.weight).toBe(3);
    expect(
      ((saved.links as Record<string, { waypoints: Record<string, Record<string, unknown>> }>).l3.waypoints)["w-01"]
        .note,
    ).toBe("bend");
    expect((saved.linkTypes as Record<string, Record<string, unknown>>).causes.emphasis).toBe("high");
    expect((saved.meta as Record<string, unknown>).editor).toBe("planner");
    expect((saved.settings as Record<string, unknown>).grid).toBe(0.5);
    expect(serialize(loadMap(JSON.parse(serialize(session.doc))).doc)).toBe(serialize(session.doc));
  });

  it("rejects a corrupt file without throwing a raw parser exception", () => {
    expect(() => loadMap({ format: "other", version: 1 })).toThrow(/mindmap3d/);
    expect(() => loadMap("nope")).toThrow(/JSON object/);
  });
});

const STARTER_TYPES = [
  ["relates-to", "relates to"],
  ["causes", "leads to / causes"],
  ["part-of", "part of"],
  ["depends-on", "depends on"],
  ["contradicts", "contradicts"],
  ["example-of", "example of"],
  ["supports", "supports"],
] as const;

describe("starter link types", () => {
  it.each(STARTER_TYPES)("a brand-new map includes %s (%s)", (id, name) => {
    const doc = createEmptyMap({ id: "fresh", now: "2026-10-20T00:00:00.000Z" });
    expect(Object.keys(doc.linkTypes)).toHaveLength(STARTER_TYPES.length);
    expect(doc.linkTypes[id]?.name).toBe(name);
    expect(doc.settings?.defaultLinkTypeId).toBe("relates-to");
  });
});

describe("commands, history and indexes", () => {
  it("undoes and redoes, and groups typing inside the window", () => {
    const session = MapSession.create({ id: "m", title: "T", now: "2026-10-20T00:00:00.000Z" });
    session.dispatch({
      type: "addNode",
      id: "n1",
      node: { text: "# One", position: { x: 0, y: 0, z: 0 } },
    });
    session.selection = { nodeId: "n1", linkId: null };
    session.dispatch(
      { type: "editText", target: "node", id: "n1", text: "# One!" },
      { groupKey: "edit:node:n1", now: 1_000 },
    );
    session.dispatch(
      { type: "editText", target: "node", id: "n1", text: "# One!!" },
      { groupKey: "edit:node:n1", now: 1_400 },
    );
    expect(session.history.undoDepth).toBe(2);
    session.undo();
    expect(session.doc.nodes.n1.text).toBe("# One");
    expect(session.selection.nodeId).toBe("n1");
    session.redo();
    expect(session.doc.nodes.n1.text).toBe("# One!!");

    session.dispatch(
      { type: "editText", target: "node", id: "n1", text: "# Later" },
      { groupKey: "edit:node:n1", now: 4_000 },
    );
    expect(session.history.undoDepth).toBe(3);
    session.closeGroup();
    session.dispatch(
      { type: "editText", target: "node", id: "n1", text: "# Fresh" },
      { groupKey: "edit:node:n1", now: 4_100 },
    );
    expect(session.history.undoDepth).toBe(4);
  });

  it("reverses a link and its waypoint order as one step", () => {
    const session = MapSession.load(urbanFloodingDocument());
    session.dispatch({ type: "reverseLink", linkId: "l3" });
    expect(session.doc.links.l3.source).toBe("n-drainage");
    expect(session.doc.links.l3.target).toBe("n-flood");
    const orders = Object.entries(session.doc.links.l3.waypoints ?? {})
      .sort((a, b) => (a[1].order < b[1].order ? -1 : 1))
      .map(([id]) => id);
    expect(orders).toEqual(["w-02", "w-01"]);
    session.undo();
    expect(session.doc.links.l3.source).toBe("n-flood");
    const restored = Object.entries(session.doc.links.l3.waypoints ?? {})
      .sort((a, b) => (a[1].order < b[1].order ? -1 : 1))
      .map(([id]) => id);
    expect(restored).toEqual(["w-01", "w-02"]);
  });

  it("deletes a link type by reassigning, and keeps the index in sync", () => {
    const session = MapSession.load(urbanFloodingDocument());
    session.dispatch({ type: "deleteLinkType", id: "causes", reassignTo: "supports" });
    expect(session.doc.links.l1.typeId).toBe("supports");
    expect(session.doc.linkTypes.causes).toBeUndefined();
    expect(session.index.snapshot().byType.causes).toBeUndefined();
    expect(session.index.snapshot().byType.supports).toContain("l1");
    expect(checkInvariants(session.doc)).toEqual([]);
    session.undo();
    expect(session.doc.links.l1.typeId).toBe("causes");
    expect(session.index.snapshot()).toEqual(
      (awaitIndex(session.doc)),
    );
  });

  it("allows a self-link and refuses to delete the last type", () => {
    const session = MapSession.create({ id: "m", now: "2026-10-20T00:00:00.000Z" });
    session.dispatch({
      type: "addNode",
      id: "n",
      node: { text: "# Self", position: { x: 0, y: 0, z: 0 } },
    });
    session.dispatch({
      type: "addLink",
      id: "loop",
      link: { source: "n", target: "n", typeId: "relates-to", text: "" },
    });
    expect(session.doc.links.loop.source).toBe("n");
    const types = Object.keys(session.doc.linkTypes);
    for (let i = 0; i < types.length - 1; i += 1) {
      const remaining = Object.keys(session.doc.linkTypes).filter((id) => id !== types[i]);
      session.dispatch({ type: "deleteLinkType", id: types[i], reassignTo: remaining[0] });
    }
    expect(Object.keys(session.doc.linkTypes)).toHaveLength(1);
    expect(() =>
      session.dispatch({
        type: "deleteLinkType",
        id: Object.keys(session.doc.linkTypes)[0],
        reassignTo: "missing",
      }),
    ).toThrow();
    expect(checkInvariants(session.doc)).toEqual([]);
  });

  it("round-trips a moved selection of nodes and waypoints", () => {
    const session = MapSession.load(urbanFloodingDocument());
    session.dispatch({
      type: "moveSelection",
      nodes: [{ id: "n-flood", position: { x: 2, y: 2, z: 2 } }],
      waypoints: [{ linkId: "l3", waypointId: "w-01", position: { x: 9, y: 9, z: 9 } }],
    });
    const saved = serialize(session.doc);
    expect(serialize(loadMap(JSON.parse(saved)).doc)).toBe(saved);
    session.undo();
    expect(session.doc.nodes["n-flood"].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("inserts an order key between two link types", () => {
    const session = MapSession.load(urbanFloodingDocument());
    const between = generateKeyBetween("a0", "a1");
    session.dispatch({
      type: "addLinkType",
      id: "custom",
      linkType: {
        order: between,
        name: "inspires",
        color: "#112233",
        pattern: "dotted",
        width: "thin",
        direction: "undirected",
      },
    });
    const order = Object.values(session.doc.linkTypes)
      .map((type) => type.order)
      .sort();
    expect(order.indexOf(between)).toBe(order.indexOf("a0") + 1);
  });
});

function awaitIndex(doc: ReturnType<typeof urbanFloodingDocument>) {
  return MapSession.load(doc).index.snapshot();
}
