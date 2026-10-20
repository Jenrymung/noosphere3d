import { describe, expect, it } from "vitest";
import { LinkIndex } from "../core/graph";
import { urbanFloodingDocument } from "../io/sampleMap";
import type { MapDocument } from "../core/types";
import { cameraFollowAction, cameraMoveMs } from "./cameraFollow";
import { cycleLink, visibleLinkIds } from "./cycle";
import { NavHistory } from "./navHistory";
import { ViewOperator } from "./viewOperator";

describe("view operator", () => {
  const start = { position: { x: 0, y: 4, z: 18 }, target: { x: 0, y: 0, z: 0 } };

  it("restores the exact camera on cancel and keeps it on confirm", () => {
    const operator = new ViewOperator(start);
    operator.orbitAngles(0.4, -0.15);
    operator.pan(1.5, -0.4);
    expect(operator.current.position).not.toEqual(start.position);
    expect(operator.cancel()).toEqual(start);
    expect(start.position).toEqual({ x: 0, y: 4, z: 18 });

    const kept = new ViewOperator(start);
    kept.dolly(0.5);
    const confirmed = kept.confirm();
    expect(confirmed.target).toEqual(start.target);
    expect(confirmed.position.z).toBeCloseTo(9, 5);
  });

  it("pans the camera and the focus point together", () => {
    const operator = new ViewOperator(start);
    operator.pan(2, 0);
    const next = operator.current;
    expect(next.position.x - start.position.x).toBeCloseTo(2);
    expect(next.target.x - start.target.x).toBeCloseTo(2);
    expect(next.position.z).toBeCloseTo(start.position.z);
  });
});

describe("navigation history and link cycling", () => {
  it("walks back and forward and drops the undone tail on a new visit", () => {
    const history = new NavHistory();
    history.visit("a");
    history.visit("b");
    history.visit("c");
    expect(history.back()).toBe("b");
    expect(history.back()).toBe("a");
    expect(history.back()).toBeNull();
    expect(history.forward()).toBe("b");
    history.visit("d");
    expect(history.back()).toBe("b");
    expect(history.back()).toBe("a");
    expect(history.forward()).toBe("b");
    expect(history.forward()).toBe("d");
    expect(history.forward()).toBeNull();
  });

  it("does not push the same node twice", () => {
    const history = new NavHistory();
    history.visit("a");
    history.visit("a");
    expect(history.back()).toBeNull();
  });

  it("cycles the visible links on the flooding sample and skips hidden types", () => {
    const doc = urbanFloodingDocument();
    const index = LinkIndex.from(doc);
    expect(visibleLinkIds(doc, index, "n-flood")).toEqual(["l1", "l2", "l3", "l4"]);
    expect(cycleLink(["l1", "l2", "l3"], null, 1)).toBe("l1");
    expect(cycleLink(["l1", "l2", "l3"], "l1", 1)).toBe("l2");
    expect(cycleLink(["l1", "l2", "l3"], "l1", -1)).toBe("l3");

    const hidden: MapDocument = {
      ...doc,
      view: { linkTypeFilters: { causes: "hidden", "relates-to": "hidden" } },
    };
    expect(visibleLinkIds(hidden, index, "n-rain")).toEqual([]);
    expect(visibleLinkIds(hidden, index, "n-flood")).toEqual(["l3", "l4"]);
  });
});

describe("camera follow", () => {
  it("focuses when the point is off-screen or too far, and cuts under reduced motion", () => {
    expect(cameraFollowAction({ ndcX: 0, ndcY: 0, ndcZ: 0, distance: 10 })).toBe("hold");
    expect(cameraFollowAction({ ndcX: 0.8, ndcY: 0, ndcZ: 0, distance: 10 })).toBe("nudge");
    expect(cameraFollowAction({ ndcX: 1.2, ndcY: 0, ndcZ: 0, distance: 8 })).toBe("focus");
    expect(cameraFollowAction({ ndcX: 0, ndcY: 0, ndcZ: 0, distance: 40 })).toBe("focus");
    expect(cameraMoveMs(false)).toBe(280);
    expect(cameraMoveMs(true)).toBe(0);
  });
});
