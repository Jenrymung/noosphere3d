import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { BatchedText, Text } from "troika-three-text";
import fontUrl from "@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff?url";
import { LinkIndex, neighbours, sortedWaypoints, visibleNeighbourIds } from "../core/graph";
import { linkLabel, nodeHasBody, nodeTitle, wrapTitle } from "../core/title";
import type { Link, MapDocument, Vec3 } from "../core/types";
import { cameraFollowAction, cameraMoveMs } from "../input/cameraFollow";
import { cycleLink, visibleLinkIds } from "../input/cycle";
import { linkOriginOnSelect, stepEscape } from "../input/escape";
import { GRAB_SNAP, GrabOperator } from "../input/grab";
import { NavHistory } from "../input/navHistory";
import {
  chooseDepthTarget,
  chooseSpatialTarget,
  typicalSpacing,
  type ArrowDirection,
  type SpatialCandidate,
} from "../input/spatial";
import { ViewOperator, type CameraPose } from "../input/viewOperator";
import { MIN_ARROW_PX, arrowProjectChunk } from "./arrowScale";
import { fanSlots, iconRadius, routeLink } from "./route";

export type LabelMode = "sdf" | "css2d" | "off";
export type LabelDensity = "all" | "nearby";

export interface HudSnapshot {
  fps: number;
  avgMs: number;
  p95Ms: number;
  nodes: number;
  links: number;
  visibleLabels: number;
  labelMode: LabelMode;
  density: LabelDensity;
  selectedId: string | null;
  selectedLinkId: string | null;
  selectionKind: "node" | "link" | "none";
  selectedTitle: string;
  neighbours: number;
  message: string;
  ready: boolean;
  status: string;
  prepMs: number | null;
  operator: "" | "view" | "grab";
}

export interface BenchRow {
  mode: LabelMode;
  density: LabelDensity;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  visibleLabels: number;
  prepMs: number | null;
}

export interface SceneHooks {
  isOverlayFocused?: () => boolean;
  /** Return true when the page consumed Esc (edit or reader). */
  handleEscape?: () => boolean;
  openReader?: (target: { kind: "node" | "link"; id: string }) => void;
  editDirect?: () => void;
  createLinked?: () => void;
  createUnlinked?: () => void;
  deleteSelection?: () => void;
  undo?: () => void;
  redo?: () => void;
  togglePin?: () => void;
  commitMove?: (id: string, position: Vec3) => void;
}

export interface LoadOptions {
  keepCamera?: boolean;
  preserveSelection?: boolean;
}

export interface PlacementContext {
  anchor: Vec3;
  existing: Vec3[];
  neighbours: Vec3[];
  forward: Vec3;
  prefer?: Vec3;
}

export interface MindMapScene {
  setLabelMode(mode: LabelMode): void;
  setDensity(density: LabelDensity): void;
  load(doc: MapDocument, options?: LoadOptions): void;
  sync(doc: MapDocument, kind: "text" | "structure"): void;
  selectNode(id: string | null): void;
  selectLink(id: string): void;
  applySelection(selection: { nodeId: string | null; linkId: string | null }): void;
  placementContext(anchorId: string | null): PlacementContext;
  anchorNodeId(): string | null;
  focusCanvas(): void;
  flash(message: string): void;
  focus(): void;
  frameAll(): void;
  setViewDistance(distance: number): void;
  runBench(): Promise<BenchRow[]>;
  benchCase(mode: LabelMode, density: LabelDensity, frame?: boolean): Promise<BenchRow>;
  getHud(): HudSnapshot;
  getPose(): { position: Vec3; target: Vec3 };
  getSelection(): { nodeId: string | null; linkId: string | null; linkOriginId: string | null };
  dispose(): void;
}

const BASE_FONT = 0.22;
const NEARBY_CAP = 240;

interface NodeView {
  id: string;
  position: THREE.Vector3;
  base: THREE.Color;
  scale: number;
  title: string;
  wrapped: string;
  text: Text;
  css: CSS2DObject;
  card: HTMLDivElement;
}

export function createMindMapScene(
  host: HTMLElement,
  doc: MapDocument,
  onHud: (hud: HudSnapshot) => void,
  onToggleMap: () => void,
  hooks: SceneHooks = {},
): MindMapScene {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x101820, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const cssRenderer = new CSS2DRenderer();
  cssRenderer.domElement.className = "css2d-layer";
  host.appendChild(cssRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 2000);
  camera.position.set(28, 22, 46);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.75;
  controls.panSpeed = 0.7;
  controls.zoomSpeed = 0.85;
  controls.minDistance = 1.4;
  controls.maxDistance = 500;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };

  const iconTexture = makeDocIcon();
  const ring = makeRing();
  scene.add(ring);
  scene.add(new THREE.GridHelper(160, 32, 0x243044, 0x1a2736));
  scene.fog = new THREE.Fog(0x101820, 48, 260);

  let nodes: NodeView[] = [];
  let spacing = 1;
  let nodeIndex = new Map<string, number>();
  let linkIndex = LinkIndex.from(doc);
  let currentDoc = doc;
  let iconGeo: THREE.InstancedBufferGeometry | null = null;
  let iconMat: THREE.ShaderMaterial | null = null;
  let iconMesh: THREE.Mesh | null = null;
  let colorAttr: THREE.InstancedBufferAttribute | null = null;
  let scaleAttr: THREE.InstancedBufferAttribute | null = null;
  let offsetAttr: THREE.InstancedBufferAttribute | null = null;
  let pageAttr: THREE.InstancedBufferAttribute | null = null;
  const arrowShaders: { uniforms: Record<string, { value: number }> }[] = [];
  const linkObjects: THREE.Object3D[] = [];
  let batch: BatchedText | null = null;
  let labelMode: LabelMode = "sdf";
  let density: LabelDensity = "nearby";
  let selectedId: string | null = null;
  let neighbourIds = new Set<string>();
  let message = "";
  let messageUntil = 0;
  let ready = false;
  let status = "Starting the scene";
  let prepMs: number | null = null;
  let visibleLabels = 0;
  let lastSpatial: { fromId: string; direction: ArrowDirection } | null = null;
  const frameTimes: number[] = [];
  let lastStamp = performance.now();
  let hudTimer = 0;
  let disposed = false;
  let raf = 0;
  let focusAnim: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null =
    null;
  let autoOrbit = 0;
  let pointer: { x: number; y: number; moved: boolean } | null = null;
  let selectedLinkId: string | null = null;
  let linkOriginId: string | null = null;
  let hoverId: string | null = null;
  let grab: GrabOperator | null = null;
  let grabId: string | null = null;
  let loadGen = 0;
  let linkRebuildQueued = false;
  let navHistory = new NavHistory();
  let viewOperator: ViewOperator | null = null;
  let highlight: Line2 | null = null;
  let linkViews: LinkView[] = [];
  let linkLabelSlots: LinkLabelSlot[] = [];
  const FOLLOW_DISTANCE = 22;

  const tmp = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const camUp = new THREE.Vector3();

  function resize() {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    cssRenderer.setSize(width, height);
    for (const object of linkObjects) {
      const material = (object as LineSegments2).material as LineMaterial | undefined;
      if (material?.resolution) material.resolution.set(width, height);
    }
    const highlightMaterial = highlight?.material as LineMaterial | undefined;
    if (highlightMaterial?.resolution) highlightMaterial.resolution.set(width, height);
    updateIconUniforms();
  }

  function disposeLinks() {
    for (const object of linkObjects) {
      scene.remove(object);
      const mesh = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    }
    linkObjects.length = 0;
    arrowShaders.length = 0;
    linkViews = [];
    if (highlight) {
      scene.remove(highlight);
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      highlight = null;
    }
  }

  function clearWorld() {
    if (iconMesh) {
      scene.remove(iconMesh);
      iconGeo?.dispose();
      iconMat?.dispose();
      iconMesh = null;
      offsetAttr = null;
      pageAttr = null;
      colorAttr = null;
      scaleAttr = null;
    }
    disposeLinks();
    if (batch) {
      scene.remove(batch);
      batch.dispose();
      batch = null;
    }
    for (const node of nodes) {
      node.text.dispose();
      scene.remove(node.css);
      node.css.element.remove();
    }
    nodes = [];
    nodeIndex = new Map();
  }

  function load(next: MapDocument, options?: LoadOptions) {
    const keepSelection = options?.preserveSelection === true;
    const previousNode = selectedId;
    const previousLink = selectedLinkId;
    const previousOrigin = linkOriginId;
    if (viewOperator) endView(false);
    grab = null;
    grabId = null;
    controls.enabled = true;
    currentDoc = next;
    linkIndex = LinkIndex.from(next);
    clearWorld();
    hoverId = null;
    ready = false;
    prepMs = null;
    status = "Building icons and links";
    buildNodes(next);
    buildLinks(next);
    spacing = typicalSpacing(nodes.map((node) => node.position));
    if (keepSelection) {
      selectedId = previousNode && next.nodes[previousNode] ? previousNode : null;
      selectedLinkId = previousLink && next.links[previousLink] ? previousLink : null;
      linkOriginId = previousOrigin && next.nodes[previousOrigin] ? previousOrigin : null;
      if (!selectedLinkId) linkOriginId = null;
    } else {
      selectedLinkId = null;
      linkOriginId = null;
      selectedId = next.nodes["n-flood"]
        ? "n-flood"
        : next.nodes["s2-3-3-2"]
          ? "s2-3-3-2"
          : (Object.keys(next.nodes)[0] ?? null);
      navHistory = new NavHistory();
      if (selectedId) navHistory.visit(selectedId);
    }
    rememberNeighbours();
    applySelectionVisual();
    updateHighlight();
    if (!options?.keepCamera) {
      if (next.view?.camera) {
        camera.position.set(next.view.camera.position.x, next.view.camera.position.y, next.view.camera.position.z);
        controls.target.set(next.view.camera.target.x, next.view.camera.target.y, next.view.camera.target.z);
        if (next.view.camera.fov) camera.fov = next.view.camera.fov;
        camera.updateProjectionMatrix();
        updateIconUniforms();
      } else if (selectedId && next.nodes[selectedId]) {
        const position = next.nodes[selectedId].position;
        controls.target.set(position.x, position.y, position.z);
        camera.position.set(position.x + 7, position.y + 5, position.z + 9);
      } else if (Object.keys(next.nodes).length > 0) {
        frameAll(true);
      }
    }
    status = labelMode === "off" ? "Icons only" : "Preparing labels";
    const started = performance.now();
    const gen = ++loadGen;
    buildLabels(next, () => {
      if (gen !== loadGen) return;
      prepMs = performance.now() - started;
      ready = true;
      status = grab ? grabStatus() : "Ready";
      publish();
      requestRender();
    });
    publish();
  }

  function buildNodes(map: MapDocument) {
    const ids = Object.keys(map.nodes).sort();
    const count = ids.length;
    const plane = new THREE.PlaneGeometry(1, 1);
    iconGeo = new THREE.InstancedBufferGeometry();
    iconGeo.index = plane.index;
    iconGeo.setAttribute("position", plane.attributes.position);
    iconGeo.setAttribute("uv", plane.attributes.uv);
    const offsets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const pages = new Float32Array(count);
    ids.forEach((id, index) => {
      const node = map.nodes[id];
      const color = new THREE.Color(node.style?.color ?? "#d5dbe6");
      color.lerp(new THREE.Color("#f4f7fb"), 0.35);
      offsets[index * 3] = node.position.x;
      offsets[index * 3 + 1] = node.position.y;
      offsets[index * 3 + 2] = node.position.z;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      scales[index] = node.style?.size ?? 0.8;
      pages[index] = nodeHasBody(node) ? 0 : 1;
      nodeIndex.set(id, index);
    });
    offsetAttr = new THREE.InstancedBufferAttribute(offsets, 3);
    colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    scaleAttr = new THREE.InstancedBufferAttribute(scales, 1);
    pageAttr = new THREE.InstancedBufferAttribute(pages, 1);
    iconGeo.setAttribute("iOffset", offsetAttr);
    iconGeo.setAttribute("iColor", colorAttr);
    iconGeo.setAttribute("iScale", scaleAttr);
    iconGeo.setAttribute("iPage", pageAttr);
    iconGeo.instanceCount = count;
    iconMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: iconTexture },
        uTan: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) },
        uHeight: { value: host.clientHeight || 1 },
        uMinPx: { value: 6 },
      },
      vertexShader: `
        attribute vec3 iOffset;
        attribute vec3 iColor;
        attribute float iScale;
        attribute float iPage;
        uniform float uTan;
        uniform float uHeight;
        uniform float uMinPx;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = vec2(uv.x * 0.5 + iPage * 0.5, uv.y);
          vColor = iColor;
          vec4 view = modelViewMatrix * vec4(iOffset, 1.0);
          float dist = max(-view.z, 0.2);
          float size = max(iScale, uMinPx * (2.0 * uTan * dist) / max(uHeight, 1.0));
          view.xy += position.xy * size;
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          if (tex.a < 0.2) discard;
          gl_FragColor = vec4(tex.rgb * vColor, tex.a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    iconMesh = new THREE.Mesh(iconGeo, iconMat);
    iconMesh.frustumCulled = false;
    iconMesh.renderOrder = 2;
    scene.add(iconMesh);
    plane.dispose();
  }

  function buildLinks(map: MapDocument) {
    linkViews = [];
    const drawn: { id: string; link: Link }[] = [];
    for (const [id, link] of Object.entries(map.links)) {
      if (!map.nodes[link.source] || !map.nodes[link.target]) continue;
      if ((map.view?.linkTypeFilters?.[link.typeId] ?? "shown") === "hidden") continue;
      drawn.push({ id, link });
    }
    const slots = fanSlots(
      drawn.map(({ id, link }) => ({
        id,
        source: link.source,
        target: link.target,
        hasWaypoints: sortedWaypoints(link).length > 0,
      })),
    );
    const buckets = new Map<string, { positions: number[]; distances: number[] }>();
    const arrows = new Map<string, THREE.Matrix4[]>();
    for (const { id, link } of drawn) {
      const slot = slots.get(id);
      const sourceNode = map.nodes[link.source];
      const targetNode = map.nodes[link.target];
      const routed = routeLink({
        source: livePosition(link.source),
        target: livePosition(link.target),
        sourceRadius: iconRadius(sourceNode.style?.size),
        targetRadius: iconRadius(targetNode.style?.size),
        waypoints: sortedWaypoints(link).map((entry) => entry.waypoint.position),
        fanIndex: slot?.fanIndex ?? 0,
        fanCount: slot?.auto ? slot.fanCount : 1,
        bow: link.style?.bow ?? 0,
        labelSegment: link.style?.labelSegment,
      });
      const points = routed.points.map(asVec);
      const label = linkLabel(link, map.linkTypes[link.typeId]);
      const type = map.linkTypes[link.typeId];
      linkViews.push({
        id,
        source: link.source,
        target: link.target,
        points,
        label: asVec(routed.label),
        title: label.title,
        typeLine: label.typeLine,
        dimmed: map.view?.linkTypeFilters?.[link.typeId] === "dimmed",
        color: type?.color ?? "#999999",
        colorHex: new THREE.Color(type?.color ?? "#999999").getHex(),
      });
      const bucket = buckets.get(link.typeId) ?? { positions: [], distances: [] };
      let travelled = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const span = start.distanceTo(end);
        if (span < 1e-6) continue;
        bucket.positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        bucket.distances.push(travelled, travelled + span);
        travelled += span;
      }
      buckets.set(link.typeId, bucket);
      if (!type || type.direction === "undirected" || points.length < 2) continue;
      const matrices = arrows.get(link.typeId) ?? [];
      const scale = type.width === "thick" ? 1.35 : type.width === "thin" ? 0.72 : 1;
      pushArrow(matrices, points[points.length - 1], asVec(routed.endDirection), scale);
      if (type.direction === "bidirectional") {
        pushArrow(matrices, points[0], asVec(routed.startDirection).multiplyScalar(-1), scale);
      }
      arrows.set(link.typeId, matrices);
    }
    const widthPx = host.clientWidth || 1;
    const heightPx = host.clientHeight || 1;
    for (const [typeId, bucket] of buckets) {
      if (bucket.positions.length === 0) continue;
      const type = map.linkTypes[typeId];
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(bucket.positions);
      applyLineDistances(geometry, bucket.distances);
      const linewidth = type?.width === "thick" ? 4.5 : type?.width === "thin" ? 1.25 : 2.4;
      const dashed = type?.pattern !== "solid";
      const material = new LineMaterial({
        color: type?.color ?? "#999999",
        linewidth,
        dashed,
        dashSize: type?.pattern === "dotted" ? 0.12 : 0.42,
        gapSize: type?.pattern === "dotted" ? 0.22 : 0.32,
        transparent: true,
        opacity: map.view?.linkTypeFilters?.[typeId] === "dimmed" ? 0.28 : 0.92,
        worldUnits: false,
      });
      material.resolution.set(widthPx, heightPx);
      const lines = new LineSegments2(geometry, material);
      lines.renderOrder = 1;
      lines.frustumCulled = false;
      scene.add(lines);
      linkObjects.push(lines);
    }
    for (const [typeId, matrices] of arrows) {
      if (matrices.length === 0) continue;
      const type = map.linkTypes[typeId];
      const geometry = new THREE.ConeGeometry(0.1, 0.32, 8);
      geometry.translate(0, -0.16, 0);
      const material = new THREE.MeshBasicMaterial({
        color: type?.color ?? "#999999",
        transparent: true,
        opacity: map.view?.linkTypeFilters?.[typeId] === "dimmed" ? 0.28 : 0.95,
        depthWrite: false,
      });
      material.customProgramCacheKey = () => "arrow-min-screen";
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTan = { value: Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) };
        shader.uniforms.uHeight = { value: host.clientHeight || 1 };
        shader.uniforms.uMinPx = { value: MIN_ARROW_PX };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float uTan;\nuniform float uHeight;\nuniform float uMinPx;",
          )
          .replace("#include <project_vertex>", arrowProjectChunk());
        arrowShaders.push(shader);
      };
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      scene.add(mesh);
      linkObjects.push(mesh);
    }
  }

  function buildLabels(map: MapDocument, done: () => void) {
    const ids = Object.keys(map.nodes).sort();
    if (ids.length === 0) {
      queueMicrotask(() => {
        if (!disposed) done();
      });
      return;
    }
    batch = new BatchedText();
    batch.renderOrder = 3;
    scene.add(batch);
    for (const id of ids) {
      const node = map.nodes[id];
      const title = nodeTitle(node) || "Untitled";
      const wrapped = wrapTitle(title);
      const position = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      const scale = node.style?.size ?? 0.8;
      const text = new Text();
      text.text = wrapped;
      text.font = fontUrl;
      text.fontSize = BASE_FONT;
      text.anchorX = "center" as unknown as number;
      text.anchorY = "bottom" as unknown as number;
      text.color = 0xf4f7fb;
      // Troika SDF with an outline is the default. A rounded plate behind the
      // title is deferred to v1. CSS2D stays as the other label mode.
      text.outlineWidth = "8%" as unknown as number;
      text.outlineColor = 0x081018;
      text.position.set(position.x, position.y + scale * 0.55 + 0.05, position.z);
      batch.addText(text);

      const card = document.createElement("div");
      card.className = "label-card";
      card.textContent = wrapped;
      const anchor = document.createElement("div");
      anchor.className = "label-anchor";
      anchor.appendChild(card);
      const css = new CSS2DObject(anchor);
      css.center.set(0, 0);
      css.position.set(position.x, position.y + scale * 0.55, position.z);
      css.visible = false;
      scene.add(css);

      nodes.push({
        id,
        position,
        base: new THREE.Color(node.style?.color ?? "#d5dbe6").lerp(new THREE.Color("#f4f7fb"), 0.35),
        scale,
        title,
        wrapped,
        text,
        css,
        card,
      });
    }
    applySelectionVisual();
    batch.sync(() => {
      if (!disposed) done();
    });
  }

  function rememberNeighbours() {
    neighbourIds = new Set(
      selectedId ? neighbours(currentDoc, linkIndex, selectedId).map((item) => item.nodeId) : [],
    );
  }

  function applySelectionVisual() {
    if (!colorAttr || !scaleAttr) return;
    nodes.forEach((node, index) => {
      const selected = node.id === selectedId && !selectedLinkId;
      const hovered = node.id === hoverId && !selected;
      const color = node.base.clone();
      if (selected) color.lerp(new THREE.Color("#ffe7a3"), 0.55);
      colorAttr!.setXYZ(index, color.r, color.g, color.b);
      const lift = selected ? 1.45 : hovered ? 1.12 : 1;
      scaleAttr!.setX(index, node.scale * lift);
      node.card.classList.toggle("is-selected", selected);
      node.text.color = selected ? 0xfff6dc : 0xf4f7fb;
      node.text.fontSize = selected ? BASE_FONT * 1.12 : BASE_FONT;
    });
    colorAttr.needsUpdate = true;
    scaleAttr.needsUpdate = true;
    const selected = nodes.find((node) => node.id === selectedId);
    if (selected && !selectedLinkId) {
      ring.position.copy(selected.position);
      ring.scale.setScalar(selected.scale * 1.7);
      ring.visible = true;
    } else {
      ring.visible = false;
    }
    requestRender();
  }

  function select(id: string | null, fromArrow: ArrowDirection | null, recordHistory = true) {
    if (fromArrow && selectedId && id && id !== selectedId) lastSpatial = { fromId: selectedId, direction: fromArrow };
    else if (!fromArrow) lastSpatial = null;
    selectedLinkId = null;
    linkOriginId = null;
    selectedId = id;
    if (id && recordHistory) navHistory.visit(id);
    rememberNeighbours();
    applySelectionVisual();
    updateHighlight();
    if (id) {
      const node = nodes.find((item) => item.id === id);
      if (node) nudgeIntoView(node.position);
    }
    publish();
  }

  function selectLink(id: string) {
    const link = currentDoc.links[id];
    if (!link) return;
    linkOriginId = linkOriginOnSelect({ linkId: selectedLinkId, nodeId: selectedId, linkOriginId });
    selectedLinkId = id;
    lastSpatial = null;
    rememberNeighbours();
    applySelectionVisual();
    updateHighlight();
    const view = linkViews.find((item) => item.id === id);
    if (view) nudgeIntoView(view.label);
    publish();
  }

  function updateHighlight() {
    if (highlight) {
      scene.remove(highlight);
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      highlight = null;
    }
    const view = selectedLinkId ? linkViews.find((item) => item.id === selectedLinkId) : undefined;
    if (!view || view.points.length < 2) {
      requestRender();
      return;
    }
    const geometry = new LineGeometry();
    const flat: number[] = [];
    for (const point of view.points) flat.push(point.x, point.y, point.z);
    geometry.setPositions(flat);
    const material = new LineMaterial({
      color: 0xffe7a3,
      linewidth: 6.5,
      transparent: true,
      opacity: 0.95,
      worldUnits: false,
    });
    material.resolution.set(host.clientWidth || 1, host.clientHeight || 1);
    highlight = new Line2(geometry, material);
    highlight.computeLineDistances();
    highlight.renderOrder = 2;
    highlight.frustumCulled = false;
    scene.add(highlight);
    requestRender();
  }

  function screenOf(position: THREE.Vector3): { x: number; y: number; depth: number; behind: boolean } | null {
    const viewZ = position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const ndc = position.clone().project(camera);
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    return {
      x: (ndc.x * 0.5 + 0.5) * width,
      y: (ndc.y * 0.5 + 0.5) * height,
      depth: -viewZ,
      behind: viewZ >= -0.05,
    };
  }

  function navigate(direction: ArrowDirection) {
    if (!selectedId) {
      const first = nodes[0];
      if (first) select(first.id, null);
      return;
    }
    const current = nodes.find((node) => node.id === selectedId);
    if (!current) return;
    const currentScreen = screenOf(current.position);
    if (!currentScreen || currentScreen.behind) {
      focus();
      return;
    }
    const linked = visibleNeighbourIds(currentDoc, linkIndex, selectedId);
    const viewport = { width: host.clientWidth || 1, height: host.clientHeight || 1 };
    const candidates: SpatialCandidate[] = [];
    for (const node of nodes) {
      if (node.id === selectedId) continue;
      const screen = screenOf(node.position);
      if (!screen || screen.behind) continue;
      candidates.push({
        id: node.id,
        screen: { x: screen.x, y: screen.y, depth: screen.depth },
        world: { x: node.position.x, y: node.position.y, z: node.position.z },
        linked: linked.has(node.id),
      });
    }
    const result = chooseSpatialTarget({
      currentId: selectedId,
      current: { x: currentScreen.x, y: currentScreen.y, depth: currentScreen.depth },
      currentWorld: { x: current.position.x, y: current.position.y, z: current.position.z },
      candidates,
      direction,
      previousId: lastSpatial?.fromId,
      previousDirection: lastSpatial?.direction,
      viewport,
      typicalSpacing: spacing,
    });
    if (!result.nextId) {
      message = "Nothing that way";
      messageUntil = performance.now() + 500;
      publish();
      return;
    }
    select(result.nextId, direction);
  }

  function navigateDepth(sense: "closer" | "further") {
    if (!selectedId) return;
    const current = nodes.find((node) => node.id === selectedId);
    if (!current) return;
    const currentScreen = screenOf(current.position);
    if (!currentScreen || currentScreen.behind) return;
    const linked = visibleNeighbourIds(currentDoc, linkIndex, selectedId);
    const viewport = { width: host.clientWidth || 1, height: host.clientHeight || 1 };
    const candidates: SpatialCandidate[] = [];
    for (const node of nodes) {
      if (node.id === selectedId) continue;
      const screen = screenOf(node.position);
      if (!screen || screen.behind) continue;
      candidates.push({
        id: node.id,
        screen,
        world: { x: node.position.x, y: node.position.y, z: node.position.z },
        linked: linked.has(node.id),
      });
    }
    const next = chooseDepthTarget({
      current: currentScreen,
      currentWorld: { x: current.position.x, y: current.position.y, z: current.position.z },
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      candidates,
      sense,
      viewport,
      typicalSpacing: spacing,
    });
    if (!next) {
      message = sense === "closer" ? "Nothing nearer" : "Nothing farther";
      messageUntil = performance.now() + 500;
      publish();
      return;
    }
    lastSpatial = null;
    select(next, null);
  }

  function orbitStep(direction: ArrowDirection) {
    const selected = nodes.find((node) => node.id === selectedId);
    if (selected) controls.target.copy(selected.position);
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const step = 0.09;
    if (direction === "left") spherical.theta -= step;
    if (direction === "right") spherical.theta += step;
    if (direction === "up") spherical.phi = Math.max(0.12, spherical.phi - step);
    if (direction === "down") spherical.phi = Math.min(Math.PI - 0.12, spherical.phi + step);
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    zeroControlDeltas();
    requestRender();
  }

  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    const next = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    offset.setLength(next);
    camera.position.copy(controls.target).add(offset);
    zeroControlDeltas();
    requestRender();
  }

  function focus() {
    const point = focusPoint();
    if (!point) return;
    focusOn(point);
  }

  function focusPoint(): THREE.Vector3 | null {
    if (selectedLinkId) {
      const link = linkViews.find((item) => item.id === selectedLinkId);
      if (link) return link.label.clone();
    }
    const selected = nodes.find((node) => node.id === selectedId);
    return selected ? selected.position.clone() : null;
  }

  function focusOn(point: THREE.Vector3) {
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) offset.set(0.4, 0.35, 1);
    offset.setLength(Math.min(Math.max(offset.length(), 4.5), 9));
    animateCamera(point.clone().add(offset), point.clone());
  }

  function panStep(direction: ArrowDirection) {
    const distance = Math.max(camera.position.distanceTo(controls.target), 1);
    const step = distance * 0.08;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const delta = new THREE.Vector3();
    if (direction === "left") delta.addScaledVector(right, -step);
    if (direction === "right") delta.addScaledVector(right, step);
    if (direction === "up") delta.addScaledVector(up, step);
    if (direction === "down") delta.addScaledVector(up, -step);
    camera.position.add(delta);
    controls.target.add(delta);
    zeroControlDeltas();
    requestRender();
  }

  function frameAll(immediate = false) {
    if (nodes.length === 0) {
      const ids = Object.keys(currentDoc.nodes);
      if (ids.length === 0) return;
      const box = new THREE.Box3();
      for (const id of ids) {
        const position = currentDoc.nodes[id].position;
        box.expandByPoint(new THREE.Vector3(position.x, position.y, position.z));
      }
      frameBox(box, immediate);
      return;
    }
    const box = new THREE.Box3();
    for (const node of nodes) box.expandByPoint(node.position);
    frameBox(box, immediate);
  }

  function frameBox(box: THREE.Box3, immediate: boolean) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = new THREE.Vector3(0.62, 0.48, 0.62).normalize();
    const dist = Math.max(8, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.15);
    const position = sphere.center.clone().addScaledVector(dir, dist);
    if (immediate || cameraMoveMs(reduceMotion) === 0) {
      controls.target.copy(sphere.center);
      camera.position.copy(position);
      focusAnim = null;
      zeroControlDeltas();
      requestRender();
    } else {
      animateCamera(position, sphere.center.clone());
    }
  }

  function setViewDistance(distance: number) {
    const selected = nodes.find((node) => node.id === selectedId);
    const target = selected ? selected.position.clone() : controls.target.clone();
    const dir = camera.position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.35, 1);
    dir.setLength(distance);
    controls.target.copy(target);
    camera.position.copy(target).add(dir);
    focusAnim = null;
    zeroControlDeltas();
    requestRender();
  }

  function animateCamera(position: THREE.Vector3, target: THREE.Vector3) {
    if (cameraMoveMs(reduceMotion) === 0) {
      camera.position.copy(position);
      controls.target.copy(target);
      focusAnim = null;
      zeroControlDeltas();
      requestRender();
      return;
    }
    focusAnim = {
      fromP: camera.position.clone(),
      toP: position,
      fromT: controls.target.clone(),
      toT: target,
      t: 0,
    };
    requestRender();
  }

  function nudgeIntoView(position: THREE.Vector3) {
    camera.updateMatrixWorld();
    const ndc = position.clone().project(camera);
    const distance = camera.position.distanceTo(position);
    const action = cameraFollowAction({
      ndcX: ndc.x,
      ndcY: ndc.y,
      ndcZ: ndc.z,
      distance,
      limit: FOLLOW_DISTANCE,
    });
    if (action === "focus") {
      focusOn(position);
      return;
    }
    if (action === "hold") return;
    const margin = 0.74;
    let sx = 0;
    let sy = 0;
    if (ndc.x > margin) sx = ndc.x - margin;
    else if (ndc.x < -margin) sx = ndc.x + margin;
    if (ndc.y > margin) sy = ndc.y - margin;
    else if (ndc.y < -margin) sy = ndc.y + margin;
    if (sx === 0 && sy === 0) return;
    const dist = Math.max(distance, 1);
    const worldH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    const worldW = worldH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const offset = right.multiplyScalar((sx * worldW) / 2).add(up.multiplyScalar((sy * worldH) / 2));
    animateCamera(camera.position.clone().add(offset), controls.target.clone().add(offset));
  }

  function labelPixelSize(distance: number): number {
    return THREE.MathUtils.clamp(520 / Math.max(distance, 3), 11, 26);
  }

  function updateLabels() {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    camera.getWorldDirection(forward);
    const ranked: { node: NodeView; distance: number; rank: number }[] = [];
    for (const node of nodes) {
      tmp.copy(node.position).sub(camera.position);
      const distance = tmp.length();
      const inFront = tmp.dot(forward) > 0;
      ranked.push({
        node,
        distance,
        rank: !inFront ? 9 : node.id === selectedId ? 0 : neighbourIds.has(node.id) ? 1 : 2,
      });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.distance - b.distance);
    const keep = new Set<string>();
    if (density === "all") {
      for (const item of ranked) if (item.rank < 9) keep.add(item.node.id);
    } else {
      let kept = 0;
      for (const item of ranked) {
      if (item.rank >= 9) continue;
      if (item.rank > 0 && item.distance > 48) continue;
      if (kept >= NEARBY_CAP && item.rank > 1) continue;
        keep.add(item.node.id);
        kept += 1;
      }
    }
    visibleLabels = keep.size;
    const showSdf = labelMode === "sdf";
    const showCss = labelMode === "css2d";
    cssRenderer.domElement.style.display = showCss ? "" : "none";
    if (batch) batch.visible = showSdf && density === "all";
    const worldPerPixelAt = (distance: number) =>
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance) / height;
    for (const node of nodes) {
      const show = keep.has(node.id);
      const distance = camera.position.distanceTo(node.position);
      const pixels = labelPixelSize(distance);
      node.css.visible = showCss && show;
      if (showCss && show) {
        const size = `${Math.round(pixels)}px`;
        if (node.card.dataset.size !== size) {
          node.card.style.fontSize = size;
          node.card.dataset.size = size;
        }
      }
      const useIndividual = showSdf && show && density !== "all";
      if (useIndividual) {
        if (node.text.parent !== scene) scene.add(node.text);
        node.text.visible = true;
      } else if (node.text.parent === scene) {
        scene.remove(node.text);
      }
      if (showSdf) {
        const scale = show ? (pixels * worldPerPixelAt(distance)) / BASE_FONT : 0.0001;
        node.text.scale.setScalar(scale);
        node.text.quaternion.copy(camera.quaternion);
        node.text.updateMatrix();
      }
    }
    updateLinkLabels(height);
    void width;
  }

  function ensureLinkLabels() {
    if (linkLabelSlots.length > 0) return;
    for (let i = 0; i < 36; i += 1) {
      const title = makeLinkText(0.2);
      const type = makeLinkText(0.14);
      scene.add(title);
      scene.add(type);
      linkLabelSlots.push({ title, type, linkId: null, titleStr: "", typeStr: "" });
    }
  }

  function updateLinkLabels(height: number) {
    ensureLinkLabels();
    const show = labelMode !== "off";
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const ranked = linkViews
      .map((link) => ({ link, distance: camera.position.distanceTo(link.label) }))
      .sort((a, b) => {
        if (a.link.id === selectedLinkId) return -1;
        if (b.link.id === selectedLinkId) return 1;
        return a.distance - b.distance;
      });
    const chosen: { link: LinkView; distance: number }[] = [];
    for (const item of ranked) {
      if (!show) break;
      const selected = item.link.id === selectedLinkId;
      if (!selected && (item.distance > 48 || chosen.length >= linkLabelSlots.length)) continue;
      chosen.push(item);
      if (chosen.length >= linkLabelSlots.length) break;
    }
    const worldPerPixelAt = (distance: number) =>
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance) / height;
    linkLabelSlots.forEach((slot, index) => {
      const item = chosen[index];
      if (!item) {
        slot.title.visible = false;
        slot.type.visible = false;
        slot.linkId = null;
        return;
      }
      const selected = item.link.id === selectedLinkId;
      const detail = selected || item.distance < 26 ? "both" : item.distance < 48 ? "one" : "none";
      const showTitle = detail !== "none" && item.link.title != null && (detail === "both" || detail === "one");
      const showType = detail === "both" || (detail === "one" && item.link.title == null) || (selected && item.link.title == null);
      const pixels = labelPixelSize(item.distance);
      const scale = (pixels * worldPerPixelAt(Math.max(item.distance, 0.5))) / BASE_FONT;
      const lift = BASE_FONT * scale * 0.62;
      slot.linkId = item.link.id;
      slot.title.visible = showTitle;
      slot.type.visible = showType;
      if (showTitle && item.link.title) {
        const text = wrapTitle(item.link.title, 1, 32);
        if (slot.titleStr !== text) {
          slot.title.text = text;
          slot.titleStr = text;
        }
        slot.title.color = selected ? 0xfff6dc : 0xf7f1e4;
        slot.title.fillOpacity = item.link.dimmed ? 0.45 : 1;
        slot.title.position.copy(item.link.label);
        if (showType) slot.title.position.addScaledVector(camUp, lift);
        slot.title.quaternion.copy(camera.quaternion);
        slot.title.scale.setScalar(scale);
        slot.title.updateMatrix();
      }
      if (showType) {
        if (slot.typeStr !== item.link.typeLine) {
          slot.type.text = item.link.typeLine;
          slot.typeStr = item.link.typeLine;
        }
        slot.type.color = item.link.colorHex;
        slot.type.fillOpacity = item.link.dimmed ? 0.45 : 1;
        slot.type.position.copy(item.link.label);
        if (showTitle) slot.type.position.addScaledVector(camUp, -lift * 0.85);
        slot.type.quaternion.copy(camera.quaternion);
        slot.type.scale.setScalar(scale);
        slot.type.updateMatrix();
      }
    });
  }

  function pick(event: PointerEvent, includeLinks = true): PickHit | null {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    camera.updateMatrixWorld();
    let best: PickHit | null = null;
    const consider = (hit: PickHit) => {
      if (!best || hit.dist < best.dist) best = hit;
    };
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const node of nodes) {
      const icon = projectToScreen(node.position, rect);
      if (!icon) continue;
      const titlePoint = projectToScreen(tmp.copy(node.position).addScaledVector(camUp, node.scale * 0.72), rect);
      const iconDist = Math.hypot(icon.x - x, icon.y - y);
      if (titlePoint) {
        const titleDist = Math.hypot(titlePoint.x - x, titlePoint.y - y);
        if (titleDist < 36 && titleDist <= iconDist) consider({ kind: "node-title", id: node.id, dist: titleDist });
      }
      if (iconDist < 22 * Math.max(node.scale, 0.8)) consider({ kind: "node-icon", id: node.id, dist: iconDist });
    }
    for (const slot of linkLabelSlots) {
      if (!slot.linkId || (!slot.title.visible && !slot.type.visible)) continue;
      const anchor = slot.title.visible ? slot.title.position : slot.type.position;
      const screen = projectToScreen(anchor, rect);
      if (!screen) continue;
      const dist = Math.hypot(screen.x - x, screen.y - y);
      if (dist < 32) consider({ kind: "link-label", id: slot.linkId, dist });
    }
    if (!includeLinks) return best;
    for (const link of linkViews) {
      let previous: { x: number; y: number } | null = null;
      for (const point of link.points) {
        const screen = projectToScreen(point, rect);
        if (previous && screen) {
          const dist = distanceToSegment(x, y, previous.x, previous.y, screen.x, screen.y);
          if (dist < 8) consider({ kind: "link-line", id: link.id, dist });
        }
        previous = screen;
      }
    }
    return best;
  }

  function hoverAt(event: PointerEvent) {
    if (viewOperator || pointer?.moved) return;
    const hit = pick(event, linkViews.length <= 64);
    const next = hit && (hit.kind === "node-icon" || hit.kind === "node-title") ? hit.id : null;
    canvas.style.cursor = hit ? "pointer" : "";
    if (next === hoverId) return;
    hoverId = next;
    applySelectionVisual();
  }

  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.("[data-editor-root], .cm-editor")) return;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (event.key === "Enter" && target?.tagName === "BUTTON") return;
    const mod = event.metaKey || event.ctrlKey;
    if (viewOperator) {
      if (event.key === "Escape") {
        event.preventDefault();
        endView(false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        endView(true);
        return;
      }
    }
    if (grab) {
      if (event.key === "Escape") {
        event.preventDefault();
        endGrab(false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        endGrab(true);
        return;
      }
      if (event.code === "KeyX" || event.code === "KeyY" || event.code === "KeyZ") {
        event.preventDefault();
        grab.toggleAxis(event.code === "KeyX" ? "x" : event.code === "KeyY" ? "y" : "z");
        previewGrab();
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        nudgeGrabDepth(event.key === "PageUp" ? 1 : -1, event.shiftKey, mod);
        return;
      }
    }
    const arrow =
      event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown";
    if (arrow) {
      event.preventDefault();
      const direction = (
        { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const
      )[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
      if (grab) {
        nudgeGrabArrow(direction, event.shiftKey, mod);
        return;
      }
      if (viewOperator) {
        if (event.shiftKey) viewOperator.panPixels(direction === "left" ? -28 : direction === "right" ? 28 : 0, direction === "up" ? -28 : direction === "down" ? 28 : 0);
        else viewOperator.orbitPixels(direction === "left" ? -28 : direction === "right" ? 28 : 0, direction === "up" ? -28 : direction === "down" ? 28 : 0);
        applyPose(viewOperator.current);
        requestRender();
        return;
      }
      if (event.shiftKey) orbitStep(direction);
      else if (event.altKey) panStep(direction);
      else if ((event.ctrlKey || event.metaKey) && (direction === "up" || direction === "down")) {
        navigateDepth(direction === "up" ? "closer" : "further");
      } else if (selectedLinkId && (direction === "left" || direction === "right") && !event.ctrlKey && !event.metaKey) {
        const link = currentDoc.links[selectedLinkId];
        if (link) select(direction === "left" ? link.source : link.target, null);
      } else if (!event.ctrlKey && !event.metaKey) navigate(direction);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (hooks.handleEscape?.()) return;
      const step = stepEscape({
        panel: "navigate",
        editFromReader: false,
        pinned: true,
        nodeId: selectedId,
        linkId: selectedLinkId,
        linkOriginId,
      });
      if (step.kind === "return-to-node") {
        if (currentDoc.nodes[step.nodeId]) select(step.nodeId, null);
        else select(null, null, false);
      } else if (step.kind === "clear-selection") select(null, null, false);
      return;
    }
    if (mod && event.code === "KeyZ" && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) hooks.redo?.();
      else hooks.undo?.();
      return;
    }
    if (mod && event.code === "KeyY" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      hooks.redo?.();
      return;
    }
    if (mod && event.code === "Backslash") {
      event.preventDefault();
      hooks.togglePin?.();
      return;
    }
    if (event.key === "Enter" && mod) {
      event.preventDefault();
      hooks.createUnlinked?.();
      return;
    }
    if (event.key === "Tab" && !mod && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) note("The link-type picker arrives in a later phase");
      else hooks.createLinked?.();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = openTarget();
      if (target) hooks.openReader?.(target);
      else note("Select a node or link, or press Mod+Enter to start one");
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !mod && !event.altKey) {
      event.preventDefault();
      hooks.deleteSelection?.();
      return;
    }
    if (event.code === "Minus" || event.code === "NumpadSubtract") {
      event.preventDefault();
      if (viewOperator) {
        viewOperator.dolly(1.12);
        applyPose(viewOperator.current);
      } else zoom(1.12);
    } else if (event.code === "Equal" || event.code === "NumpadAdd") {
      event.preventDefault();
      if (viewOperator) {
        viewOperator.dolly(0.88);
        applyPose(viewOperator.current);
      } else zoom(0.88);
    } else if (event.code === "KeyF" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) frameAll();
      else focus();
    } else if (event.code === "Home") {
      event.preventDefault();
      frameAll();
    }     else if (event.code === "KeyV" && !event.repeat && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      beginView();
    } else if (event.code === "KeyG" && !event.repeat && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      beginGrab();
    } else if (event.code === "KeyE" && !event.repeat && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      hooks.editDirect?.();
    } else if (event.code === "KeyB" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      goHistory(event.shiftKey);
    } else if ((event.code === "BracketRight" || event.code === "BracketLeft") && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      cycle(event.code === "BracketRight" ? 1 : -1);
    } else if (event.code === "Digit1") setLabelMode("sdf");
    else if (event.code === "Digit2") setLabelMode("css2d");
    else if (event.code === "Digit0") setLabelMode("off");
    else if (event.code === "Digit9") setDensity(density === "all" ? "nearby" : "all");
    else if (event.code === "KeyM" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) onToggleMap();
    requestRender();
  }

  function cycle(delta: 1 | -1) {
    if (!selectedId) return;
    const ids = visibleLinkIds(currentDoc, linkIndex, selectedId);
    const next = cycleLink(ids, selectedLinkId, delta);
    if (!next) {
      note("No visible links");
      return;
    }
    selectLink(next);
  }

  function goHistory(forward: boolean) {
    const id = forward ? navHistory.forward() : navHistory.back();
    if (!id) {
      note(forward ? "No further nodes" : "No earlier nodes");
      return;
    }
    select(id, null, false);
  }

  function beginView() {
    focusAnim = null;
    zeroControlDeltas();
    viewOperator = new ViewOperator(readPose());
    controls.enabled = false;
    status = "View — move to orbit, Shift pans, wheel zooms. Click or Enter keeps it. Esc or right-click restores it.";
    publish();
    requestRender();
  }

  function endView(confirm: boolean) {
    if (!viewOperator) return;
    const pose = confirm ? viewOperator.confirm() : viewOperator.cancel();
    viewOperator = null;
    applyPose(pose);
    controls.enabled = true;
    zeroControlDeltas();
    controls.update();
    status = "Ready";
    note(confirm ? "View kept" : "View restored");
    requestRender();
  }

  function readPose(): CameraPose {
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    };
  }

  function applyPose(pose: CameraPose) {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(controls.target);
    zeroControlDeltas();
  }

  function note(text: string) {
    message = text;
    messageUntil = performance.now() + 1600;
    publish();
  }

  function zeroControlDeltas() {
    const anyControls = controls as unknown as {
      _sphericalDelta: { set: (x: number, y: number, z: number) => void };
      _panOffset: { set: (x: number, y: number, z: number) => void };
      _scale: number;
    };
    anyControls._sphericalDelta.set(0, 0, 0);
    anyControls._panOffset.set(0, 0, 0);
    anyControls._scale = 1;
  }

  function updateIconUniforms() {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const height = host.clientHeight || 1;
    if (iconMat) {
      iconMat.uniforms.uTan.value = tan;
      iconMat.uniforms.uHeight.value = height;
    }
    for (const shader of arrowShaders) {
      if (shader.uniforms.uTan) shader.uniforms.uTan.value = tan;
      if (shader.uniforms.uHeight) shader.uniforms.uHeight.value = height;
    }
  }

  function projectToScreen(position: THREE.Vector3, rect: DOMRect): { x: number; y: number } | null {
    const ndc = position.clone().project(camera);
    if (ndc.z < -1 || ndc.z > 1) return null;
    return {
      x: (ndc.x * 0.5 + 0.5) * rect.width,
      y: (-ndc.y * 0.5 + 0.5) * rect.height,
    };
  }

  function setLabelMode(mode: LabelMode) {
    labelMode = mode;
    status = mode === "off" ? "Icons only" : mode === "sdf" ? "SDF labels" : "CSS2D labels";
    publish();
    requestRender();
  }

  function setDensity(next: LabelDensity) {
    density = next;
    publish();
    requestRender();
  }

  function stats() {
    const sample = frameTimes.length > 0 ? frameTimes : [16.7];
    const sorted = [...sample].sort((a, b) => a - b);
    const avg = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { avg, p95, fps: 1000 / Math.max(avg, 0.1) };
  }

  function getHud(): HudSnapshot {
    const { avg, p95, fps } = stats();
    return {
      fps,
      avgMs: avg,
      p95Ms: p95,
      nodes: Object.keys(currentDoc.nodes).length,
      links: Object.keys(currentDoc.links).length,
      visibleLabels,
      labelMode,
      density,
      selectedId,
      selectedLinkId,
      selectionKind: selectedLinkId ? "link" : selectedId ? "node" : "none",
      selectedTitle: linkTitle() ?? nodes.find((node) => node.id === selectedId)?.title ?? "Nothing selected",
      neighbours: neighbourIds.size,
      message: performance.now() < messageUntil ? message : "",
      ready,
      status,
      prepMs,
      operator: grab ? "grab" : viewOperator ? "view" : "",
    };
  }

  function linkTitle(): string | null {
    if (!selectedLinkId) return null;
    const view = linkViews.find((item) => item.id === selectedLinkId);
    if (!view) return selectedLinkId;
    return view.title ? `${view.title} — ${view.typeLine}` : view.typeLine;
  }

  function getPose() {
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    };
  }

  function publish() {
    onHud(getHud());
  }

  function waitFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      let left = count;
      const step = () => {
        if (disposed) return resolve();
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async function benchCase(mode: LabelMode, nextDensity: LabelDensity, frame = true): Promise<BenchRow> {
    setLabelMode(mode);
    setDensity(nextDensity);
    if (frame) frameAll(true);
    await waitFrames(20);
    frameTimes.length = 0;
    autoOrbit = 90;
    requestRender();
    await waitFrames(90);
    autoOrbit = 0;
    const sample = [...frameTimes];
    const sorted = [...sample].sort((a, b) => a - b);
    const row: BenchRow = {
      mode,
      density: nextDensity,
      medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
      maxMs: sorted[sorted.length - 1] ?? 0,
      visibleLabels,
      prepMs,
    };
    publish();
    return row;
  }

  async function runBench(): Promise<BenchRow[]> {
    const savedMode = labelMode;
    const savedDensity = density;
    const rows: BenchRow[] = [];
    for (const mode of ["sdf", "css2d"] as const) {
      for (const nextDensity of ["all", "nearby"] as const) {
        rows.push(await benchCase(mode, nextDensity));
      }
    }
    setLabelMode(savedMode);
    setDensity(savedDensity);
    publish();
    return rows;
  }

  function tick(now: number) {
    if (disposed) return;
    raf = 0;
    const dt = now - lastStamp;
    lastStamp = now;
    if (dt > 0 && dt < 8000) {
      frameTimes.push(dt);
      if (frameTimes.length > 180) frameTimes.shift();
    }
    let animating = false;
    if (focusAnim) {
      animating = true;
      focusAnim.t += dt / Math.max(cameraMoveMs(reduceMotion), 1);
      const t = ease(Math.min(1, focusAnim.t));
      camera.position.lerpVectors(focusAnim.fromP, focusAnim.toP, t);
      controls.target.lerpVectors(focusAnim.fromT, focusAnim.toT, t);
      if (focusAnim.t >= 1) focusAnim = null;
    }
    if (autoOrbit > 0) {
      animating = true;
      autoOrbit -= 1;
      orbitStep("right");
    }
    let controlsMoved = false;
    if (!viewOperator && !grab) {
      if (animating) zeroControlDeltas();
      controlsMoved = controls.update();
    }
    updateLabels();
    renderer.render(scene, camera);
    if (labelMode === "css2d") cssRenderer.render(scene, camera);
    if (now - hudTimer > 250) {
      hudTimer = now;
      publish();
    }
    if (animating || controlsMoved || focusAnim || autoOrbit > 0) requestRender();
  }

  function requestRender() {
    if (disposed || raf) return;
    raf = requestAnimationFrame(tick);
  }

  let lastTitleClick: { id: string; time: number } | null = null;
  let lastLinkClick: { id: string; time: number } | null = null;

  function onPointerDown(event: PointerEvent) {
    if (event.button === 0) canvas.focus();
    if (grab && event.button === 2) {
      event.preventDefault();
      endGrab(false);
      return;
    }
    if (viewOperator && event.button === 2) {
      event.preventDefault();
      endView(false);
      return;
    }
    pointer = { x: event.clientX, y: event.clientY, moved: false };
  }
  function onPointerMove(event: PointerEvent) {
    if (grab) {
      if (event.movementX === 0 && event.movementY === 0) return;
      moveGrabByMouse(event.movementX, event.movementY, event.shiftKey, event.ctrlKey || event.metaKey);
      return;
    }
    if (viewOperator) {
      if (event.shiftKey) viewOperator.panPixels(event.movementX, event.movementY);
      else if (event.ctrlKey || event.metaKey) viewOperator.dollyPixels(event.movementY);
      else if (event.movementX !== 0 || event.movementY !== 0) viewOperator.orbitPixels(event.movementX, event.movementY);
      applyPose(viewOperator.current);
      requestRender();
      return;
    }
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
    hoverAt(event);
  }
  function onPointerUp(event: PointerEvent) {
    if (grab && event.button === 0) {
      endGrab(true);
      pointer = null;
      return;
    }
    if (viewOperator && event.button === 0) {
      endView(true);
      pointer = null;
      return;
    }
    if (pointer && !pointer.moved && event.button === 0) {
      const hit = pick(event);
      if (hit?.kind === "node-title") {
        const now = performance.now();
        select(hit.id, null);
        if (lastTitleClick && lastTitleClick.id === hit.id && now - lastTitleClick.time < 450) focus();
        lastTitleClick = { id: hit.id, time: now };
      } else if (hit?.kind === "node-icon") {
        select(hit.id, null);
        hooks.openReader?.({ kind: "node", id: hit.id });
      } else if (hit && (hit.kind === "link-label" || hit.kind === "link-line")) {
        selectLink(hit.id);
        if (hit.kind === "link-label") {
          const now = performance.now();
          if (lastLinkClick && lastLinkClick.id === hit.id && now - lastLinkClick.time < 450) {
            hooks.openReader?.({ kind: "link", id: hit.id });
          }
          lastLinkClick = { id: hit.id, time: now };
        }
      }
    }
    pointer = null;
  }
  function onContextMenu(event: Event) {
    event.preventDefault();
    if (grab) endGrab(false);
    else if (viewOperator) endView(false);
  }
  function onWheel(event: WheelEvent) {
    if (grab) {
      event.preventDefault();
      event.stopPropagation();
      nudgeGrabDepth(event.deltaY < 0 ? 1 : -1, event.shiftKey, event.ctrlKey || event.metaKey);
      return;
    }
    if (!viewOperator) return;
    event.preventDefault();
    event.stopPropagation();
    viewOperator.dollyPixels(event.deltaY);
    applyPose(viewOperator.current);
    requestRender();
  }

  function openTarget(): { kind: "node" | "link"; id: string } | null {
    if (selectedLinkId && currentDoc.links[selectedLinkId]) return { kind: "link", id: selectedLinkId };
    if (selectedId && currentDoc.nodes[selectedId]) return { kind: "node", id: selectedId };
    return null;
  }

  function anchorNodeId(): string | null {
    if (selectedLinkId) return linkOriginId && currentDoc.nodes[linkOriginId] ? linkOriginId : null;
    return selectedId && currentDoc.nodes[selectedId] ? selectedId : null;
  }

  function placementContext(anchorId: string | null): PlacementContext {
    camera.updateMatrixWorld();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const forwardVec = { x: look.x, y: look.y, z: look.z };
    const existing = Object.values(currentDoc.nodes).map((node) => ({ ...node.position }));
    if (!anchorId || !currentDoc.nodes[anchorId]) {
      const distance = Math.max(6, camera.position.distanceTo(controls.target) * 0.35);
      const anchor = camera.position.clone().addScaledVector(look, distance);
      return {
        anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
        existing,
        neighbours: [],
        forward: forwardVec,
        prefer: forwardVec,
      };
    }
    const linked = neighbours(currentDoc, linkIndex, anchorId)
      .map((item) => currentDoc.nodes[item.nodeId]?.position)
      .filter((position): position is Vec3 => Boolean(position))
      .map((position) => ({ ...position }));
    return {
      anchor: { ...currentDoc.nodes[anchorId].position },
      existing,
      neighbours: linked,
      forward: forwardVec,
    };
  }

  function applySelection(selection: { nodeId: string | null; linkId: string | null }) {
    if (selection.linkId && currentDoc.links[selection.linkId]) {
      selectedId = selection.nodeId && currentDoc.nodes[selection.nodeId] ? selection.nodeId : null;
      selectedLinkId = null;
      linkOriginId = null;
      selectLink(selection.linkId);
      return;
    }
    select(selection.nodeId && currentDoc.nodes[selection.nodeId] ? selection.nodeId : null, null, false);
  }

  function sync(next: MapDocument, kind: "text" | "structure") {
    if (kind === "text") {
      currentDoc = next;
      linkIndex = LinkIndex.from(next);
      refreshText();
      return;
    }
    load(next, { keepCamera: true, preserveSelection: true });
  }

  function refreshText() {
    let batched = false;
    for (const view of nodes) {
      const node = currentDoc.nodes[view.id];
      if (!node) continue;
      const title = nodeTitle(node) || "Untitled";
      const wrapped = wrapTitle(title);
      const changed = view.title !== title || view.wrapped !== wrapped;
      view.title = title;
      view.wrapped = wrapped;
      if (changed) {
        view.text.text = wrapped;
        view.card.textContent = wrapped;
        batched = true;
      }
      const index = nodeIndex.get(view.id);
      if (pageAttr && index != null) pageAttr.setX(index, nodeHasBody(node) ? 0 : 1);
    }
    if (pageAttr) pageAttr.needsUpdate = true;
    for (const view of linkViews) {
      const link = currentDoc.links[view.id];
      if (!link) continue;
      const label = linkLabel(link, currentDoc.linkTypes[link.typeId]);
      view.title = label.title;
      view.typeLine = label.typeLine;
    }
    if (batched && batch && density === "all") batch.sync();
    applySelectionVisual();
    publish();
    requestRender();
  }

  function livePosition(id: string): Vec3 {
    if (grab && grabId === id) return grab.position();
    return currentDoc.nodes[id].position;
  }

  function queueRebuildLinks() {
    if (linkRebuildQueued) return;
    linkRebuildQueued = true;
    requestAnimationFrame(() => {
      linkRebuildQueued = false;
      if (disposed) return;
      disposeLinks();
      buildLinks(currentDoc);
      updateHighlight();
      requestRender();
    });
  }

  function writePosition(id: string, position: Vec3, rebuild: boolean) {
    const view = nodes.find((item) => item.id === id);
    if (view) {
      view.position.set(position.x, position.y, position.z);
      view.text.position.set(position.x, position.y + view.scale * 0.55 + 0.05, position.z);
      view.css.position.set(position.x, position.y + view.scale * 0.55, position.z);
    }
    const index = nodeIndex.get(id);
    if (offsetAttr && index != null) {
      offsetAttr.setXYZ(index, position.x, position.y, position.z);
      offsetAttr.needsUpdate = true;
    }
    if (selectedId === id && !selectedLinkId) ring.position.set(position.x, position.y, position.z);
    if (rebuild) queueRebuildLinks();
    requestRender();
  }

  function grabStatus(): string {
    if (!grab) return "Ready";
    const axis = grab.axis ? `${grab.axis.toUpperCase()} axis` : "plane";
    const position = grab.position();
    return `Grab · ${axis} · ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
  }

  function previewGrab() {
    if (!grab || !grabId) return;
    writePosition(grabId, grab.position(), true);
    status = grabStatus();
    publish();
  }

  function beginGrab() {
    if (viewOperator || hooks.isOverlayFocused?.()) return;
    if (selectedLinkId || !selectedId || !currentDoc.nodes[selectedId]) {
      note("Select a node to move");
      return;
    }
    focusAnim = null;
    zeroControlDeltas();
    grabId = selectedId;
    grab = new GrabOperator(currentDoc.nodes[selectedId].position);
    controls.enabled = false;
    status = grabStatus();
    publish();
    requestRender();
  }

  function endGrab(confirm: boolean) {
    if (!grab || !grabId) return;
    const id = grabId;
    const origin = grab.cancel();
    const next = confirm ? grab.confirm() : origin;
    const moved = Math.hypot(next.x - origin.x, next.y - origin.y, next.z - origin.z) > 1e-4;
    grab = null;
    grabId = null;
    controls.enabled = true;
    zeroControlDeltas();
    if (confirm && moved) hooks.commitMove?.(id, next);
    else writePosition(id, origin, true);
    status = "Ready";
    note(confirm ? "Move kept" : "Move cancelled");
    publish();
  }

  function cameraAxes() {
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    return { right, up, look };
  }

  function nudgeGrabArrow(direction: ArrowDirection, large: boolean, snap: boolean) {
    if (!grab) return;
    const { right, up } = cameraAxes();
    const step = large ? 0.75 : 0.18;
    const delta = { x: 0, y: 0, z: 0 };
    const basis = direction === "left" ? right.clone().multiplyScalar(-step) : direction === "right" ? right.clone().multiplyScalar(step) : direction === "up" ? up.clone().multiplyScalar(step) : up.clone().multiplyScalar(-step);
    delta.x = basis.x;
    delta.y = basis.y;
    delta.z = basis.z;
    grab.add(delta, { snap: snap ? GRAB_SNAP : null });
    previewGrab();
  }

  function nudgeGrabDepth(sense: 1 | -1, precision: boolean, snap: boolean) {
    if (!grab) return;
    const { look } = cameraAxes();
    const step = 0.4 * sense;
    grab.add(
      { x: look.x * step, y: look.y * step, z: look.z * step },
      { precision, snap: snap ? GRAB_SNAP : null },
    );
    previewGrab();
  }

  function moveGrabByMouse(dx: number, dy: number, precision: boolean, snap: boolean) {
    if (!grab || !grabId) return;
    const { right, up } = cameraAxes();
    const node = currentDoc.nodes[grabId];
    const distance = Math.max(camera.position.distanceTo(node ? asVec(node.position) : controls.target), 2);
    const scale = distance * 0.0015;
    grab.add(
      {
        x: (right.x * dx - up.x * dy) * scale,
        y: (right.y * dx - up.y * dy) * scale,
        z: (right.z * dx - up.z * dy) * scale,
      },
      { precision, snap: snap ? GRAB_SNAP : null },
    );
    previewGrab();
  }

  resize();
  load(doc);
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });
  controls.addEventListener("change", requestRender);
  requestRender();

  return {
    setLabelMode,
    setDensity,
    load,
    sync,
    selectNode: (id: string | null) => select(id, null),
    selectLink,
    applySelection,
    placementContext,
    anchorNodeId,
    focusCanvas: () => canvas.focus(),
    flash: note,
    focus,
    frameAll: () => frameAll(false),
    setViewDistance,
    runBench,
    benchCase,
    getHud,
    getPose,
    getSelection: () => ({ nodeId: selectedId, linkId: selectedLinkId, linkOriginId }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel, true);
      controls.dispose();
      for (const slot of linkLabelSlots) {
        slot.title.dispose();
        slot.type.dispose();
      }
      clearWorld();
      iconTexture.dispose();
      renderer.dispose();
      cssRenderer.domElement.remove();
      canvas.remove();
    },
  };
}

interface LinkView {
  id: string;
  source: string;
  target: string;
  points: THREE.Vector3[];
  label: THREE.Vector3;
  title: string | null;
  typeLine: string;
  dimmed: boolean;
  color: string;
  colorHex: number;
}

interface LinkLabelSlot {
  title: Text;
  type: Text;
  linkId: string | null;
  titleStr: string;
  typeStr: string;
}

interface PickHit {
  kind: "node-title" | "node-icon" | "link-label" | "link-line";
  id: string;
  dist: number;
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function pushArrow(matrices: THREE.Matrix4[], tip: THREE.Vector3, direction: THREE.Vector3, scale: number) {
  if (direction.lengthSq() < 1e-8) return;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  const matrix = new THREE.Matrix4().compose(tip, quaternion, new THREE.Vector3(scale, scale, scale));
  matrices.push(matrix);
}

function applyLineDistances(geometry: LineSegmentsGeometry, distances: number[]) {
  const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(distances), 2, 1);
  geometry.setAttribute("instanceDistanceStart", new THREE.InterleavedBufferAttribute(buffer, 1, 0));
  geometry.setAttribute("instanceDistanceEnd", new THREE.InterleavedBufferAttribute(buffer, 1, 1));
}

function asVec(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function makeDocIcon(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);
  drawDocPage(ctx, 0, true);
  drawDocPage(ctx, 128, false);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function drawDocPage(ctx: CanvasRenderingContext2D, originX: number, withLines: boolean) {
  ctx.save();
  ctx.translate(originX, 0);
  roundRect(ctx, 24, 16, 80, 100, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(80, 16);
  ctx.lineTo(104, 40);
  ctx.lineTo(80, 40);
  ctx.closePath();
  ctx.fillStyle = "#d5dbe3";
  ctx.fill();
  if (withLines) {
    ctx.fillStyle = "#8b97a8";
    for (const y of [58, 72, 86]) {
      roundRect(ctx, 38, y, y === 86 ? 36 : 52, 6, 3);
      ctx.fill();
    }
  }
  ctx.restore();
}

function makeLinkText(size: number): Text {
  const text = new Text();
  text.font = fontUrl;
  text.fontSize = size;
  text.anchorX = "center" as unknown as number;
  text.anchorY = "middle" as unknown as number;
  text.color = 0xf4f7fb;
  text.outlineWidth = "8%" as unknown as number;
  text.outlineColor = 0x081018;
  text.visible = false;
  text.renderOrder = 4;
  text.frustumCulled = false;
  return text;
}

function makeRing(): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#ffe7a3";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.stroke();
  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 2;
  sprite.visible = false;
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
