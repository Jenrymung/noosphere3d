<script lang="ts">
  import { onMount } from "svelte";
  import "@fontsource/source-sans-3/400.css";
  import { createMindMapScene, type BenchRow, type HudSnapshot, type LabelDensity, type LabelMode } from "$lib/scene/createScene";
  import { stressMap } from "$lib/scene/dummyMap";
  import { urbanFloodingDocument } from "$lib/io/sampleMap";
  import type { MapDocument } from "$lib/core/types";

  let host = $state<HTMLDivElement | null>(null);
  let hud = $state<HudSnapshot>({
    fps: 0,
    avgMs: 0,
    p95Ms: 0,
    nodes: 0,
    links: 0,
    visibleLabels: 0,
    labelMode: "sdf",
    density: "nearby",
    selectedId: null,
    selectedLinkId: null,
    selectionKind: "node",
    selectedTitle: "Loading the map",
    operator: "",
    neighbours: 0,
    message: "",
    ready: false,
    status: "Starting",
    prepMs: null,
  });
  let mapId = $state<"stress" | "sample">("stress");
  let bench = $state<BenchRow[] | null>(null);
  let benching = $state(false);
  let scene: ReturnType<typeof createMindMapScene> | null = null;

  const maps: Record<"stress" | "sample", { name: string; doc: MapDocument }> = {
    stress: { name: "Stress web", doc: stressMap() },
    sample: { name: "Urban flooding", doc: urbanFloodingDocument() },
  };

  function publish(next: HudSnapshot) {
    hud = next;
  }

  onMount(() => {
    if (!host) return;
    scene = createMindMapScene(host, maps.stress.doc, publish, () => toggleMap());
    const api = {
      setLabelMode: (mode: LabelMode) => scene?.setLabelMode(mode),
      setDensity: (density: LabelDensity) => scene?.setDensity(density),
      setMap: (id: "stress" | "sample") => chooseMap(id),
      frameAll: () => scene?.frameAll(),
      focus: () => scene?.focus(),
      setViewDistance: (distance: number) => scene?.setViewDistance(distance),
      runBench: () => scene?.runBench() ?? Promise.resolve([]),
      benchCase: (mode: LabelMode, density: LabelDensity, frame?: boolean) =>
        scene?.benchCase(mode, density, frame) ?? Promise.reject(new Error("scene not ready")),
      getHud: () => scene?.getHud() ?? hud,
      getPose: () => scene?.getPose() ?? { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      loadDocument: (doc: MapDocument) => scene?.load(doc),
    };
    (window as unknown as { __mindmap?: typeof api }).__mindmap = api;
    return () => {
      scene?.dispose();
      scene = null;
    };
  });

  function chooseMap(id: "stress" | "sample") {
    mapId = id;
    bench = null;
    scene?.load(maps[id].doc);
  }

  function toggleMap() {
    chooseMap(mapId === "stress" ? "sample" : "stress");
  }

  function setMode(mode: LabelMode) {
    scene?.setLabelMode(mode);
  }

  function setDensity(density: LabelDensity) {
    scene?.setDensity(density);
  }

  async function measure() {
    if (!scene || benching) return;
    benching = true;
    bench = null;
    try {
      bench = await scene.runBench();
    } finally {
      benching = false;
    }
  }

  const modeLabel = $derived(hud.labelMode === "sdf" ? "SDF" : hud.labelMode === "css2d" ? "CSS2D" : "Off");
</script>

<div class="app">
  <div class="viewport" bind:this={host}></div>

  <header class="top">
    <div class="brand">
      <span class="mark" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">3D Mind Map</p>
        <h1>{maps[mapId].name}</h1>
      </div>
    </div>
    <p class="status" aria-live="polite">
      {hud.message || hud.status}
      {#if hud.prepMs != null}
        <span>· labels prepared in {hud.prepMs.toFixed(0)} ms</span>
      {/if}
    </p>
  </header>

  <aside class="panel">
    <div class="readout">
      <p class="kicker">Selected</p>
      <p class="title">{hud.selectedTitle}</p>
      <p class="meta">
        {#if hud.operator === "view"}
          View operator
        {:else if hud.selectionKind === "link"}
          Link
          {#if hud.selectedLinkId}
            · {hud.selectedLinkId}
          {/if}
        {:else}
          {hud.neighbours} linked
          {#if hud.selectedId}
            · {hud.selectedId}
          {/if}
        {/if}
      </p>
    </div>

    <div class="group">
      <p class="kicker">Map</p>
      <div class="row">
        <button type="button" class:on={mapId === "stress"} onclick={() => chooseMap("stress")}>
          2,304 nodes
        </button>
        <button type="button" class:on={mapId === "sample"} onclick={() => chooseMap("sample")}>Flooding sample</button>
      </div>
    </div>

    <div class="group">
      <p class="kicker">Labels</p>
      <div class="row">
        <button type="button" class:on={hud.labelMode === "sdf"} onclick={() => setMode("sdf")}>SDF</button>
        <button type="button" class:on={hud.labelMode === "css2d"} onclick={() => setMode("css2d")}>CSS2D</button>
        <button type="button" class:on={hud.labelMode === "off"} onclick={() => setMode("off")}>Icons</button>
      </div>
      <div class="row">
        <button type="button" class:on={hud.density === "nearby"} onclick={() => setDensity("nearby")}>Nearby</button>
        <button type="button" class:on={hud.density === "all"} onclick={() => setDensity("all")}>All titles</button>
      </div>
    </div>

    <dl class="stats">
      <div>
        <dt>Frame</dt>
        <dd>{hud.avgMs.toFixed(1)} ms</dd>
      </div>
      <div>
        <dt>p95</dt>
        <dd>{hud.p95Ms.toFixed(1)} ms</dd>
      </div>
      <div>
        <dt>fps</dt>
        <dd>{hud.fps.toFixed(0)}</dd>
      </div>
      <div>
        <dt>Labels</dt>
        <dd>{hud.visibleLabels}</dd>
      </div>
    </dl>
    <p class="fine">
      {hud.nodes.toLocaleString()} nodes · {hud.links.toLocaleString()} links · {modeLabel}
      {hud.density === "all" ? "· every title in front of the camera" : "· nearby titles only"}
    </p>

    <button type="button" class="measure" onclick={measure} disabled={benching || !hud.ready}>
      {benching ? "Orbiting to measure…" : "Measure orbit"}
    </button>
    {#if bench}
      <table>
        <thead>
          <tr><th>Labels</th><th>Density</th><th>Median</th><th>p95</th></tr>
        </thead>
        <tbody>
          {#each bench as row}
            <tr>
              <td>{row.mode}</td>
              <td>{row.density}</td>
              <td>{row.medianMs.toFixed(1)} ms</td>
              <td>{row.p95Ms.toFixed(1)} ms</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </aside>

  <footer class="keys">
    <span><kbd>Arrows</kbd> select</span>
    <span><kbd>[</kbd> <kbd>]</kbd> cycle links</span>
    <span><kbd>B</kbd> back</span>
    <span><kbd>Shift</kbd>+<kbd>B</kbd> forward</span>
    <span><kbd>Shift</kbd>+<kbd>Arrows</kbd> orbit</span>
    <span><kbd>Alt</kbd>+<kbd>Arrows</kbd> pan</span>
    <span><kbd>=</kbd> <kbd>-</kbd> zoom</span>
    <span><kbd>F</kbd> focus</span>
    <span><kbd>Home</kbd> frame</span>
    <span><kbd>V</kbd> view</span>
    <span><kbd>Ctrl</kbd>+<kbd>↑</kbd><kbd>↓</kbd> depth</span>
  </footer>

  <p class="live" aria-live="polite">{hud.selectedTitle}</p>
</div>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    background: #101820;
    color: #e7eef6;
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
  }

  :global(.scene-canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  :global(.css2d-layer) {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  :global(.label-anchor) {
    pointer-events: none;
  }

  :global(.label-card) {
    transform: translate(-50%, calc(-100% - 8px));
    padding: 1px 6px 2px;
    border-radius: 4px;
    background: rgba(8, 14, 22, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #f4f7fb;
    font-family: "Source Sans 3", "Segoe UI", sans-serif;
    font-weight: 560;
    line-height: 1.25;
    white-space: pre-line;
    text-shadow: none;
  }

  :global(.label-card.is-selected) {
    background: rgba(48, 36, 12, 0.9);
    border-color: #ffe7a3;
    color: #fff6dc;
  }

  .app {
    position: relative;
    height: 100vh;
    overflow: hidden;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .top,
  .panel,
  .keys {
    position: absolute;
    z-index: 2;
    pointer-events: none;
  }

  .top {
    top: 16px;
    left: 16px;
    right: 280px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .brand {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .mark {
    width: 14px;
    height: 18px;
    border-radius: 2px;
    background: linear-gradient(#f4f7fb, #f4f7fb) 0 0 / 100% 70% no-repeat,
      linear-gradient(#9bb0c4, #9bb0c4) 100% 0 / 6px 6px no-repeat,
      #d5dbe3;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
  }

  .eyebrow {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #93a4b8;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .status {
    margin: 4px 0 0;
    color: #c5d2e0;
    font-size: 14px;
  }

  .panel {
    pointer-events: auto;
    top: 16px;
    right: 16px;
    width: min(280px, calc(100vw - 32px));
    padding: 14px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  }

  .readout {
    margin-bottom: 12px;
  }

  .kicker {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8ea0b5;
  }

  .title {
    margin: 0;
    font-size: 18px;
    font-weight: 650;
    line-height: 1.25;
  }

  .meta,
  .fine {
    margin: 4px 0 0;
    color: #9aabbd;
    font-size: 13px;
  }

  .group {
    margin-top: 12px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    pointer-events: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e7eef6;
    border-radius: 999px;
    padding: 5px 10px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  button.on,
  button:hover {
    border-color: #e2b657;
    color: #fff6dc;
  }

  button:disabled {
    opacity: 0.55;
    cursor: progress;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 14px 0 0;
  }

  .stats div {
    min-width: 0;
  }

  dt {
    color: #8ea0b5;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  dd {
    margin: 2px 0 0;
    font-variant-numeric: tabular-nums;
    font-size: 16px;
  }

  .measure {
    margin-top: 12px;
    border-radius: 8px;
    width: 100%;
  }

  table {
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    text-align: left;
    padding: 3px 4px 3px 0;
    color: #d5e0ec;
  }

  th {
    color: #8ea0b5;
    font-weight: 600;
  }

  .keys {
    left: 16px;
    right: 16px;
    bottom: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    color: #b7c6d6;
    font-size: 13px;
  }

  kbd {
    font-family: inherit;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 4px;
    background: rgba(8, 12, 18, 0.55);
  }

  .live {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  @media (max-width: 720px) {
    .top {
      right: 16px;
      flex-direction: column;
    }

    .panel {
      top: auto;
      bottom: 52px;
      max-height: 42vh;
      overflow: auto;
    }

    .keys {
      font-size: 12px;
    }
  }
</style>
