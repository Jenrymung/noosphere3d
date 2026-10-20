import * as v from "valibot";

const hexColor = v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/));

const Vec3Schema = v.object({
  x: v.pipe(v.number(), v.finite()),
  y: v.pipe(v.number(), v.finite()),
  z: v.pipe(v.number(), v.finite()),
});

const LinkTypeSchema = v.object({
  order: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  color: hexColor,
  pattern: v.picklist(["solid", "dashed", "dotted"]),
  width: v.picklist(["thin", "normal", "thick"]),
  direction: v.picklist(["directed", "bidirectional", "undirected"]),
  icon: v.optional(v.pipe(v.string(), v.maxLength(8))),
  description: v.optional(v.string()),
});

const NodeStyleSchema = v.object({
  color: v.optional(hexColor),
  size: v.optional(v.pipe(v.number(), v.finite())),
  icon: v.optional(v.string()),
});

const NodeSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.maxLength(200))),
  text: v.string(),
  position: Vec3Schema,
  style: v.optional(NodeStyleSchema),
  pinned: v.optional(v.boolean()),
});

const WaypointSchema = v.object({
  order: v.pipe(v.string(), v.minLength(1)),
  position: Vec3Schema,
});

const LinkStyleSchema = v.object({
  bow: v.optional(v.pipe(v.number(), v.finite())),
  labelSegment: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

const LinkSchema = v.object({
  source: v.pipe(v.string(), v.minLength(1)),
  target: v.pipe(v.string(), v.minLength(1)),
  typeId: v.pipe(v.string(), v.minLength(1)),
  title: v.optional(v.pipe(v.string(), v.maxLength(200))),
  text: v.optional(v.string()),
  waypoints: v.optional(v.record(v.string(), WaypointSchema)),
  style: v.optional(LinkStyleSchema),
});

export const MapDocumentSchema = v.object({
  format: v.literal("mindmap3d"),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  minor: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  id: v.optional(v.string()),
  meta: v.optional(
    v.object({
      title: v.optional(v.string()),
      createdAt: v.optional(v.string()),
      modifiedAt: v.optional(v.string()),
      appVersion: v.optional(v.string()),
    }),
  ),
  settings: v.optional(
    v.object({
      defaultLinkTypeId: v.optional(v.string()),
      resourcesFolder: v.optional(v.string()),
    }),
  ),
  view: v.optional(
    v.object({
      camera: v.optional(
        v.object({
          position: Vec3Schema,
          target: Vec3Schema,
          fov: v.optional(v.pipe(v.number(), v.finite(), v.minValue(1))),
        }),
      ),
      linkTypeFilters: v.optional(
        v.record(v.string(), v.picklist(["shown", "dimmed", "hidden"])),
      ),
    }),
  ),
  linkTypes: v.pipe(v.record(v.string(), LinkTypeSchema), v.minEntries(1)),
  nodes: v.record(v.string(), NodeSchema),
  links: v.record(v.string(), LinkSchema),
  extensions: v.optional(v.record(v.string(), v.unknown())),
});

export class MapLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapLoadError";
  }
}

export function formatIssues(issues: v.BaseIssue<unknown>[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path?.map((part) => String(part.key)).join(".") ?? "";
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function assertMapSchema(doc: unknown): void {
  const result = v.safeParse(MapDocumentSchema, doc);
  if (!result.success) {
    throw new MapLoadError(`Invalid map. ${formatIssues(result.issues)}`);
  }
}
