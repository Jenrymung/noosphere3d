import { describe, expect, it } from "vitest";
import { linkPointerConfirm } from "./linkClick";

describe("link click", () => {
  it("creates the link for the node under the pointer, or the aimed node", () => {
    expect(linkPointerConfirm("outfall", "intake")).toEqual({ targetId: "intake", create: true });
    expect(linkPointerConfirm("outfall", null)).toEqual({ targetId: "outfall", create: true });
    expect(linkPointerConfirm(null, null)).toEqual({ targetId: null, create: false });
  });
});