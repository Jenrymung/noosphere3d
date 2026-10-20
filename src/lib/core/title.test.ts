import { describe, expect, it } from "vitest";
import { urbanFloodingDocument } from "../io/sampleMap";
import { deriveTitle, linkLabel, nodeHasBody, nodeTitle, normalizeTitle, stripInlineMarkdown, wrapTitle } from "./title";

describe("title derivation", () => {
  it("prefers an explicit title", () => {
    expect(deriveTitle("Flooding (city centre)", "# Flooding\nbody")).toBe("Flooding (city centre)");
  });

  it("uses the first heading when the text starts with one", () => {
    expect(deriveTitle(undefined, "# Heavy rain")).toBe("Heavy rain");
    expect(deriveTitle(undefined, "\n\n## Drainage system\n- storm drains")).toBe("Drainage system");
  });

  it("uses the first non-empty line when the text does not start with a heading", () => {
    expect(deriveTitle(undefined, "Just a line\n# Later heading")).toBe("Just a line");
  });

  it("strips inline formatting", () => {
    expect(stripInlineMarkdown("**Heavy** rain and *more*")).toBe("Heavy rain and more");
    expect(deriveTitle(undefined, "# See the [2024 report](report.md)")).toBe("See the 2024 report");
    expect(deriveTitle(undefined, "A `code` name")).toBe("A code name");
    expect(deriveTitle(undefined, "# **Drainage** system")).toBe("Drainage system");
  });

  it("treats an empty explicit title as missing", () => {
    expect(deriveTitle("", "# Kept")).toBe("Kept");
    expect(deriveTitle("   \n  ", "fallback line")).toBe("fallback line");
  });

  it("collapses stored titles to a single line and drops empties", () => {
    expect(normalizeTitle("  Flooding\n(city)")).toBe("Flooding (city)");
    expect(normalizeTitle(" \n ")).toBe("");
  });

  it("derives the sample file's node and link labels", () => {
    const doc = urbanFloodingDocument();
    expect(nodeTitle(doc.nodes["n-rain"])).toBe("Heavy rain");
    expect(nodeTitle(doc.nodes["n-flood"])).toBe("Flooding (city centre)");
    expect(nodeTitle(doc.nodes["n-drainage"])).toBe("Drainage system");

    const causes = linkLabel(doc.links.l1, doc.linkTypes.causes);
    expect(causes.title).toBe("Overwhelms drains");
    expect(causes.typeLine).toBe("→ leads to / causes");

    const related = linkLabel(doc.links.l2, doc.linkTypes["relates-to"]);
    expect(related.title).toBe("See the 2024 rainfall report");
    expect(related.typeLine).toBe("relates to");

    const depends = linkLabel(doc.links.l3, doc.linkTypes["depends-on"]);
    expect(depends.title).toBeNull();
    expect(depends.typeLine).toBe("⚙ depends on");

    const mitigates = linkLabel(doc.links.l4, doc.linkTypes["01JB2X9Z0000000000000000T1"]);
    expect(mitigates.title).toBeNull();
    expect(mitigates.typeLine).toBe("≈ mitigates");
  });

  it("uses a text icon only when there is body copy beyond the title", () => {
    const doc = urbanFloodingDocument();
    expect(nodeHasBody(doc.nodes["n-rain"])).toBe(false);
    expect(nodeHasBody(doc.nodes["n-flood"])).toBe(true);
    expect(nodeHasBody(doc.nodes["n-drainage"])).toBe(true);
    expect(nodeHasBody({ text: "", title: "Only a title", position: { x: 0, y: 0, z: 0 } })).toBe(false);
  });

  it("wraps scene titles to two short lines", () => {
    expect(wrapTitle("Flooding (city centre)")).toBe("Flooding (city centre)");
    expect(wrapTitle("One two three four five six seven eight nine")).toBe("One two three four five six\nseven eight nine");
    const wrapped = wrapTitle("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda");
    expect(wrapped.split("\n")).toHaveLength(2);
    expect(wrapped.endsWith("…")).toBe(true);
  });
});
