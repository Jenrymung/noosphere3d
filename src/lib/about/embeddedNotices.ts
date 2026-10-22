import { EMBEDDED_THIRD_PARTY_NOTICES } from "virtual:third-party-notices";

export { EMBEDDED_THIRD_PARTY_NOTICES };

export const NOTICES_BUTTON_LABEL = "View all licences";
export const NOTICES_DOCUMENT_TITLE = "Third-party notices";
/** Named in the selection neighbourhood tree while the Reader is showing the inventory. */
export const NOTICES_TREE_LABEL = "Third-party notices, open in the Reader";

const PLACEHOLDER_MARK = "generated at build time";

/** True when the text is the generated npm and Rust inventory, not the dev placeholder. */
export function noticesAreGeneratedInventory(text: string): boolean {
  return (
    text.includes("## npm production dependencies (") &&
    text.includes("## Rust crates (") &&
    !text.includes(PLACEHOLDER_MARK)
  );
}
