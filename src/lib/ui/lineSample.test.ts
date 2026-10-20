import { describe, expect, it } from "vitest";
import { starterLinkTypes } from "../core/starter";
import { lineSample } from "./lineSample";

describe("legend line sample", () => {
  it("keeps colour, dash pattern, and arrow direction together", () => {
    const types = starterLinkTypes();
    expect(lineSample({ color: types["relates-to"].color, pattern: types["relates-to"].pattern, direction: types["relates-to"].direction })).toMatchObject({
      pattern: "solid",
      arrow: "none",
    });
    const causes = lineSample({ color: types.causes.color, pattern: "dashed", direction: types.causes.direction });
    expect(causes.arrow).toBe("forward");
    expect(causes.pattern).toBe("dashed");
    expect(causes.color).toBe(types.causes.color);
    expect(lineSample({ color: "#000000", pattern: "dotted", direction: "bidirectional" }).arrow).toBe("both");
  });
});
