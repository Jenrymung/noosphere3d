import { ulid } from "ulid";
import { starterLinkTypes } from "./starter";
import { APP_VERSION, FORMAT, CURRENT_FORMAT, type MapDocument } from "./types";

export function createId(): string {
  return ulid();
}

export interface CreateMapOptions {
  id?: string;
  title?: string;
  now?: string;
}

/** A new map: starter link types, no nodes yet. One session per document. */
export function createEmptyMap(options?: CreateMapOptions): MapDocument {
  const now = options?.now ?? new Date().toISOString();
  return {
    format: FORMAT,
    version: CURRENT_FORMAT,
    id: options?.id ?? createId(),
    meta: {
      title: options?.title ?? "Untitled map",
      createdAt: now,
      modifiedAt: now,
      appVersion: APP_VERSION,
    },
    settings: { defaultLinkTypeId: "relates-to" },
    linkTypes: starterLinkTypes(),
    nodes: {},
    links: {},
    extensions: {},
  };
}
