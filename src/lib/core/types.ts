/** Collaboration-ready document types. Ids are object keys and are not repeated inside entries. */

export const FORMAT = "mindmap3d" as const;
export const CURRENT_VERSION = 1;
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
 * Unknown keys are preserved on the object and written back out.
 */
export interface MapDocument {
  format: typeof FORMAT;
  version: number;
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
