import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { BatchedText, Text } from "troika-three-text";
import fontUrl from "@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff?url";
import { LinkIndex, linksForPair, neighbours, sortedWaypoints } from "../core/graph";
import { nodeTitle } from "../core/title";
import type { Link, MapDocument, Vec3 } from "../core/types";
import {
  chooseDepthTarget,
  chooseSpatialTarget,
  type ArrowDirection,
  type SpatialCandidate,
} from "../input/spatial";

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
  selectedTitle: string;
  neighbours: number;
  message: string;
  ready: boolean;
  status: string;
  prepMs: number | null;
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

export interface MindMapScene {
  setLabelMode(mode: LabelMode): void;
  setDensity(density: LabelDensity): void;
  load(doc: MapDocument): void;
  focus(): void;
  frameAll(): void;
  setViewDistance(distance: number): void;
  runBench(): Promise<BenchRow[]>;
  benchCase(mode: LabelMode, density: LabelDensity, frame?: boolean): Promise<BenchRow>;
  getHud(): HudSnapshot;
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
  text: Text;
  css: CSS2DObject;
  card: HTMLDivElement;
}

export function createMindMapScene(
  host: HTMLElement,
  doc: MapDocument,
  onHud: (hud: HudSnapshot) => void,
  onToggleMap: () => void,
): MindMapScene {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
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

  let nodes: NodeView[] = [];
  let nodeIndex = new Map<string, number>();
  let linkIndex = LinkIndex.from(doc);
  let currentDoc = doc;
  let iconGeo: THREE.InstancedBufferGeometry | null = null;
  let iconMat: THREE.ShaderMaterial | null = null;
  let iconMesh: THREE.Mesh | null = null;
  let colorAttr: THREE.InstancedBufferAttribute | null = null;
  let scaleAttr: THREE.InstancedBufferAttribute | null = null;
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

  const tmp = new THREE.Vector3();
  const forward = new THREE.Vector3();

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
  }

  function clearWorld() {
    if (iconMesh) {
      scene.remove(iconMesh);
      iconGeo?.dispose();
      iconMat?.dispose();
      iconMesh = null;
    }
    for (const object of linkObjects) {
      scene.remove(object);
      const mesh = object as LineSegments2 & { geometry: THREE.BufferGeometry; material: THREE.Material };
      mesh.geometry?.dispose();
      mesh.material?.dispose?.();
    }
    linkObjects.length = 0;
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

  function load(next: MapDocument) {
    currentDoc = next;
    linkIndex = LinkIndex.from(next);
    clearWorld();
    ready = false;
    prepMs = null;
    status = "Building icons and links";
    buildNodes(next);
    buildLinks(next);
    selectedId = next.nodes["n-flood"]
      ? "n-flood"
      : next.nodes["s2-3-3-2"]
        ? "s2-3-3-2"
        : (Object.keys(next.nodes)[0] ?? null);
    rememberNeighbours();
    applySelectionVisual();
    if (next.view?.camera) {
      camera.position.set(next.view.camera.position.x, next.view.camera.position.y, next.view.camera.position.z);
      controls.target.set(next.view.camera.target.x, next.view.camera.target.y, next.view.camera.target.z);
      if (next.view.camera.fov) camera.fov = next.view.camera.fov;
      camera.updateProjectionMatrix();
    } else if (selectedId && next.nodes[selectedId]) {
      const position = next.nodes[selectedId].position;
      controls.target.set(position.x, position.y, position.z);
      camera.position.set(position.x + 7, position.y + 5, position.z + 9);
    } else {
      frameAll(true);
    }
    status = labelMode === "off" ? "Icons only" : "Preparing labels";
    const started = performance.now();
    buildLabels(next, () => {
      prepMs = performance.now() - started;
      ready = true;
      status = "Ready";
      publish();
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
      nodeIndex.set(id, index);
    });
    iconGeo.setAttribute("iOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    scaleAttr = new THREE.InstancedBufferAttribute(scales, 1);
    iconGeo.setAttribute("iColor", colorAttr);
    iconGeo.setAttribute("iScale", scaleAttr);
    iconGeo.instanceCount = count;
    iconMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: iconTexture } },
      vertexShader: `
        attribute vec3 iOffset;
        attribute vec3 iColor;
        attribute float iScale;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = iColor;
          vec4 view = modelViewMatrix * vec4(iOffset, 1.0);
          view.xy += position.xy * iScale;
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
    const buckets = new Map<string, number[]>();
    const arrows = new Map<string, THREE.Matrix4[]>();
    for (const [id, link] of Object.entries(map.links)) {
      const filter = map.view?.linkTypeFilters?.[link.typeId] ?? "shown";
      if (filter === "hidden") continue;
      const points = routePoints(map, linkIndex, id, link);
      const bucket = buckets.get(link.typeId) ?? [];
      for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        if (start.distanceToSquared(end) < 1e-6) continue;
        bucket.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
      buckets.set(link.typeId, bucket);
      const type = map.linkTypes[link.typeId];
      if (!type || type.direction === "undirected" || points.length < 2) continue;
      const matrices = arrows.get(link.typeId) ?? [];
      pushArrow(matrices, points[points.length - 2], points[points.length - 1]);
      if (type.direction === "bidirectional") pushArrow(matrices, points[1], points[0]);
      arrows.set(link.typeId, matrices);
    }
    const widthPx = host.clientWidth || 1;
    const heightPx = host.clientHeight || 1;
    for (const [typeId, positions] of buckets) {
      if (positions.length === 0) continue;
      const type = map.linkTypes[typeId];
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
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
      lines.computeLineDistances();
      lines.renderOrder = 1;
      scene.add(lines);
      linkObjects.push(lines);
    }
    for (const [typeId, matrices] of arrows) {
      if (matrices.length === 0) continue;
      const type = map.linkTypes[typeId];
      const geometry = new THREE.ConeGeometry(0.09, 0.28, 7);
      geometry.translate(0, -0.14, 0);
      const material = new THREE.MeshBasicMaterial({
        color: type?.color ?? "#999999",
        transparent: true,
        opacity: map.view?.linkTypeFilters?.[typeId] === "dimmed" ? 0.28 : 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.renderOrder = 1;
      scene.add(mesh);
      linkObjects.push(mesh);
    }
  }

  function buildLabels(map: MapDocument, done: () => void) {
    const ids = Object.keys(map.nodes).sort();
    batch = new BatchedText();
    batch.renderOrder = 3;
    scene.add(batch);
    for (const id of ids) {
      const node = map.nodes[id];
      const title = nodeTitle(node) || "Untitled";
      const position = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      const scale = node.style?.size ?? 0.8;
      const text = new Text();
      text.text = title;
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
      card.textContent = title;
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
      const selected = node.id === selectedId;
      const color = node.base.clone();
      if (selected) color.lerp(new THREE.Color("#ffe7a3"), 0.55);
      colorAttr!.setXYZ(index, color.r, color.g, color.b);
      scaleAttr!.setX(index, selected ? node.scale * 1.45 : node.scale);
      node.card.classList.toggle("is-selected", selected);
    });
    colorAttr.needsUpdate = true;
    scaleAttr.needsUpdate = true;
    const selected = nodes.find((node) => node.id === selectedId);
    if (selected) {
      ring.position.copy(selected.position);
      ring.scale.setScalar(selected.scale * 1.7);
      ring.visible = true;
    } else {
      ring.visible = false;
    }
  }

  function select(id: string | null, fromArrow: ArrowDirection | null) {
    if (fromArrow && selectedId && id && id !== selectedId) lastSpatial = { fromId: selectedId, direction: fromArrow };
    else if (!fromArrow) lastSpatial = null;
    selectedId = id;
    rememberNeighbours();
    applySelectionVisual();
    if (id) {
      const node = nodes.find((item) => item.id === id);
      if (node) nudgeIntoView(node.position);
    }
    publish();
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
    const candidates: SpatialCandidate[] = [];
    for (const node of nodes) {
      if (node.id === selectedId) continue;
      const screen = screenOf(node.position);
      if (!screen || screen.behind) continue;
      candidates.push({
        id: node.id,
        screen: { x: screen.x, y: screen.y, depth: screen.depth },
        linked: neighbourIds.has(node.id),
      });
    }
    const result = chooseSpatialTarget({
      currentId: selectedId,
      current: { x: currentScreen.x, y: currentScreen.y, depth: currentScreen.depth },
      candidates,
      direction,
      previousId: lastSpatial?.fromId,
      previousDirection: lastSpatial?.direction,
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
    const candidates: SpatialCandidate[] = [];
    for (const node of nodes) {
      if (node.id === selectedId) continue;
      const screen = screenOf(node.position);
      if (!screen || screen.behind) continue;
      candidates.push({ id: node.id, screen });
    }
    const next = chooseDepthTarget(currentScreen, candidates, sense);
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
  }

  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    const next = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    offset.setLength(next);
    camera.position.copy(controls.target).add(offset);
  }

  function focus() {
    const selected = nodes.find((node) => node.id === selectedId);
    if (!selected) return;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) offset.set(0.4, 0.35, 1);
    offset.setLength(7.5);
    animateCamera(selected.position.clone().add(offset), selected.position.clone());
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
    if (immediate || reduceMotion) {
      controls.target.copy(sphere.center);
      camera.position.copy(position);
      focusAnim = null;
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
  }

  function animateCamera(position: THREE.Vector3, target: THREE.Vector3) {
    if (reduceMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      focusAnim = null;
      return;
    }
    focusAnim = {
      fromP: camera.position.clone(),
      toP: position,
      fromT: controls.target.clone(),
      toT: target,
      t: 0,
    };
  }

  function nudgeIntoView(position: THREE.Vector3) {
    const ndc = position.clone().project(camera);
    if (ndc.z < -1 || ndc.z > 1) {
      focus();
      return;
    }
    const margin = 0.74;
    let sx = 0;
    let sy = 0;
    if (ndc.x > margin) sx = ndc.x - margin;
    else if (ndc.x < -margin) sx = ndc.x + margin;
    if (ndc.y > margin) sy = ndc.y - margin;
    else if (ndc.y < -margin) sy = ndc.y + margin;
    if (sx === 0 && sy === 0) return;
    const dist = Math.max(camera.position.distanceTo(position), 1);
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
    void width;
  }

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: { id: string; dist: number } | null = null;
    for (const node of nodes) {
      const ndc = node.position.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1) continue;
      const sx = (ndc.x * 0.5 + 0.5) * rect.width;
      const sy = (-ndc.y * 0.5 + 0.5) * rect.height;
      const dist = Math.hypot(sx - x, sy - y);
      if (dist < 22 && (!best || dist < best.dist)) best = { id: node.id, dist };
    }
    if (best) select(best.id, null);
  }

  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const arrow =
      event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown";
    if (arrow) {
      event.preventDefault();
      const direction = (
        { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const
      )[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
      if (event.shiftKey) orbitStep(direction);
      else if ((event.ctrlKey || event.metaKey) && (direction === "up" || direction === "down")) {
        navigateDepth(direction === "up" ? "closer" : "further");
      } else if (!event.altKey && !event.ctrlKey && !event.metaKey) navigate(direction);
      return;
    }
    if (event.code === "Minus" || event.code === "NumpadSubtract") {
      event.preventDefault();
      zoom(1.12);
    } else if (event.code === "Equal" || event.code === "NumpadAdd") {
      event.preventDefault();
      zoom(0.88);
    } else if (event.code === "KeyF" && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) frameAll();
      else focus();
    } else if (event.code === "Digit1") setLabelMode("sdf");
    else if (event.code === "Digit2") setLabelMode("css2d");
    else if (event.code === "Digit0") setLabelMode("off");
    else if (event.code === "Digit9") setDensity(density === "all" ? "nearby" : "all");
    else if (event.code === "KeyM" && !event.shiftKey && !event.altKey) onToggleMap();
  }

  function setLabelMode(mode: LabelMode) {
    labelMode = mode;
    status = mode === "off" ? "Icons only" : mode === "sdf" ? "SDF labels" : "CSS2D labels";
    publish();
  }

  function setDensity(next: LabelDensity) {
    density = next;
    publish();
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
      selectedTitle: nodes.find((node) => node.id === selectedId)?.title ?? "Nothing selected",
      neighbours: neighbourIds.size,
      message: performance.now() < messageUntil ? message : "",
      ready,
      status,
      prepMs,
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
    raf = requestAnimationFrame(tick);
    const dt = now - lastStamp;
    lastStamp = now;
    if (dt > 0 && dt < 8000) {
      frameTimes.push(dt);
      if (frameTimes.length > 180) frameTimes.shift();
    }
    if (focusAnim) {
      focusAnim.t += reduceMotion ? 1 : dt / 280;
      const t = ease(Math.min(1, focusAnim.t));
      camera.position.lerpVectors(focusAnim.fromP, focusAnim.toP, t);
      controls.target.lerpVectors(focusAnim.fromT, focusAnim.toT, t);
      if (focusAnim.t >= 1) focusAnim = null;
    }
    if (autoOrbit > 0) {
      autoOrbit -= 1;
      orbitStep("right");
    }
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
    if (labelMode === "css2d") cssRenderer.render(scene, camera);
    if (now - hudTimer > 250) {
      hudTimer = now;
      publish();
    }
  }

  function onPointerDown(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY, moved: false };
  }
  function onPointerMove(event: PointerEvent) {
    if (!pointer) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
  }
  function onPointerUp(event: PointerEvent) {
    if (pointer && !pointer.moved && event.button === 0) pick(event);
    pointer = null;
  }

  resize();
  load(doc);
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  raf = requestAnimationFrame(tick);

  return {
    setLabelMode,
    setDensity,
    load,
    focus,
    frameAll: () => frameAll(false),
    setViewDistance,
    runBench,
    benchCase,
    getHud,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKey);
      controls.dispose();
      clearWorld();
      iconTexture.dispose();
      renderer.dispose();
      cssRenderer.domElement.remove();
      canvas.remove();
    },
  };
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function pushArrow(matrices: THREE.Matrix4[], from: THREE.Vector3, to: THREE.Vector3) {
  const direction = to.clone().sub(from);
  if (direction.lengthSq() < 1e-6) return;
  direction.normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const position = to.clone().addScaledVector(direction, -0.42);
  const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  matrices.push(matrix);
}

function routePoints(doc: MapDocument, index: LinkIndex, linkId: string, link: Link): THREE.Vector3[] {
  const source = asVec(doc.nodes[link.source].position);
  const target = asVec(doc.nodes[link.target].position);
  if (link.source === link.target) {
    const points: THREE.Vector3[] = [];
    const radius = 0.55;
    for (let i = 0; i <= 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      points.push(new THREE.Vector3(source.x + 0.85 + Math.cos(angle) * radius, source.y + Math.sin(angle) * radius, source.z));
    }
    return points;
  }
  const waypoints = sortedWaypoints(link).map((entry) => asVec(entry.waypoint.position));
  if (waypoints.length > 0) return [source, ...waypoints, target];
  const pair = linksForPair(index, link.source, link.target);
  const fanCount = pair.length;
  const fanIndex = Math.max(0, pair.indexOf(linkId));
  const lateral = (fanCount > 1 ? (fanIndex - (fanCount - 1) / 2) * 0.38 : 0) + (link.style?.bow ?? 0);
  if (Math.abs(lateral) < 1e-4) return [source, target];
  const mid = source.clone().add(target).multiplyScalar(0.5);
  const side = new THREE.Vector3().crossVectors(target.clone().sub(source), new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-8) side.crossVectors(target.clone().sub(source), new THREE.Vector3(1, 0, 0));
  mid.add(side.normalize().multiplyScalar(lateral));
  return [source, mid, target];
}

function asVec(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function makeDocIcon(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
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
  ctx.fillStyle = "#8b97a8";
  for (const y of [58, 72, 86]) {
    roundRect(ctx, 38, y, y === 86 ? 36 : 52, 6, 3);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
