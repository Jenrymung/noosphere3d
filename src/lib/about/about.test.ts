import { describe, expect, it } from "vitest";
import { APP_VERSION, LICENCE_STATUS, THIRD_PARTY_NOTICES } from "./notices";
import { RELEASES_PAGE_URL } from "./releases";
import { formatErrorLine } from "../io/errorLog";

describe("about and updates", () => {
  it("states the MIT licence and lists third-party notices", () => {
    expect(APP_VERSION).toBe("0.1.0");
    expect(LICENCE_STATUS).toBe("Noosphere 3D is released under the MIT licence. The terms are in LICENSE.");
    expect(THIRD_PARTY_NOTICES.some((item) => item.name === "DOMPurify" && item.licence.includes("Apache-2.0"))).toBe(true);
    expect(THIRD_PARTY_NOTICES.some((item) => item.name === "Three.js")).toBe(true);
    expect(THIRD_PARTY_NOTICES.some((item) => item.name === "Tauri" && item.licence === "MIT OR Apache-2.0")).toBe(true);
  });

  it("points Check for updates at a placeholder releases page", () => {
    expect(RELEASES_PAGE_URL).toBe("https://github.com/noosphere3d/noosphere3d/releases");
    expect(RELEASES_PAGE_URL.endsWith("/releases")).toBe(true);
  });
});

describe("error log lines", () => {
  it("writes one flat local line", () => {
    const line = formatErrorLine("error", "disk full\nretry", new Date("2026-10-20T20:06:00.000Z"));
    expect(line).toBe("2026-10-20T20:06:00.000Z error disk full retry");
    expect(line.includes("\n")).toBe(false);
  });
});
