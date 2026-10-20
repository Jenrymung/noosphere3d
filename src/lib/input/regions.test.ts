import { describe, expect, it } from "vitest";
import { cycleRegion } from "./regions";

describe("region cycling", () => {
  it("walks tabs, scene, reader, and status", () => {
    expect(cycleRegion("tabs", 1, true)).toBe("scene");
    expect(cycleRegion("scene", 1, true)).toBe("reader");
    expect(cycleRegion("reader", 1, true)).toBe("status");
    expect(cycleRegion("status", 1, true)).toBe("tabs");
    expect(cycleRegion("tabs", -1, true)).toBe("status");
    expect(cycleRegion("scene", 1, false)).toBe("status");
    expect(cycleRegion("status", 1, false)).toBe("tabs");
  });
});
