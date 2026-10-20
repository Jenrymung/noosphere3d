export interface ThirdPartyNotice {
  name: string;
  licence: string;
  note: string;
}

/** Notices shown in About. A release build can replace this list; the app does not download it. */
export const THIRD_PARTY_NOTICES: ThirdPartyNotice[] = [
  { name: "Tauri", licence: "MIT OR Apache-2.0", note: "Desktop shell" },
  { name: "Svelte", licence: "MIT", note: "Interface" },
  { name: "Vite", licence: "MIT", note: "Build" },
  { name: "Three.js", licence: "MIT", note: "3D scene" },
  { name: "troika-three-text", licence: "MIT", note: "SDF titles" },
  { name: "CodeMirror", licence: "MIT", note: "Markdown editor" },
  { name: "markdown-it", licence: "MIT", note: "Reader" },
  { name: "DOMPurify", licence: "MPL-2.0 OR Apache-2.0", note: "HTML sanitizer" },
  { name: "Immer", licence: "MIT", note: "Undo patches" },
  { name: "Valibot", licence: "MIT", note: "File validation" },
  { name: "fractional-indexing", licence: "MIT", note: "Order keys" },
  { name: "ulid", licence: "MIT", note: "Identifiers" },
  { name: "Source Sans 3", licence: "OFL-1.1", note: "Interface and title font" },
];

export const APP_VERSION = "0.1.0";

export const LICENCE_STATUS =
  "LICENSE-MIT and LICENSE-APACHE are in the repository (MIT OR Apache-2.0). Confirmation of that licence is still pending.";
