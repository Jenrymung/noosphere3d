import { describe, expect, it } from "vitest";
import { PALETTE_COMMANDS, paletteResults, parsePaletteQuery } from "./palette";

const nodes = [
  { id: "n-rain", title: "Heavy rain", text: "Rain over the city" },
  { id: "n-flood", title: "Flooding", text: "Streets under water" },
];

describe("command palette", () => {
  it("uses > for commands only and @ for nodes only", () => {
    expect(parsePaletteQuery("> save")).toEqual({ scope: "commands", query: "save" });
    expect(parsePaletteQuery("@rain")).toEqual({ scope: "nodes", query: "rain" });
    expect(parsePaletteQuery("flood")).toEqual({ scope: "all", query: "flood" });
    const commandsOnly = paletteResults(PALETTE_COMMANDS, nodes, ">save");
    expect(commandsOnly.every((hit) => hit.kind === "command")).toBe(true);
    expect(commandsOnly[0]?.label).toBe("Save");
    const nodesOnly = paletteResults(PALETTE_COMMANDS, nodes, "@rain");
    expect(nodesOnly).toEqual([{ kind: "node", id: "n-rain", label: "Heavy rain" }]);
    const mixed = paletteResults(PALETTE_COMMANDS, nodes, "flood");
    expect(mixed.some((hit) => hit.kind === "node" && hit.id === "n-flood")).toBe(true);
    expect(mixed.some((hit) => hit.kind === "command")).toBe(false);
  });
});
