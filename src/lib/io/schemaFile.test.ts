import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { urbanFloodingDocument } from "./sampleMap";
import { assertMapSchema } from "./schema";

describe("published map schema", () => {
  it("covers the sample document's fields", () => {
    const schema = JSON.parse(readFileSync(new URL("../../../docs/mindmap3d.schema.json", import.meta.url), "utf8")) as {
      $schema: string;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.$schema).toContain("2020-12");
    expect(schema.required).toEqual(expect.arrayContaining(["format", "version", "linkTypes", "nodes", "links"]));
    const sample = urbanFloodingDocument();
    assertMapSchema(sample);
    for (const key of Object.keys(sample)) expect(schema.properties).toHaveProperty(key);
  });
});
