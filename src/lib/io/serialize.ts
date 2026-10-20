import { compareOrder } from "../core/order";
import type { MapDocument } from "../core/types";

const TOP_KEYS = [
  "format",
  "version",
  "id",
  "meta",
  "settings",
  "view",
  "linkTypes",
  "nodes",
  "links",
  "extensions",
] as const;

function ordered(value: Record<string, unknown>, keyOrder: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keyOrder) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  for (const key of Object.keys(value).sort()) {
    if (out[key] === undefined && value[key] !== undefined) out[key] = value[key];
  }
  return out;
}

function vec(value: { x: number; y: number; z: number }): Record<string, number> {
  return { x: value.x, y: value.y, z: value.z };
}

function sortEntries<T extends { order: string }>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort((a, b) => compareOrder(a[1].order, a[0], b[1].order, b[0]));
}

/**
 * Git-friendly JSON. Object keys are written in a fixed order: nodes and links
 * by id, link types and waypoints by order then id. Optional defaults are omitted.
 */
export function toCanonical(doc: MapDocument): Record<string, unknown> {
  const linkTypes: Record<string, unknown> = {};
  for (const [id, type] of sortEntries(doc.linkTypes)) {
    linkTypes[id] = ordered(
      {
        order: type.order,
        name: type.name,
        color: type.color,
        pattern: type.pattern,
        width: type.width,
        direction: type.direction,
        icon: type.icon,
        description: type.description,
      },
      ["order", "name", "color", "pattern", "width", "direction", "icon", "description"],
    );
  }

  const nodes: Record<string, unknown> = {};
  for (const id of Object.keys(doc.nodes).sort()) {
    const node = doc.nodes[id];
    const style = node.style
      ? ordered(
          { color: node.style.color, size: node.style.size, icon: node.style.icon },
          ["color", "size", "icon"],
        )
      : undefined;
    nodes[id] = ordered(
      {
        title: node.title,
        text: node.text,
        position: vec(node.position),
        style: style && Object.keys(style).length > 0 ? style : undefined,
        pinned: node.pinned ? true : undefined,
      },
      ["title", "text", "position", "style", "pinned"],
    );
  }

  const links: Record<string, unknown> = {};
  for (const id of Object.keys(doc.links).sort()) {
    const link = doc.links[id];
    let waypoints: Record<string, unknown> | undefined;
    if (link.waypoints && Object.keys(link.waypoints).length > 0) {
      waypoints = {};
      for (const [wpId, wp] of sortEntries(link.waypoints)) {
        waypoints[wpId] = { order: wp.order, position: vec(wp.position) };
      }
    }
    const style = link.style
      ? ordered({ bow: link.style.bow, labelSegment: link.style.labelSegment }, ["bow", "labelSegment"])
      : undefined;
    links[id] = ordered(
      {
        source: link.source,
        target: link.target,
        typeId: link.typeId,
        title: link.title,
        text: link.text ?? "",
        waypoints,
        style: style && Object.keys(style).length > 0 ? style : undefined,
      },
      ["source", "target", "typeId", "title", "text", "waypoints", "style"],
    );
  }

  const meta = doc.meta
    ? ordered(
        {
          title: doc.meta.title,
          createdAt: doc.meta.createdAt,
          modifiedAt: doc.meta.modifiedAt,
          appVersion: doc.meta.appVersion,
        },
        ["title", "createdAt", "modifiedAt", "appVersion"],
      )
    : undefined;
  const settings = doc.settings
    ? ordered(
        { defaultLinkTypeId: doc.settings.defaultLinkTypeId, resourcesFolder: doc.settings.resourcesFolder },
        ["defaultLinkTypeId", "resourcesFolder"],
      )
    : undefined;
  let view: Record<string, unknown> | undefined;
  if (doc.view) {
    const camera = doc.view.camera
      ? ordered(
          {
            position: vec(doc.view.camera.position),
            target: vec(doc.view.camera.target),
            fov: doc.view.camera.fov,
          },
          ["position", "target", "fov"],
        )
      : undefined;
    const filters = doc.view.linkTypeFilters
      ? ordered(doc.view.linkTypeFilters as Record<string, unknown>, Object.keys(doc.view.linkTypeFilters).sort())
      : undefined;
    view = ordered({ camera, linkTypeFilters: filters }, ["camera", "linkTypeFilters"]);
    if (Object.keys(view).length === 0) view = undefined;
  }

  const base = ordered(
    {
      format: doc.format,
      version: doc.version,
      id: doc.id,
      meta: meta && Object.keys(meta).length > 0 ? meta : undefined,
      settings: settings && Object.keys(settings).length > 0 ? settings : undefined,
      view,
      linkTypes,
      nodes,
      links,
      extensions: doc.extensions,
    },
    TOP_KEYS,
  );

  const known = new Set<string>(TOP_KEYS);
  const extra = doc as MapDocument & Record<string, unknown>;
  for (const key of Object.keys(extra).sort()) {
    if (!known.has(key) && extra[key] !== undefined) base[key] = extra[key];
  }
  return base;
}

export function serialize(doc: MapDocument): string {
  return `${JSON.stringify(toCanonical(doc), null, 2)}\n`;
}
