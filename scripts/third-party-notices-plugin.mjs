import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICES_PLACEHOLDER } from "./notices-placeholder.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const noticesPath = join(root, "THIRD-PARTY-NOTICES.md");

export function readThirdPartyNotices() {
  try {
    if (!existsSync(noticesPath)) return NOTICES_PLACEHOLDER;
    const text = readFileSync(noticesPath, "utf8");
    return text.trim() ? text : NOTICES_PLACEHOLDER;
  } catch {
    return NOTICES_PLACEHOLDER;
  }
}

/** Embeds THIRD-PARTY-NOTICES.md in the frontend bundle. A missing file becomes the dev placeholder. */
export function thirdPartyNoticesPlugin() {
  const virtual = "virtual:third-party-notices";
  const resolved = `\0${virtual}`;
  return {
    name: "third-party-notices",
    /** @param {string} id */
    resolveId(id) {
      if (id === virtual) return resolved;
    },
    /** @param {string} id */
    load(id) {
      if (id !== resolved) return null;
      const text = readThirdPartyNotices();
      return `export const EMBEDDED_THIRD_PARTY_NOTICES = ${JSON.stringify(text)};\n`;
    },
  };
}
