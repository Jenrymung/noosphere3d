import { describe, expect, it } from "vitest";
import { statusHint } from "./hints";

describe("status hints", () => {
  it("names the keys for each mode", () => {
    expect(statusHint("navigate")).toContain("Mod+K");
    expect(statusHint("link")).toContain("/");
    expect(statusHint("edit")).toContain("Reader");
    expect(statusHint("grab")).toContain("Esc");
    expect(statusHint("view")).toContain("Enter");
    expect(statusHint("read")).toContain("F6");
  });
});
