import { starterLinkTypes } from "../core/starter";
import { APP_VERSION, CURRENT_VERSION, type MapDocument } from "../core/types";
import { MapLoadError } from "./schema";

export interface Migration {
  from: number;
  to: number;
  name: string;
  migrate: (doc: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Dummy v0 format: nodes and links were arrays, positions were flat x/y/z,
 * and there was no link-type registry. This exists to prove the migration
 * pipeline; no released file used it.
 */
export function migrate0to1(input: unknown): unknown {
  if (!isRecord(input)) throw new MapLoadError("v0 map was not an object");
  const nodesIn = Array.isArray(input.nodes) ? input.nodes : [];
  const linksIn = Array.isArray(input.links) ? input.links : [];
  const nodes: MapDocument["nodes"] = {};
  const links: MapDocument["links"] = {};
  nodesIn.forEach((item, index) => {
    if (!isRecord(item)) return;
    const id = typeof item.id === "string" && item.id.length > 0 ? item.id : `n${index + 1}`;
    const node: MapDocument["nodes"][string] = {
      text: typeof item.text === "string" ? item.text : "",
      position: {
        x: typeof item.x === "number" ? item.x : 0,
        y: typeof item.y === "number" ? item.y : 0,
        z: typeof item.z === "number" ? item.z : 0,
      },
    };
    if (typeof item.title === "string") node.title = item.title;
    if (item.pinned === true) node.pinned = true;
    nodes[id] = node;
  });
  linksIn.forEach((item, index) => {
    if (!isRecord(item)) return;
    const id = typeof item.id === "string" && item.id.length > 0 ? item.id : `l${index + 1}`;
    links[id] = {
      source: String(item.source ?? ""),
      target: String(item.target ?? ""),
      typeId: "relates-to",
      text: typeof item.text === "string" ? item.text : "",
      ...(typeof item.title === "string" ? { title: item.title } : {}),
    };
  });
  const now = new Date().toISOString();
  const title = typeof input.title === "string" ? input.title : "Untitled map";
  return {
    format: "mindmap3d",
    version: 1,
    meta: {
      title,
      createdAt: now,
      modifiedAt: now,
      appVersion: APP_VERSION,
    },
    settings: { defaultLinkTypeId: "relates-to" },
    linkTypes: starterLinkTypes(),
    nodes,
    links,
    extensions: {},
  };
}

export const MIGRATIONS: Migration[] = [
  { from: 0, to: 1, name: "v0-arrays-to-v1-records", migrate: migrate0to1 },
];

export interface MigrationTrace {
  from: number;
  applied: string[];
  /** True when the file's major version is newer than this app. Do not open or write it. */
  newerMajor: boolean;
  value: unknown;
}

function minorVersion(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MapLoadError("Map minor version must be a non-negative integer");
  }
  return value;
}

export function migrateToCurrent(input: unknown): MigrationTrace {
  if (!isRecord(input)) throw new MapLoadError("Map file must be a JSON object");
  if (input.format !== "mindmap3d") throw new MapLoadError('Not a mindmap3d file (missing format "mindmap3d")');
  if (typeof input.version !== "number" || !Number.isInteger(input.version)) {
    throw new MapLoadError("Map file is missing an integer version");
  }
  if (input.version > CURRENT_VERSION) {
    return { from: input.version, applied: [], newerMajor: true, value: input };
  }
  // A newer minor is not a migration. Load opens the file, and save writes unknown fields back.
  minorVersion(input.minor);
  let value: unknown = input;
  let version = input.version;
  const applied: string[] = [];
  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS.find((migration) => migration.from === version);
    if (!step) throw new MapLoadError(`No migration from format version ${version}`);
    value = step.migrate(value);
    applied.push(step.name);
    version = step.to;
    if (!isRecord(value) || value.version !== version) {
      throw new MapLoadError(`Migration ${step.name} did not produce version ${version}`);
    }
  }
  return { from: input.version, applied, newerMajor: false, value };
}
