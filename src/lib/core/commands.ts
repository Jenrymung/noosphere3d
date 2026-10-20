import { generateNKeysBetween } from "fractional-indexing";
import type { Draft } from "immer";
import { isOrderKey } from "./order";
import { normalizeTitle } from "./title";
import {
  MAX_WAYPOINTS_PER_LINK,
  type Link,
  type LinkType,
  type MapDocument,
  type MapNode,
  type Vec3,
  type Waypoint,
} from "./types";
import { sortedWaypoints } from "./graph";

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

export type Command =
  | { type: "addNode"; id: string; node: MapNode }
  | { type: "editText"; target: "node" | "link"; id: string; text: string }
  | { type: "setTitle"; target: "node" | "link"; id: string; title: string | null }
  | { type: "moveNodes"; moves: { id: string; position: Vec3 }[] }
  | { type: "deleteNodes"; ids: string[] }
  | { type: "deleteLinks"; ids: string[] }
  | { type: "addLink"; id: string; link: Link }
  | { type: "setLinkType"; linkId: string; typeId: string }
  | { type: "reverseLink"; linkId: string }
  | { type: "addLinkType"; id: string; linkType: LinkType }
  | { type: "updateLinkType"; id: string; patch: Partial<Omit<LinkType, "order">> }
  | { type: "reorderLinkType"; id: string; order: string }
  | { type: "deleteLinkType"; id: string; reassignTo: string }
  | { type: "setDefaultLinkType"; typeId: string }
  | { type: "addWaypoint"; linkId: string; waypointId: string; waypoint: Waypoint }
  | { type: "moveWaypoint"; linkId: string; waypointId: string; position: Vec3 }
  | { type: "deleteWaypoint"; linkId: string; waypointId: string }
  | { type: "reorderWaypoint"; linkId: string; waypointId: string; order: string }
  | { type: "clearWaypoints"; linkId: string }
  | {
      type: "moveSelection";
      nodes: { id: string; position: Vec3 }[];
      waypoints: { linkId: string; waypointId: string; position: Vec3 }[];
    };

const COLOR = /^#[0-9A-Fa-f]{6}$/;

function assertFinite(position: Vec3, label: string): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    throw new CommandError(`${label} position must be finite`);
  }
}

function assertIdFree(doc: MapDocument, id: string): void {
  if (!id) throw new CommandError("Id is required");
  if (doc.nodes[id] || doc.links[id] || doc.linkTypes[id]) {
    throw new CommandError(`Id "${id}" is already used`);
  }
}

function cloneNode(node: MapNode): MapNode {
  assertFinite(node.position, "Node");
  if (typeof node.text !== "string") throw new CommandError("Node text must be a string");
  const copy: MapNode = { text: node.text, position: { ...node.position } };
  if (node.title != null) {
    const title = normalizeTitle(node.title);
    if (title) copy.title = title;
  }
  if (node.pinned) copy.pinned = true;
  if (node.style) {
    const style = { ...node.style };
    if (style.color && !COLOR.test(style.color)) throw new CommandError("Node colour must be #RRGGBB");
    copy.style = style;
  }
  return copy;
}

function applyTitle(holder: { title?: string }, title: string | null): void {
  if (title == null) {
    delete holder.title;
    return;
  }
  const normalized = normalizeTitle(title);
  if (!normalized) delete holder.title;
  else holder.title = normalized;
}

function requireLink(doc: Draft<MapDocument>, id: string): Draft<Link> {
  const link = doc.links[id];
  if (!link) throw new CommandError(`Unknown link "${id}"`);
  return link;
}

export function applyCommand(draft: Draft<MapDocument>, command: Command): void {
  switch (command.type) {
    case "addNode": {
      assertIdFree(draft, command.id);
      draft.nodes[command.id] = cloneNode(command.node);
      return;
    }
    case "editText": {
      if (command.target === "node") {
        const node = draft.nodes[command.id];
        if (!node) throw new CommandError(`Unknown node "${command.id}"`);
        node.text = command.text;
      } else {
        const link = requireLink(draft, command.id);
        link.text = command.text;
      }
      return;
    }
    case "setTitle": {
      if (command.target === "node") {
        const node = draft.nodes[command.id];
        if (!node) throw new CommandError(`Unknown node "${command.id}"`);
        applyTitle(node, command.title);
      } else {
        applyTitle(requireLink(draft, command.id), command.title);
      }
      return;
    }
    case "moveNodes": {
      for (const move of command.moves) {
        const node = draft.nodes[move.id];
        if (!node) throw new CommandError(`Unknown node "${move.id}"`);
        assertFinite(move.position, "Node");
        node.position = { ...move.position };
      }
      return;
    }
    case "deleteNodes": {
      const ids = new Set(command.ids);
      for (const id of ids) delete draft.nodes[id];
      for (const [linkId, link] of Object.entries(draft.links)) {
        if (ids.has(link.source) || ids.has(link.target)) delete draft.links[linkId];
      }
      return;
    }
    case "deleteLinks": {
      for (const id of command.ids) delete draft.links[id];
      return;
    }
    case "addLink": {
      assertIdFree(draft, command.id);
      const link = command.link;
      if (!draft.nodes[link.source] || !draft.nodes[link.target]) {
        throw new CommandError("Link ends must be existing nodes");
      }
      if (!draft.linkTypes[link.typeId]) throw new CommandError(`Unknown link type "${link.typeId}"`);
      const copy: Link = {
        source: link.source,
        target: link.target,
        typeId: link.typeId,
        text: link.text ?? "",
      };
      if (link.title != null) {
        const title = normalizeTitle(link.title);
        if (title) copy.title = title;
      }
      if (link.waypoints && Object.keys(link.waypoints).length > 0) {
        if (Object.keys(link.waypoints).length > MAX_WAYPOINTS_PER_LINK) {
          throw new CommandError(`A link can have at most ${MAX_WAYPOINTS_PER_LINK} waypoints`);
        }
        copy.waypoints = {};
        for (const [wpId, wp] of Object.entries(link.waypoints)) {
          if (!isOrderKey(wp.order)) throw new CommandError("Waypoint order key is invalid");
          assertFinite(wp.position, "Waypoint");
          copy.waypoints[wpId] = { order: wp.order, position: { ...wp.position } };
        }
      }
      if (link.style) copy.style = { ...link.style };
      draft.links[command.id] = copy;
      return;
    }
    case "setLinkType": {
      const link = requireLink(draft, command.linkId);
      if (!draft.linkTypes[command.typeId]) throw new CommandError(`Unknown link type "${command.typeId}"`);
      link.typeId = command.typeId;
      return;
    }
    case "reverseLink": {
      const link = requireLink(draft, command.linkId);
      const source = link.source;
      link.source = link.target;
      link.target = source;
      if (link.waypoints && Object.keys(link.waypoints).length > 1) {
        const entries = sortedWaypoints(link);
        const keys = generateNKeysBetween(null, null, entries.length);
        entries.forEach((entry, index) => {
          link.waypoints![entry.id].order = keys[entries.length - 1 - index];
        });
      }
      return;
    }
    case "addLinkType": {
      assertIdFree(draft, command.id);
      const type = command.linkType;
      if (!type.name?.trim()) throw new CommandError("Link type needs a name");
      if (!COLOR.test(type.color)) throw new CommandError("Link type colour must be #RRGGBB");
      if (!isOrderKey(type.order)) throw new CommandError("Link type order key is invalid");
      draft.linkTypes[command.id] = {
        order: type.order,
        name: type.name.trim(),
        color: type.color,
        pattern: type.pattern,
        width: type.width,
        direction: type.direction,
        ...(type.icon ? { icon: type.icon.slice(0, 8) } : {}),
        ...(type.description ? { description: type.description } : {}),
      };
      return;
    }
    case "updateLinkType": {
      const type = draft.linkTypes[command.id];
      if (!type) throw new CommandError(`Unknown link type "${command.id}"`);
      const patch = command.patch;
      if (patch.name != null) {
        if (!patch.name.trim()) throw new CommandError("Link type needs a name");
        type.name = patch.name.trim();
      }
      if (patch.color != null) {
        if (!COLOR.test(patch.color)) throw new CommandError("Link type colour must be #RRGGBB");
        type.color = patch.color;
      }
      if (patch.pattern != null) type.pattern = patch.pattern;
      if (patch.width != null) type.width = patch.width;
      if (patch.direction != null) type.direction = patch.direction;
      if (patch.icon !== undefined) {
        if (!patch.icon) delete type.icon;
        else type.icon = patch.icon.slice(0, 8);
      }
      if (patch.description !== undefined) {
        if (!patch.description) delete type.description;
        else type.description = patch.description;
      }
      return;
    }
    case "reorderLinkType": {
      const type = draft.linkTypes[command.id];
      if (!type) throw new CommandError(`Unknown link type "${command.id}"`);
      if (!isOrderKey(command.order)) throw new CommandError("Link type order key is invalid");
      type.order = command.order;
      return;
    }
    case "setDefaultLinkType": {
      if (!draft.linkTypes[command.typeId]) throw new CommandError(`Unknown link type "${command.typeId}"`);
      if (!draft.settings) draft.settings = {};
      draft.settings.defaultLinkTypeId = command.typeId;
      return;
    }
    case "deleteLinkType": {
      if (!draft.linkTypes[command.id]) throw new CommandError(`Unknown link type "${command.id}"`);
      if (Object.keys(draft.linkTypes).length < 2) throw new CommandError("A map must keep at least one link type");
      if (command.id === command.reassignTo) throw new CommandError("Reassign the links to a different type");
      if (!draft.linkTypes[command.reassignTo]) throw new CommandError(`Unknown link type "${command.reassignTo}"`);
      for (const link of Object.values(draft.links)) {
        if (link.typeId === command.id) link.typeId = command.reassignTo;
      }
      delete draft.linkTypes[command.id];
      if (!draft.settings) draft.settings = {};
      if (draft.settings.defaultLinkTypeId === command.id) draft.settings.defaultLinkTypeId = command.reassignTo;
      return;
    }
    case "addWaypoint": {
      const link = requireLink(draft, command.linkId);
      if (!isOrderKey(command.waypoint.order)) throw new CommandError("Waypoint order key is invalid");
      assertFinite(command.waypoint.position, "Waypoint");
      if (!link.waypoints) link.waypoints = {};
      if (link.waypoints[command.waypointId]) throw new CommandError(`Waypoint "${command.waypointId}" already exists`);
      if (Object.keys(link.waypoints).length >= MAX_WAYPOINTS_PER_LINK) {
        throw new CommandError(`A link can have at most ${MAX_WAYPOINTS_PER_LINK} waypoints`);
      }
      link.waypoints[command.waypointId] = {
        order: command.waypoint.order,
        position: { ...command.waypoint.position },
      };
      return;
    }
    case "moveWaypoint": {
      const link = requireLink(draft, command.linkId);
      const waypoint = link.waypoints?.[command.waypointId];
      if (!waypoint) throw new CommandError(`Unknown waypoint "${command.waypointId}"`);
      assertFinite(command.position, "Waypoint");
      waypoint.position = { ...command.position };
      return;
    }
    case "deleteWaypoint": {
      const link = requireLink(draft, command.linkId);
      if (!link.waypoints?.[command.waypointId]) throw new CommandError(`Unknown waypoint "${command.waypointId}"`);
      delete link.waypoints[command.waypointId];
      if (Object.keys(link.waypoints).length === 0) delete link.waypoints;
      return;
    }
    case "reorderWaypoint": {
      const link = requireLink(draft, command.linkId);
      const waypoint = link.waypoints?.[command.waypointId];
      if (!waypoint) throw new CommandError(`Unknown waypoint "${command.waypointId}"`);
      if (!isOrderKey(command.order)) throw new CommandError("Waypoint order key is invalid");
      waypoint.order = command.order;
      return;
    }
    case "clearWaypoints": {
      const link = requireLink(draft, command.linkId);
      delete link.waypoints;
      return;
    }
    case "moveSelection": {
      for (const move of command.nodes) {
        const node = draft.nodes[move.id];
        if (!node) throw new CommandError(`Unknown node "${move.id}"`);
        assertFinite(move.position, "Node");
        node.position = { ...move.position };
      }
      for (const move of command.waypoints) {
        const waypoint = draft.links[move.linkId]?.waypoints?.[move.waypointId];
        if (!waypoint) throw new CommandError(`Unknown waypoint "${move.waypointId}"`);
        assertFinite(move.position, "Waypoint");
        waypoint.position = { ...move.position };
      }
      return;
    }
    default: {
      const unreachable: never = command;
      throw new CommandError(`Unknown command ${(unreachable as Command).type}`);
    }
  }
}
