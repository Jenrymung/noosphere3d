import { describe, expect, it } from "vitest";
import { bindingById, helpSections, KEYMAP, matchesChord, reservedConflicts, type KeyLike } from "./keymap";

function key(partial: Partial<KeyLike> & Pick<KeyLike, "key" | "code">): KeyLike {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...partial };
}

describe("keymap", () => {
  it("avoids OS-reserved chords and keeps Ctrl+Tab", () => {
    expect(reservedConflicts(KEYMAP)).toEqual([]);
    const tabs = bindingById("tab-next");
    expect(tabs.chords.some((chord) => chord.ctrl && chord.code === "Tab" && !chord.mod)).toBe(true);
    expect(KEYMAP.some((binding) => binding.chords.some((chord) => chord.mod && chord.code === "Tab"))).toBe(false);
  });

  it("matches symbols on event.key and letters and digits on event.code", () => {
    const palette = bindingById("palette");
    const slash = palette.chords.find((chord) => chord.key === "/");
    const modK = palette.chords.find((chord) => chord.code === "KeyK");
    expect(slash && matchesChord(slash, key({ key: "/", code: "Digit7", shiftKey: true }))).toBe(true);
    expect(modK && matchesChord(modK, key({ key: "k", code: "KeyK", ctrlKey: true }))).toBe(true);
    expect(modK && matchesChord(modK, key({ key: "k", code: "KeyK", metaKey: true }))).toBe(true);
    const help = bindingById("help").chords[0];
    expect(matchesChord(help, key({ key: "?", code: "Slash", shiftKey: true }))).toBe(true);
    const edit = bindingById("edit").chords[0];
    expect(matchesChord(edit, key({ key: "e", code: "KeyE" }))).toBe(true);
    expect(matchesChord(edit, key({ key: "ε", code: "KeyE" }))).toBe(true);
    const altOne = bindingById("filter-digits").chords.find((chord) => chord.code === "Digit1");
    expect(altOne && matchesChord(altOne, key({ key: "¡", code: "Digit1", altKey: true }))).toBe(true);
    expect(altOne && matchesChord(altOne, key({ key: "1", code: "Digit1", altKey: false }))).toBe(false);
  });

  it("builds the cheat sheet from the keymap and leaves dev toggles out", () => {
    const sections = helpSections();
    const flat = sections.flatMap((section) => section.rows.map((row) => row.keys));
    expect(flat).toContain("/ or Mod+K");
    expect(flat).toContain("?");
    expect(flat.some((keys) => keys.includes("`"))).toBe(false);
    expect(sections.some((section) => section.title === "Dev")).toBe(false);
    expect(bindingById("palette").chords).toHaveLength(2);
  });
});
