/** Collaboration-ready document types. Ids are object keys and are not repeated inside entries. */

export const FORMAT = "mindmap3d" as const;
/** File format version, "MAJOR.MINOR". A newer major is refused; a newer minor is kept. */
export const CURRENT_FORMAT = "1.0";
export const CURRENT_MAJOR = 1;
export const CURRENT_MINOR = 0;

const FORMAT_VERSION = /^[0-9]+\.[0-9]+$/;

export interface FormatVersion {
  major: number;
  minor: number;
  /** Canonical text without leading zeros, e.g. "1.0". */
  text: string;
}

/**
 * Read a format version. A Phase 1 integer `1` is `"1.0"`. Integer `0` is the
 * legacy array document and is not a format version (the migrator handles it).
 */
export function parseFormatVersion(value: unknown): FormatVersion | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return { major: value, minor: 0, text: `${value}.0` };
  }
  if (typeof value === "string" && FORMAT_VERSION.test(value)) {
    const [majorText, minorText] = value.split(".");
    const major = Number(majorText);
    const minor = Number(minorText);
    return { major, minor, text: `${major}.${minor}` };
  }
  return null;
}
export const APP_VERSION = "0.1.0";
export const MAX_TITLE_LENGTH = 200;
export const MAX_WAYPOINTS_PER_LINK = 64;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type LinePattern = "solid" | "dashed" | "dotted";
export type LineWidth = "thin" | "normal" | "thick";
export type LinkDirection = "directed" | "bidirectional" | "undirected";
export type LinkTypeFilter = "shown" | "dimmed" | "hidden";

export interface LinkType {
  order: string;
  name: string;
  color: string;
  pattern: LinePattern;
  width: LineWidth;
  direction: LinkDirection;
  icon?: string;
  description?: string;
}

export interface NodeStyle {
  color?: string;
  size?: number;
  icon?: string;
}

export interface MapNode {
  title?: string;
  text: string;
  position: Vec3;
  style?: NodeStyle;
  pinned?: boolean;
}

export interface Waypoint {
  order: string;
  position: Vec3;
}

export interface LinkStyle {
  bow?: number;
  labelSegment?: number;
}

export interface Link {
  source: string;
  target: string;
  typeId: string;
  title?: string;
  text?: string;
  waypoints?: Record<string, Waypoint>;
  style?: LinkStyle;
}

export interface MapMeta {
  title?: string;
  createdAt?: string;
  modifiedAt?: string;
  appVersion?: string;
}

export interface MapSettings {
  defaultLinkTypeId?: string;
  resourcesFolder?: string;
}

export interface CameraView {
  position: Vec3;
  target: Vec3;
  fov?: number;
}

export interface MapView {
  camera?: CameraView;
  linkTypeFilters?: Record<string, LinkTypeFilter>;
}

/**
 * One `.mindmap3d` document.
 * `version` is `"MAJOR.MINOR"`. Unknown keys are preserved and written back out.
 */
export interface MapDocument {
  format: typeof FORMAT;
  version: string;
  id?: string;
  meta?: MapMeta;
  settings?: MapSettings;
  view?: MapView;
  linkTypes: Record<string, LinkType>;
  nodes: Record<string, MapNode>;
  links: Record<string, Link>;
  extensions?: Record<string, unknown>;
}

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface SelectionSnapshot {
  nodeId: string | null;
  linkId: string | null;
}

export function emptySelection(): SelectionSnapshot {
  return { nodeId: null, linkId: null };
}
