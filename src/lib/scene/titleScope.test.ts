import { describe, expect, it } from "vitest";
import { nextTitleScope, titleScopeLabel } from "./titleScope";

describe("show titles", () => {
  it("cycles off, nodes only, then nodes and links", () => {
    expect(nextTitleScope("off")).toBe("nodes");
    expect(nextTitleScope("nodes")).toBe("nodes-and-links");
    expect(nextTitleScope("nodes-and-links")).toBe("off");
    expect(titleScopeLabel("nodes-and-links")).toBe("Nodes and links");
  });
});
