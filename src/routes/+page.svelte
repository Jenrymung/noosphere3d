<script lang="ts">
  import { onMount } from "svelte";
  import "@fontsource/source-sans-3/400.css";
  import { createId } from "$lib/core/document";
  import { MapSession } from "$lib/core/session";
  import { linkLabel, nodeTitle } from "$lib/core/title";
  import type { MapDocument, Vec3 } from "$lib/core/types";
  import ReaderPanel from "$lib/editor/ReaderPanel.svelte";
  import { urbanFloodingDocument } from "$lib/io/sampleMap";
  import {
    createMindMapScene,
    type BenchRow,
    type HudSnapshot,
    type LabelDensity,
    type LabelMode,
  } from "$lib/scene/createScene";
  import { stressMap } from "$lib/scene/dummyMap";
  import { placeNode } from "$lib/scene/placement";

  type Target = { kind: "node" | "link"; id: string };
  type MapKind = "stress" | "sample" | "new";

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
    selectionKind: "none",
    selectedTitle: "Loading the map",
    operator: "",
    neighbours: 0,
    message: "",
    ready: false,
    status: "Starting",
    prepMs: null,
  });
  const openingSession = MapSession.load(stressMap());
  let session = $state(openingSession);
  let doc = $state(openingSession.doc);
  let revision = $state(0);
  let mapKind = $state<MapKind>("stress");
  let bench = $state<BenchRow[] | null>(null);
  let benching = $state(false);
  let panel = $state<"closed" | "read" | "edit">("closed");
  let pinned = $state(false);
  let editFromReader = $state(false);
  let shown = $state<Target | null>(null);
  let lastTypeId = "relates-to";
  let editToken = $state(0);
  let focusToken = $state(0);
  let editSeed = $state({ text: "", title: "", placeholder: "Untitled" });
  let scene: ReturnType<typeof createMindMapScene> | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingText: string | null = null;
  let pendingTitle: string | null = null;

  const canUndo = $derived.by(() => {
    revision;
    return session.history.canUndo;
  });
  const canRedo = $derived.by(() => {
    revision;
    return session.history.canRedo;
  });
  const modeLabel = $derived(hud.labelMode === "sdf" ? "SDF" : hud.labelMode === "css2d" ? "CSS2D" : "Off");

  function publish(next: HudSnapshot) {
    hud = next;
    session.selection = { nodeId: next.selectedId, linkId: next.selectedLinkId };
  }

  function focusScene() {
    queueMicrotask(() => scene?.focusCanvas());
  }

  function bump() {
    doc = session.doc;
    revision += 1;
  }

  function fail(error: unknown) {
    scene?.flash(error instanceof Error ? error.message : "That edit didn't apply");
  }

  function overlayFocused() {
    const active = document.activeElement;
    return Boolean(active?.closest?.("[data-editor-root]"));
  }

  function currentTarget(): Target | null {
    if (hud.selectedLinkId && session.doc.links[hud.selectedLinkId]) return { kind: "link", id: hud.selectedLinkId };
    if (hud.selectedId && session.doc.nodes[hud.selectedId]) return { kind: "node", id: hud.selectedId };
    return null;
  }

  function fieldsFor(target: Target) {
    if (target.kind === "node") {
      const node = session.doc.nodes[target.id];
      return {
        text: node?.text ?? "",
        title: node?.title ?? "",
        placeholder: node ? nodeTitle(node) || "Untitled" : "Untitled",
      };
    }
    const link = session.doc.links[target.id];
    const label = link ? linkLabel(link, session.doc.linkTypes[link.typeId]) : null;
    return {
      text: link?.text ?? "",
      title: link?.title ?? "",
      placeholder: label?.title || label?.typeLine || "Link",
    };
  }

  function flushEdit() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (!shown || (pendingText == null && pendingTitle == null)) return;
    const now = Date.now();
    const key = `edit:${shown.kind}:${shown.id}`;
    const target = shown;
    const text = pendingText;
    const title = pendingTitle;
    pendingText = null;
    pendingTitle = null;
    try {
      if (text != null) {
        session.dispatch({ type: "editText", target: target.kind, id: target.id, text }, { groupKey: key, now });
      }
      if (title != null) {
        session.dispatch(
          { type: "setTitle", target: target.kind, id: target.id, title: title.trim() ? title : null },
          { groupKey: key, now },
        );
      }
    } catch (error) {
      fail(error);
    }
    bump();
    scene?.sync(session.doc, "text");
  }

  function queueEdit() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flushEdit, 180);
  }

  function leaveEdit() {
    flushEdit();
    session.closeGroup();
  }

  function openReader(target: Target) {
    if (panel === "edit") leaveEdit();
    shown = target;
    editFromReader = false;
    panel = "read";
    focusToken += 1;
  }

  function beginEdit(fromReader: boolean) {
    const target = fromReader ? (shown ?? currentTarget()) : currentTarget();
    if (!target) {
      scene?.flash("Select a node or link to edit");
      return;
    }
    if (panel === "edit") leaveEdit();
    shown = target;
    editSeed = fieldsFor(target);
    editToken += 1;
    editFromReader = fromReader;
    panel = "edit";
  }

  function commitNavigate() {
    if (panel === "edit") leaveEdit();
    editFromReader = false;
    panel = pinned ? "read" : "closed";
    focusScene();
  }

  function handleEscape() {
    if (panel === "edit") {
      leaveEdit();
      if (editFromReader) {
        panel = "read";
        focusToken += 1;
      } else if (pinned) {
        panel = "read";
        focusScene();
      } else {
        panel = "closed";
        focusScene();
      }
      editFromReader = false;
      return true;
    }
    if (panel === "read" && !pinned) {
      panel = "closed";
      focusScene();
      return true;
    }
    if (panel === "read" && pinned && overlayFocused()) {
      focusScene();
      return true;
    }
    return false;
  }

  function togglePin() {
    pinned = !pinned;
    if (pinned) {
      if (panel === "edit") leaveEdit();
      shown = currentTarget();
      panel = "read";
      focusScene();
      return;
    }
    if (panel === "read") focusToken += 1;
  }

  function sameStructure(a: MapDocument, b: MapDocument) {
    const aNodes = Object.keys(a.nodes);
    if (aNodes.length !== Object.keys(b.nodes).length) return false;
    if (Object.keys(a.links).length !== Object.keys(b.links).length) return false;
    for (const id of aNodes) {
      const left = a.nodes[id]?.position;
      const right = b.nodes[id]?.position;
      if (!left || !right || left.x !== right.x || left.y !== right.y || left.z !== right.z) return false;
    }
    for (const id of Object.keys(a.links)) if (!b.links[id]) return false;
    return true;
  }

  function retargetPanel() {
    if (panel === "closed") return;
    const selection = session.selection;
    const target: Target | null =
      selection.linkId && session.doc.links[selection.linkId]
        ? { kind: "link", id: selection.linkId }
        : selection.nodeId && session.doc.nodes[selection.nodeId]
          ? { kind: "node", id: selection.nodeId }
          : null;
    if (!target) {
      shown = null;
      if (!pinned) panel = "closed";
      else panel = "read";
      return;
    }
    shown = target;
    if (panel === "edit") {
      editSeed = fieldsFor(target);
      editToken += 1;
    }
  }

  function undo() {
    if (panel === "edit") leaveEdit();
    const previous = session.doc;
    if (!session.undo()) {
      scene?.flash("Nothing to undo");
      return;
    }
    const kind = sameStructure(previous, session.doc) ? "text" : "structure";
    bump();
    scene?.sync(session.doc, kind);
    scene?.applySelection(session.selection);
    retargetPanel();
  }

  function redo() {
    if (panel === "edit") leaveEdit();
    const previous = session.doc;
    if (!session.redo()) {
      scene?.flash("Nothing to redo");
      return;
    }
    const kind = sameStructure(previous, session.doc) ? "text" : "structure";
    bump();
    scene?.sync(session.doc, kind);
    scene?.applySelection(session.selection);
    retargetPanel();
  }

  function createLinked() {
    if (panel === "edit") leaveEdit();
    const anchorId = scene?.anchorNodeId() ?? null;
    if (!anchorId || !session.doc.nodes[anchorId] || !scene) {
      scene?.flash("Select a node, then Tab to link a new one");
      return;
    }
    const id = createId();
    const linkId = createId();
    const position = placeNode(scene.placementContext(anchorId));
    const typeId = session.doc.linkTypes[lastTypeId] ? lastTypeId : (session.doc.settings.defaultLinkTypeId ?? "relates-to");
    const now = Date.now();
    const key = `tab:${id}`;
    try {
      session.dispatch({ type: "addNode", id, node: { text: "", position } }, { groupKey: key, now });
      session.dispatch(
        { type: "addLink", id: linkId, link: { source: anchorId, target: id, typeId, text: "" } },
        { groupKey: key, now },
      );
    } catch (error) {
      fail(error);
      return;
    }
    lastTypeId = typeId;
    bump();
    scene.sync(session.doc, "structure");
    scene.selectNode(id);
    shown = { kind: "node", id };
    editSeed = { text: "", title: "", placeholder: "Untitled" };
    editToken += 1;
    editFromReader = false;
    panel = "edit";
  }

  function createUnlinked() {
    if (panel === "edit") {
      commitNavigate();
      return;
    }
    if (!scene) return;
    const id = createId();
    const position = placeNode(scene.placementContext(null));
    try {
      session.dispatch({ type: "addNode", id, node: { text: "", position } });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene.sync(session.doc, "structure");
    scene.selectNode(id);
    shown = { kind: "node", id };
    editSeed = { text: "", title: "", placeholder: "Untitled" };
    editToken += 1;
    editFromReader = false;
    panel = "edit";
  }

  function deleteSelection() {
    if (panel === "edit") leaveEdit();
    const linkId = hud.selectedLinkId;
    const nodeId = hud.selectedId;
    try {
      if (linkId && session.doc.links[linkId]) session.dispatch({ type: "deleteLinks", ids: [linkId] });
      else if (nodeId && session.doc.nodes[nodeId]) session.dispatch({ type: "deleteNodes", ids: [nodeId] });
      else {
        scene?.flash("Nothing to delete");
        return;
      }
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "structure");
    scene?.applySelection(session.selection);
    retargetPanel();
  }

  function commitMove(id: string, position: Vec3) {
    try {
      session.dispatch({ type: "moveNodes", moves: [{ id, position }] });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "structure");
  }

  function resetChrome(nextKind: MapKind, next: MapSession) {
    if (panel === "edit") leaveEdit();
    session = next;
    doc = session.doc;
    revision += 1;
    mapKind = nextKind;
    panel = "closed";
    pinned = false;
    shown = null;
    editFromReader = false;
    lastTypeId = session.doc.settings.defaultLinkTypeId ?? "relates-to";
    bench = null;
    scene?.load(session.doc);
  }

  function chooseMap(id: "stress" | "sample") {
    resetChrome(id, MapSession.load(id === "stress" ? stressMap() : urbanFloodingDocument()));
  }

  function newMap() {
    resetChrome("new", MapSession.create({ title: "Untitled map" }));
  }

  function toggleMap() {
    chooseMap(mapKind === "sample" ? "stress" : "sample");
  }

  onMount(() => {
    if (!host) return;
    scene = createMindMapScene(host, session.doc, publish, () => toggleMap(), {
      isOverlayFocused: overlayFocused,
      handleEscape,
      openReader,
      editDirect: () => beginEdit(false),
      createLinked,
      createUnlinked,
      deleteSelection,
      undo,
      redo,
      togglePin,
      commitMove,
    });
    const api = {
      setLabelMode: (mode: LabelMode) => scene?.setLabelMode(mode),
      setDensity: (density: LabelDensity) => scene?.setDensity(density),
      setMap: (id: "stress" | "sample") => chooseMap(id),
      newMap: () => newMap(),
      undo: () => undo(),
      redo: () => redo(),
      frameAll: () => scene?.frameAll(),
      focus: () => scene?.focus(),
      setViewDistance: (distance: number) => scene?.setViewDistance(distance),
      runBench: () => scene?.runBench() ?? Promise.resolve([]),
      benchCase: (mode: LabelMode, density: LabelDensity, frame?: boolean) =>
        scene?.benchCase(mode, density, frame) ?? Promise.reject(new Error("scene not ready")),
      getHud: () => scene?.getHud() ?? hud,
      getPose: () => scene?.getPose() ?? { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      getDoc: () => ({
        title: session.doc.meta.title ?? "",
        panel,
        pinned,
        canUndo: session.history.canUndo,
        canRedo: session.history.canRedo,
        nodeIds: Object.keys(session.doc.nodes),
        linkIds: Object.keys(session.doc.links),
        nodes: session.doc.nodes,
        links: session.doc.links,
        selection: scene?.getSelection() ?? null,
      }),
      selectNode: (id: string | null) => scene?.selectNode(id),
      selectLink: (id: string) => scene?.selectLink(id),
      loadDocument: (next: MapDocument) => {
        session = MapSession.load(next);
        doc = session.doc;
        revision += 1;
        mapKind = "sample";
        scene?.load(session.doc);
      },
    };
    (window as unknown as { __mindmap?: typeof api }).__mindmap = api;
    return () => {
      scene?.dispose();
      scene = null;
    };
  });

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

  $effect(() => {
    if (!pinned || panel !== "read") return;
    hud.selectedId;
    hud.selectedLinkId;
    shown = currentTarget();
  });
</script>

<div class="app" class:reading={panel !== "closed"}>
  <div class="viewport" bind:this={host}></div>

  <header class="top" class:with-reader={panel !== "closed"}>
    <div class="brand">
      <span class="mark" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">3D Mind Map</p>
        <h1>{doc.meta.title || "Untitled map"}</h1>
      </div>
    </div>
    <p class="status" aria-live="polite">
      {hud.message || hud.status}
      {#if hud.prepMs != null}
        <span>· labels prepared in {hud.prepMs.toFixed(0)} ms</span>
      {/if}
    </p>
  </header>

  <aside class="tools">
    <div class="readout">
      <p class="kicker">Selected</p>
      <p class="title">{hud.selectedTitle}</p>
      <p class="meta">
        {#if hud.operator === "grab"}
          Grab
        {:else if hud.operator === "view"}
          View operator
        {:else if hud.selectionKind === "link"}
          Link
          {#if hud.selectedLinkId}
            · {hud.selectedLinkId}
          {/if}
        {:else if hud.selectionKind === "none"}
          Nothing selected
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
        <button type="button" class:on={mapKind === "new"} onclick={newMap}>New map</button>
        <button type="button" class:on={mapKind === "stress"} onclick={() => chooseMap("stress")}>2,304 nodes</button>
        <button type="button" class:on={mapKind === "sample"} onclick={() => chooseMap("sample")}>Flooding sample</button>
      </div>
    </div>

    <div class="group">
      <p class="kicker">Edit</p>
      <div class="row">
        <button type="button" onclick={undo} disabled={!canUndo}>Undo</button>
        <button type="button" onclick={redo} disabled={!canRedo}>Redo</button>
        <button type="button" onclick={deleteSelection}>Delete</button>
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

  {#if panel !== "closed"}
    <ReaderPanel
      {doc}
      {shown}
      mode={panel === "edit" ? "edit" : "read"}
      {pinned}
      {editToken}
      {focusToken}
      seedText={editSeed.text}
      seedTitle={editSeed.title}
      seedPlaceholder={editSeed.placeholder}
      onText={(value) => {
        pendingText = value;
        queueEdit();
      }}
      onTitle={(value) => {
        pendingTitle = value;
        queueEdit();
      }}
      onEscape={handleEscape}
      onCommit={commitNavigate}
      onEdit={() => beginEdit(true)}
      onPin={togglePin}
      onOpen={(target) => {
        if (target.kind === "link") scene?.selectLink(target.id);
        else scene?.selectNode(target.id);
        openReader(target);
      }}
      onUndo={undo}
      onRedo={redo}
    />
  {/if}

  <footer class="keys">
    <span><kbd>Arrows</kbd> select</span>
    <span><kbd>Enter</kbd> read</span>
    <span><kbd>E</kbd> edit</span>
    <span><kbd>Esc</kbd> step back</span>
    <span><kbd>Tab</kbd> new link</span>
    <span><kbd>Mod</kbd>+<kbd>Enter</kbd> new node</span>
    <span><kbd>G</kbd> grab</span>
    <span><kbd>Del</kbd> delete</span>
    <span><kbd>Mod</kbd>+<kbd>Z</kbd> undo</span>
    <span><kbd>[</kbd> <kbd>]</kbd> cycle</span>
    <span><kbd>V</kbd> view</span>
    <span><kbd>F</kbd> focus</span>
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
    outline: none;
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
  .tools,
  .keys {
    position: absolute;
    z-index: 2;
    pointer-events: none;
  }

  .top {
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .top.with-reader {
    right: 420px;
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
    max-width: 46vw;
    color: #c5d2e0;
    font-size: 14px;
  }

  .tools {
    pointer-events: auto;
    top: 78px;
    left: 16px;
    width: min(260px, calc(100vw - 32px));
    max-height: calc(100vh - 150px);
    overflow: auto;
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
    opacity: 0.45;
    cursor: default;
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
    .top,
    .top.with-reader {
      right: 16px;
      flex-direction: column;
    }

    .tools {
      top: auto;
      bottom: 52px;
      max-height: 34vh;
    }

    .reading .tools {
      display: none;
    }

    .keys {
      font-size: 12px;
    }
  }
</style>
