import { compareOrder, isOrderKey, orderKeyAfter } from "../core/order";
import { normalizeTitle } from "../core/title";
import { RELATES_TO_ID, starterLinkTypes } from "../core/starter";
import { CURRENT_FORMAT } from "../core/types";
import {
  MAX_WAYPOINTS_PER_LINK,
  type Issue,
  type Link,
  type LinkType,
  type MapDocument,
  type MapNode,
  type Vec3,
} from "../core/types";

const PATTERNS = new Set(["solid", "dashed", "dotted"]);
const WIDTHS = new Set(["thin", "normal", "thick"]);
const DIRECTIONS = new Set(["directed", "bidirectional", "undirected"]);
const FILTERS = new Set(["shown", "dimmed", "hidden"]);
const COLOR = /^#[0-9A-Fa-f]{6}$/;

function warn(warnings: Issue[], code: string, message: string): void {
  warnings.push({ level: "warning", code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteVec(value: unknown): value is Vec3 {
  if (!isRecord(value)) return false;
  return ["x", "y", "z"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key] as number),
  );
}

/** Absolute path, or a relative path that escapes its folder with `..`. */
export function inspectResourcesFolder(folder: string): { absolute: boolean; escapes: boolean } {
  const absolute = folder.startsWith("/") || folder.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(folder);
  const segments = folder.split(/[\\/]+/).filter((part) => part.length > 0 && part !== ".");
  return { absolute, escapes: segments.includes("..") };
}

const MD_REF = /!\[[^\]]*\]\(([^)\s]+)\)|\[[^\]]*\]\(([^)\s]+)\)/g;

export function markdownResourcePaths(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(MD_REF)) {
    const path = match[1] ?? match[2];
    if (path && !/^[a-z]+:/i.test(path)) paths.push(path);
  }
  return paths;
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  let next = `${base}~${n}`;
  while (taken.has(next)) {
    n += 1;
    next = `${base}~${n}`;
  }
  return next;
}

function repairOrder(record: Record<string, { order?: unknown }>, warnings: Issue[], label: string): void {
  const valid: string[] = [];
  const missing: string[] = [];
  for (const [id, entry] of Object.entries(record)) {
    if (isOrderKey(entry.order)) valid.push(entry.order);
    else missing.push(id);
  }
  for (const id of missing) {
    const key = orderKeyAfter(valid);
    record[id].order = key;
    valid.push(key);
    warn(warnings, "order-repaired", `${label} "${id}" had no usable order key; assigned "${key}".`);
  }
}

function repairTitle(holder: { title?: unknown }, warnings: Issue[], label: string): void {
  if (holder.title == null) return;
  if (typeof holder.title !== "string") {
    delete holder.title;
    warn(warnings, "title-removed", `${label} title was not text and was removed.`);
    return;
  }
  const normalized = normalizeTitle(holder.title);
  if (normalized.length === 0) {
    delete holder.title;
    return;
  }
  if (normalized !== holder.title) {
    warn(warnings, "title-normalized", `${label} title was trimmed to a single line.`);
  }
  holder.title = normalized;
}

function repairVec(value: unknown, fallback: Vec3, warnings: Issue[], label: string): Vec3 {
  if (isFiniteVec(value)) return { x: value.x, y: value.y, z: value.z };
  warn(warnings, "position-reset", `${label} had a non-finite position and was reset to the origin.`);
  return { ...fallback };
}

/**
 * Mutates a loosely-shaped document into one that satisfies the integrity rules.
 * Called on load, before schema validation. Returns warnings; nothing here is fatal
 * unless the value is not an object at all.
 */
export function repairDocument(doc: MapDocument): Issue[] {
  const warnings: Issue[] = [];
  const raw = doc as MapDocument & Record<string, unknown>;
  raw.format = "mindmap3d";
  if (typeof raw.version !== "string" || !/^[0-9]+\.[0-9]+$/.test(raw.version)) {
    raw.version = CURRENT_FORMAT;
  }

  if (!isRecord(raw.linkTypes)) raw.linkTypes = {};
  if (!isRecord(raw.nodes)) raw.nodes = {};
  if (!isRecord(raw.links)) raw.links = {};

  if (Object.keys(raw.linkTypes).length === 0) {
    raw.linkTypes[RELATES_TO_ID] = starterLinkTypes()[RELATES_TO_ID];
    warn(warnings, "link-type-restored", 'The map had no link types. Restored "relates to".');
  }

  for (const [id, type] of Object.entries(raw.linkTypes)) {
    const entry = (isRecord(type) ? type : {}) as LinkType & Record<string, unknown>;
    raw.linkTypes[id] = entry;
    if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
      entry.name = "Untitled type";
      warn(warnings, "type-name", `Link type "${id}" had an empty name.`);
    } else {
      entry.name = entry.name.trim();
    }
    if (typeof entry.color !== "string" || !COLOR.test(entry.color)) {
      entry.color = "#999999";
      warn(warnings, "type-color", `Link type "${id}" had an invalid colour.`);
    }
    if (!PATTERNS.has(entry.pattern)) entry.pattern = "solid";
    if (!WIDTHS.has(entry.width)) entry.width = "normal";
    if (!DIRECTIONS.has(entry.direction)) entry.direction = "undirected";
    if (entry.icon != null) {
      if (typeof entry.icon !== "string" || entry.icon.length === 0) delete entry.icon;
      else if (entry.icon.length > 8) entry.icon = entry.icon.slice(0, 8);
    }
    if (entry.description != null && typeof entry.description !== "string") delete entry.description;
  }
  repairOrder(raw.linkTypes, warnings, "Link type");

  const taken = new Set(Object.keys(raw.linkTypes));
  const nodeIdMap = new Map<string, string>();
  const nextNodes: Record<string, MapNode> = {};
  for (const id of Object.keys(raw.nodes).sort()) {
    const source = raw.nodes[id];
    const node = (isRecord(source) ? { ...source } : { text: "", position: { x: 0, y: 0, z: 0 } }) as MapNode;
    let nextId = id;
    if (taken.has(id)) {
      nextId = uniqueId(id, taken);
      warn(warnings, "id-renamed", `Node id "${id}" collided with another id and was renamed to "${nextId}".`);
    }
    taken.add(nextId);
    nodeIdMap.set(id, nextId);
    if (typeof node.text !== "string") node.text = node.text == null ? "" : String(node.text);
    if (isFiniteVec(node.position)) {
      node.position = { ...node.position, x: node.position.x, y: node.position.y, z: node.position.z };
    } else {
      node.position = repairVec(node.position, { x: 0, y: 0, z: 0 }, warnings, `Node "${nextId}"`);
    }
    repairTitle(node, warnings, `Node "${nextId}"`);
    if (node.pinned !== true) delete node.pinned;
    if (node.style) {
      if (!isRecord(node.style)) {
        delete node.style;
      } else {
        if (node.style.color != null && (typeof node.style.color !== "string" || !COLOR.test(node.style.color))) {
          delete node.style.color;
        }
        if (node.style.size != null && (typeof node.style.size !== "number" || !Number.isFinite(node.style.size))) {
          delete node.style.size;
        }
        if (node.style.icon != null && typeof node.style.icon !== "string") delete node.style.icon;
        if (Object.keys(node.style).length === 0) delete node.style;
      }
    }
    nextNodes[nextId] = node;
  }
  raw.nodes = nextNodes;

  const reassigned = new Map<string, number>();
  const nextLinks: Record<string, Link> = {};
  for (const id of Object.keys(raw.links).sort()) {
    const source = raw.links[id];
    if (!isRecord(source)) {
      warn(warnings, "link-dropped", `Link "${id}" was not an object and was dropped.`);
      continue;
    }
    const link = { ...source } as Link;
    link.source = nodeIdMap.get(String(link.source)) ?? String(link.source ?? "");
    link.target = nodeIdMap.get(String(link.target)) ?? String(link.target ?? "");
    if (!raw.nodes[link.source] || !raw.nodes[link.target]) {
      warn(
        warnings,
        "link-dropped",
        `Link "${id}" pointed at a missing node and was dropped.`,
      );
      continue;
    }
    let nextId = id;
    if (taken.has(id)) {
      nextId = uniqueId(id, taken);
      warn(warnings, "id-renamed", `Link id "${id}" collided with another id and was renamed to "${nextId}".`);
    }
    taken.add(nextId);
    const missingType =
      typeof link.typeId !== "string" || link.typeId.length === 0
        ? "(blank)"
        : raw.linkTypes[link.typeId]
          ? null
          : link.typeId;
    if (missingType !== null) {
      if (!raw.linkTypes[RELATES_TO_ID]) {
        raw.linkTypes[RELATES_TO_ID] = starterLinkTypes()[RELATES_TO_ID];
        warn(warnings, "link-type-restored", 'Restored "relates to" for links whose type was missing.');
      }
      link.typeId = RELATES_TO_ID;
      reassigned.set(missingType, (reassigned.get(missingType) ?? 0) + 1);
    }
    if (typeof link.text !== "string") link.text = link.text == null ? "" : String(link.text);
    repairTitle(link, warnings, `Link "${nextId}"`);
    if (link.waypoints != null) {
      if (!isRecord(link.waypoints)) {
        delete link.waypoints;
        warn(warnings, "waypoints-dropped", `Link "${nextId}" had malformed waypoints.`);
      } else {
        const kept: Record<string, { order: string; position: Vec3 }> = {};
        for (const [wpId, wp] of Object.entries(link.waypoints)) {
          if (!isRecord(wp) || !isFiniteVec(wp.position)) {
            warn(warnings, "waypoint-dropped", `Waypoint "${wpId}" on link "${nextId}" was dropped.`);
            continue;
          }
          kept[wpId] = {
            ...wp,
            order: isOrderKey(wp.order) ? wp.order : "",
            position: { ...wp.position, x: wp.position.x, y: wp.position.y, z: wp.position.z },
          };
        }
        repairOrder(kept, warnings, `Waypoint on "${nextId}"`);
        const sorted = Object.entries(kept).sort((a, b) => compareOrder(a[1].order, a[0], b[1].order, b[0]));
        if (sorted.length > MAX_WAYPOINTS_PER_LINK) {
          warn(
            warnings,
            "waypoints-capped",
            `Link "${nextId}" had ${sorted.length} waypoints; kept the first ${MAX_WAYPOINTS_PER_LINK}.`,
          );
        }
        const capped = sorted.slice(0, MAX_WAYPOINTS_PER_LINK);
        link.waypoints = Object.fromEntries(capped);
        if (capped.length === 0) delete link.waypoints;
      }
    }
    if (link.style != null) {
      if (!isRecord(link.style)) {
        delete link.style;
      } else {
        if (typeof link.style.bow !== "number" || !Number.isFinite(link.style.bow)) delete link.style.bow;
        if (
          typeof link.style.labelSegment !== "number" ||
          !Number.isInteger(link.style.labelSegment) ||
          link.style.labelSegment < 0
        ) {
          delete link.style.labelSegment;
        }
        if (Object.keys(link.style).length === 0) delete link.style;
      }
    }
    nextLinks[nextId] = link;
  }
  raw.links = nextLinks;

  for (const id of [...reassigned.keys()].sort()) {
    const count = reassigned.get(id) ?? 0;
    const noun = count === 1 ? "1 link" : `${count} links`;
    warn(
      warnings,
      "type-reassigned",
      `${noun} pointing at missing type "${id}" ${count === 1 ? "was" : "were"} moved to "relates to".`,
    );
  }

  if (!isRecord(raw.settings)) raw.settings = {};
  const settings = raw.settings;
  if (
    typeof settings.defaultLinkTypeId !== "string" ||
    !raw.linkTypes[settings.defaultLinkTypeId]
  ) {
    const fallback = raw.linkTypes[RELATES_TO_ID]
      ? RELATES_TO_ID
      : Object.entries(raw.linkTypes).sort((a, b) => compareOrder(a[1].order, a[0], b[1].order, b[0]))[0][0];
    settings.defaultLinkTypeId = fallback;
    warn(warnings, "default-type", `Default link type was missing. Using "${fallback}".`);
  }
  if (settings.resourcesFolder != null) {
    if (typeof settings.resourcesFolder !== "string" || settings.resourcesFolder.trim().length === 0) {
      delete settings.resourcesFolder;
    } else {
      const inspected = inspectResourcesFolder(settings.resourcesFolder);
      if (inspected.escapes) {
        warn(
          warnings,
          "resources-folder",
          `resourcesFolder "${settings.resourcesFolder}" escapes its directory and was removed.`,
        );
        delete settings.resourcesFolder;
      } else if (inspected.absolute) {
        warn(
          warnings,
          "resources-folder-absolute",
          `resourcesFolder "${settings.resourcesFolder}" is an absolute path and will not travel with the map.`,
        );
      }
    }
  }

  const names = new Map<string, string>();
  for (const [id, type] of Object.entries(raw.linkTypes)) {
    const previous = names.get(type.name);
    if (previous) {
      warn(warnings, "duplicate-type-name", `Link types "${previous}" and "${id}" share the name "${type.name}".`);
    } else {
      names.set(type.name, id);
    }
  }

  for (const node of Object.values(raw.nodes)) {
    for (const path of markdownResourcePaths(node.text)) {
      if (inspectResourcesFolder(path).escapes) {
        warn(warnings, "resource-path", `A Markdown reference escapes the resources folder: ${path}`);
      }
    }
  }
  for (const link of Object.values(raw.links)) {
    for (const path of markdownResourcePaths(link.text ?? "")) {
      if (inspectResourcesFolder(path).escapes) {
        warn(warnings, "resource-path", `A Markdown reference escapes the resources folder: ${path}`);
      }
    }
  }

  if (isRecord(raw.view) && isRecord(raw.view.linkTypeFilters)) {
    for (const [id, filter] of Object.entries(raw.view.linkTypeFilters)) {
      if (!FILTERS.has(String(filter))) delete raw.view.linkTypeFilters[id];
    }
  }

  return warnings;
}

/** Strict checks used after every command. Warnings are not returned; callers repair only on load. */
export function checkInvariants(doc: MapDocument): Issue[] {
  const errors: Issue[] = [];
  const fail = (code: string, message: string) => errors.push({ level: "error", code, message });

  if (doc.format !== "mindmap3d") fail("format", "format must be mindmap3d");
  if (typeof doc.version !== "string" || !/^[0-9]+\.[0-9]+$/.test(doc.version)) {
    fail("version", 'version must be "MAJOR.MINOR"');
  }
  const typeIds = Object.keys(doc.linkTypes);
  if (typeIds.length === 0) fail("link-types", "A map needs at least one link type");

  const ids = new Set<string>();
  for (const id of typeIds) {
    if (ids.has(id)) fail("id", `Duplicate id ${id}`);
    ids.add(id);
    const type = doc.linkTypes[id];
    if (!isOrderKey(type.order)) fail("order", `Link type ${id} has an invalid order key`);
    if (!type.name?.trim()) fail("type-name", `Link type ${id} needs a name`);
  }
  for (const id of Object.keys(doc.nodes)) {
    if (ids.has(id)) fail("id", `Duplicate id ${id}`);
    ids.add(id);
    const node = doc.nodes[id];
    if (typeof node.text !== "string") fail("text", `Node ${id} text must be a string`);
    if (!isFiniteVec(node.position)) fail("position", `Node ${id} position must be finite`);
    if (node.title != null && (node.title !== normalizeTitle(node.title) || node.title.length === 0)) {
      fail("title", `Node ${id} title is not normalised`);
    }
  }
  for (const id of Object.keys(doc.links)) {
    if (ids.has(id)) fail("id", `Duplicate id ${id}`);
    ids.add(id);
    const link = doc.links[id];
    if (!doc.nodes[link.source] || !doc.nodes[link.target]) fail("link-end", `Link ${id} points at a missing node`);
    if (!doc.linkTypes[link.typeId]) fail("link-type", `Link ${id} points at a missing type`);
    if (link.title != null && (link.title !== normalizeTitle(link.title) || link.title.length === 0)) {
      fail("title", `Link ${id} title is not normalised`);
    }
    if (link.waypoints) {
      const count = Object.keys(link.waypoints).length;
      if (count > MAX_WAYPOINTS_PER_LINK) fail("waypoints", `Link ${id} has more than ${MAX_WAYPOINTS_PER_LINK} waypoints`);
      const seen = new Set<string>();
      for (const [wpId, wp] of Object.entries(link.waypoints)) {
        if (seen.has(wpId)) fail("waypoint-id", `Duplicate waypoint ${wpId}`);
        seen.add(wpId);
        if (!isOrderKey(wp.order)) fail("order", `Waypoint ${wpId} has an invalid order key`);
        if (!isFiniteVec(wp.position)) fail("position", `Waypoint ${wpId} position must be finite`);
      }
    }
  }
  const fallback = doc.settings?.defaultLinkTypeId;
  if (!fallback || !doc.linkTypes[fallback]) fail("default-type", "defaultLinkTypeId must point at a link type");
  if (doc.settings?.resourcesFolder && inspectResourcesFolder(doc.settings.resourcesFolder).escapes) {
    fail("resources-folder", "resourcesFolder must not contain ..");
  }
  return errors;
}
