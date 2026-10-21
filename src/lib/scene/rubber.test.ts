import { describe, expect, it } from "vitest";
import { starterLinkTypes } from "../core/starter";
import { rubberStroke } from "./rubber";

describe("link-mode rubber band", () => {
  it("keeps a neutral dash when no type is pre-picked", () => {
    expect(rubberStroke(undefined)).toEqual({
      color: "#9bb0c4",
      dashed: true,
      dashSize: 0.22,
      gapSize: 0.16,
      linewidth: 3,
    });
    expect(rubberStroke(null)).toEqual(rubberStroke(undefined));
  });

  it("uses the pre-picked type's colour, dash pattern, and width", () => {
    const types = starterLinkTypes();
    expect(rubberStroke(types["relates-to"])).toMatchObject({
      color: "#999999",
      dashed: false,
      linewidth: 2.4,
    });
    expect(rubberStroke(types["part-of"])).toMatchObject({
      color: "#0072B2",
      dashed: false,
      linewidth: 4.5,
    });
    expect(rubberStroke(types["depends-on"])).toEqual({
      color: "#CC79A7",
      dashed: true,
      dashSize: 0.42,
      gapSize: 0.32,
      linewidth: 2.4,
    });
    expect(rubberStroke(types.contradicts)).toMatchObject({
      color: "#D55E00",
      dashed: true,
      dashSize: 0.42,
      gapSize: 0.32,
      linewidth: 4.5,
    });
    expect(rubberStroke(types["example-of"])).toEqual({
      color: "#56B4E9",
      dashed: true,
      dashSize: 0.12,
      gapSize: 0.22,
      linewidth: 2.4,
    });
    expect(rubberStroke({ color: "#112233", pattern: "dotted", width: "thin" })).toMatchObject({
      color: "#112233",
      dashed: true,
      dashSize: 0.12,
      gapSize: 0.22,
      linewidth: 1.25,
    });
  });
});
