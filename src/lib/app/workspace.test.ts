import { describe, expect, it } from "vitest";
import { MapSession } from "../core/session";
import { Workspace } from "./workspace";

function tab(title: string, path: string | null = null) {
  const session = MapSession.create({ id: title, title, now: "2026-01-01T00:00:00.000Z" });
  return { id: title, path, title, session };
}

describe("tabs", () => {
  it("keeps undo inside the tab that was edited", () => {
    const first = tab("One");
    const second = tab("Two");
    const workspace = new Workspace([first, second]);
    first.session.dispatch({
      type: "addNode",
      id: "n1",
      node: { text: "# One", position: { x: 0, y: 0, z: 0 } },
    });
    workspace.activate("Two");
    expect(workspace.active()?.session.history.canUndo).toBe(false);
    expect(workspace.active()?.session.undo()).toBe(false);
    workspace.activate("One");
    expect(workspace.active()?.session.history.canUndo).toBe(true);
    expect(workspace.active()?.session.doc.nodes.n1).toBeDefined();
    workspace.active()?.session.undo();
    expect(workspace.active()?.session.doc.nodes.n1).toBeUndefined();
    expect(second.session.history.canUndo).toBe(false);
  });

  it("switches to a file that is already open, and reopens the last closed tab", () => {
    const workspace = new Workspace([tab("One", "/maps/one.mindmap3d"), tab("Two", "/maps/two.mindmap3d")]);
    expect(workspace.findByPath("/maps/two.mindmap3d")?.id).toBe("Two");
    workspace.activate(workspace.findByPath("/maps/two.mindmap3d")!.id);
    expect(workspace.active()?.id).toBe("Two");
    workspace.close("Two", 20);
    expect(workspace.active()?.id).toBe("One");
    expect(workspace.reopen()?.title).toBe("Two");
    expect(workspace.active()?.path).toBe("/maps/two.mindmap3d");
    expect(workspace.tabAt(0, false)?.id).toBe("One");
    expect(workspace.tabAt(8, true)?.id).toBe("Two");
    expect(workspace.cycle(1)?.id).toBe("One");
  });
});
