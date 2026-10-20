import { describe, expect, it } from "vitest";
import { LinkIndex } from "../core/graph";
import { MapSession } from "../core/session";
import { urbanFloodingDocument } from "../io/sampleMap";
import { announceLink, announceOpened, liveAnnouncement } from "./announce";
import { neighbourhoodTree } from "./tree";

describe("neighbourhood tree", () => {
  it("names the node and groups its links by type", () => {
    const doc = urbanFloodingDocument();
    const tree = neighbourhoodTree(doc, LinkIndex.from(doc), "n-flood");
    expect(tree.accessibleName).toBe("Flooding (city centre), document, 7 words, 4 links");
    expect(tree.summary).toBe("Node: Flooding (city centre). 4 links: 1 relates to, 1 leads to / causes, 1 depends on, 1 mitigates");
    const causes = tree.groups.find((group) => group.typeId === "causes");
    expect(causes?.links[0]?.other).toEqual({ id: "n-rain", title: "Heavy rain", loop: false });
    expect(causes?.links[0]?.phrase).toBe("Heavy rain leads to / causes Flooding (city centre)");
  });

  it("shows a loop as a reference without nesting that node again", () => {
    const session = MapSession.create({ id: "loops", now: "2026-10-20T00:00:00.000Z" });
    session.dispatch({ type: "addNode", id: "a", node: { text: "Loop", position: { x: 0, y: 0, z: 0 } } });
    session.dispatch({
      type: "addLink",
      id: "self",
      link: { source: "a", target: "a", typeId: "relates-to", text: "" },
    });
    const tree = neighbourhoodTree(session.doc, session.index, "a");
    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0]?.links[0]?.other).toEqual({ id: "a", title: "Loop", loop: true });
    expect(tree.groups[0]?.links[0]?.phrase).toBe("Loop relates to itself");
    expect(tree.summary).toBe("Node: Loop. 1 link: 1 relates to");
  });
});

describe("announcements", () => {
  it("reads a link with its type and an opened reader", () => {
    const doc = urbanFloodingDocument();
    expect(announceLink(doc, "l1")).toBe("Link: Overwhelms drains, type leads to / causes, from Heavy rain to Flooding (city centre)");
    expect(announceLink(doc, "l3")).toBe("Link: Flooding (city centre) depends on Drainage system");
    expect(announceOpened("Flooding (city centre)")).toBe("Opened Flooding (city centre). Press E to edit, Escape to close");
    const session = MapSession.load(doc);
    expect(
      liveAnnouncement({
        doc,
        index: session.index,
        nodeId: "n-flood",
        linkId: null,
        panel: "closed",
        openedTitle: null,
        linkMode: false,
        operator: "",
      }),
    ).toContain("Node: Flooding (city centre)");
    expect(
      liveAnnouncement({
        doc,
        index: session.index,
        nodeId: "n-flood",
        linkId: "l1",
        panel: "read",
        openedTitle: "Overwhelms drains",
        linkMode: false,
        operator: "",
      }),
    ).toBe("Opened Overwhelms drains. Press E to edit, Escape to close");
  });
});
