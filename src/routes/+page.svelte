<script lang="ts">
  import { onMount } from "svelte";
  import { produce } from "immer";
  import "@fontsource/source-sans-3/400.css";
  import { freshTrack, markEdited, markSaved, promptFor, resolveTheme, statusFor, ensureSuffix, tabTitle, windowTitle, type SaveTrack } from "$lib/app/tabState";
  import { createId } from "$lib/core/document";
  import { MapSession } from "$lib/core/session";
  import { liveAnnouncement } from "$lib/a11y/announce";
  import { neighbourhoodTree } from "$lib/a11y/tree";
  import { linkLabel, nodeTitle } from "$lib/core/title";
  import type { LinkTypeFilter, MapDocument, Vec3 } from "$lib/core/types";
  import ReaderPanel from "$lib/editor/ReaderPanel.svelte";
  import type { TypeDraft } from "$lib/input/linkForm";
  import { linkPointerConfirm } from "$lib/input/linkClick";
  import { statusHint, type HintMode } from "$lib/input/hints";
  import { bindingById, helpSections, matchesChord } from "$lib/input/keymap";
  import { modEnterAction } from "$lib/input/modEnter";
  import { PALETTE_COMMANDS, type PaletteHit } from "$lib/input/palette";
  import { cycleRegion, type RegionId } from "$lib/input/regions";
  import {
    cycleTypeId,
    cycleTypedLink,
    deleteTypeCommands,
    filterSummary,
    followVisible,
    freshType,
    linkCommit,
    shiftedOrder,
    soloFilters,
    toggleShownHidden,
    typeIdForDigit,
    typeRows,
    withFilter,
  } from "$lib/input/linkOps";
  import { RELEASES_PAGE_URL, openReleasesPage } from "$lib/about/releases";
  import { createFileBridge, createMemoryBridge, type FileBridge, type RecoveryItem } from "$lib/io/bridge";
  import { BROWSER_ERROR_LOG_KEY, installErrorLog } from "$lib/io/errorLog";
  import { DEFAULT_PREFERENCES, normalizePreferences, type Preferences } from "$lib/io/preferences";
  import { urbanFloodingDocument } from "$lib/io/sampleMap";
  import { serialize } from "$lib/io/serialize";
  import { shouldAutosave, shouldRotateBackup, shouldWriteRecovery } from "$lib/io/saveController";
  import {
    createMindMapScene,
    type BenchRow,
    type HudSnapshot,
    type LabelDensity,
    type LabelMode,
  } from "$lib/scene/createScene";
  import { stressMap } from "$lib/scene/dummyMap";
  import { placeNode } from "$lib/scene/placement";
  import AboutPanel from "$lib/ui/AboutPanel.svelte";
  import FileDialogs, { type AppDialog } from "$lib/ui/FileDialogs.svelte";
  import HelpSheet from "$lib/ui/HelpSheet.svelte";
  import LinkChrome from "$lib/ui/LinkChrome.svelte";
  import Palette from "$lib/ui/Palette.svelte";
  import PreferencesPanel from "$lib/ui/PreferencesPanel.svelte";
  import TabStrip from "$lib/ui/TabStrip.svelte";

  type Target = { kind: "node" | "link"; id: string };
  type MapKind = "stress" | "sample" | "new";
  type Overlay =
    | { name: "picker"; purpose: "new-link" | "shift-tab" | "retarget" }
    | { name: "legend" }
    | { name: "manager" }
    | { name: "search" }
    | { name: "follow" };

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
  type Chrome = {
    panel: "closed" | "read" | "edit";
    pinned: boolean;
    shown: Target | null;
    editFromReader: boolean;
    lastTypeId: string;
    linkMode: { sourceId: string; targetId: string | null; typeId: string | null } | null;
    screen: Overlay | null;
    activeTypeId: string | null;
    mapKind: MapKind;
    pose: { position: Vec3; target: Vec3 } | null;
  };
  type ShelfEntry = { session: MapSession; chrome: Chrome };
  type ClosedTab = ShelfEntry & { save: SaveTrack };

  function makeBlank(): MapSession {
    const next = MapSession.create({ title: "Untitled map" });
    const id = createId();
    next.dispatch({ type: "addNode", id, node: { text: "", position: { x: 0, y: 0, z: 0 } } });
    next.selection = { nodeId: id, linkId: null };
    return next;
  }

  const shelf = new Map<string, ShelfEntry>();
  const saves = new Map<string, SaveTrack>();
  const closedStack: ClosedTab[] = [];
  const openingSession = makeBlank();
  const openingId = createId();
  saves.set(openingId, freshTrack(openingId, { edited: true }));
  let session = $state(openingSession);
  let activeId = $state(openingId);
  let tabOrder = $state<string[]>([openingId]);
  let pulse = $state(0);
  let preferences = $state({ ...DEFAULT_PREFERENCES });
  let prefsOpen = $state(false);
  let paletteOpen = $state(false);
  let helpOpen = $state(false);
  let aboutOpen = $state(false);
  let errorLogPath = $state(`browser-storage:${BROWSER_ERROR_LOG_KEY}`);
  let liveText = $state("");
  let focusBack: HTMLElement | null = null;
  let dialogWasOpen = false;
  let dialog = $state<AppDialog | null>(null);
  let bridge: FileBridge = createMemoryBridge();
  let doc = $state(openingSession.doc);
  let revision = $state(0);
  let mapKind = $state<MapKind>("new");
  let bench = $state<BenchRow[] | null>(null);
  let benching = $state(false);
  let panel = $state<"closed" | "read" | "edit">("closed");
  let pinned = $state(false);
  let editFromReader = $state(false);
  let shown = $state<Target | null>(null);
  let lastTypeId = $state("relates-to");
  let editToken = $state(0);
  let focusToken = $state(0);
  let editSeed = $state({ text: "", title: "", placeholder: "Untitled" });
  let scene: ReturnType<typeof createMindMapScene> | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingText: string | null = null;
  let pendingTitle: string | null = null;
  let linkMode = $state<{ sourceId: string; targetId: string | null; typeId: string | null } | null>(null);
  let screen = $state<Overlay | null>(null);
  let followRows = $state<{ key: string; label: string; nodeId: string }[]>([]);
  let activeTypeId = $state<string | null>(null);
  let pendingClose: string | null = null;
  let closeQueue: string[] = [];
  let quitAfterClose = false;
  let quitting = false;
  let pathWait: ((path: string | null) => void) | null = null;

  const canUndo = $derived.by(() => {
    revision;
    return session.history.canUndo;
  });
  const canRedo = $derived.by(() => {
    revision;
    return session.history.canRedo;
  });
  const modeLabel = $derived(hud.labelMode === "sdf" ? "SDF" : hud.labelMode === "css2d" ? "CSS2D" : "Off");
  const rows = $derived.by(() => {
    revision;
    return typeRows(session.doc);
  });
  const filterLabel = $derived.by(() => {
    revision;
    return filterSummary(session.doc.view?.linkTypeFilters);
  });
  const nodeChoices = $derived.by(() => {
    revision;
    return Object.entries(session.doc.nodes).map(([id, node]) => ({
      id,
      title: nodeTitle(node) || "Untitled",
    }));
  });
  const defaultTypeId = $derived.by(() => {
    revision;
    return session.doc.settings.defaultLinkTypeId ?? rows[0]?.id ?? "relates-to";
  });
  const filters = $derived.by(() => {
    revision;
    return session.doc.view?.linkTypeFilters ?? {};
  });
  const strip = $derived.by(() => {
    pulse;
    revision;
    preferences.saveMode;
    return tabOrder.map((id) => {
      const sess = id === activeId ? session : shelf.get(id)?.session;
      const track = saves.get(id);
      const status = track && sess ? statusFor(track, preferences, sess.history.stateId) : { mark: "", text: "" };
      return { id, title: tabTitle(sess?.doc.meta.title), mark: status.mark };
    });
  });
  const fileStatus = $derived.by(() => {
    pulse;
    revision;
    preferences.saveMode;
    const track = saves.get(activeId);
    return track ? statusFor(track, preferences, session.history.stateId).text : "";
  });
  const modeHint = $derived.by(() => {
    linkMode;
    panel;
    hud.operator;
    return statusHint(hintMode());
  });
  const tree = $derived.by(() => {
    revision;
    hud.selectedId;
    return neighbourhoodTree(session.doc, session.index, hud.selectedId);
  });
  const paletteNodes = $derived.by(() => {
    revision;
    return Object.entries(session.doc.nodes).map(([id, node]) => ({
      id,
      title: nodeTitle(node) || "Untitled",
      text: node.text,
    }));
  });
  const shortcutSections = helpSections();

  function publish(next: HudSnapshot) {
    hud = next;
    session.selection = { nodeId: next.selectedId, linkId: next.selectedLinkId };
  }

  function focusScene() {
    queueMicrotask(() => scene?.focusCanvas());
  }

  function touch() {
    pulse += 1;
  }

  function sessionFor(id: string): MapSession | null {
    if (id === activeId) return session;
    return shelf.get(id)?.session ?? null;
  }

  function poseFor(id: string): { position: Vec3; target: Vec3 } | null {
    if (id === activeId) return scene?.getPose() ?? null;
    return shelf.get(id)?.chrome.pose ?? null;
  }

  function snapshotText(sess: MapSession, pose: { position: Vec3; target: Vec3 } | null): string {
    const copy = produce(sess.doc, (draft) => {
      if (!pose) return;
      draft.view ??= {};
      draft.view.camera = { position: { ...pose.position }, target: { ...pose.target } };
    });
    return serialize(copy);
  }

  function noteEdit() {
    const track = saves.get(activeId);
    if (!track) return;
    markEdited(track, session.history.stateId, Date.now());
    touch();
    void refreshTitle();
  }

  function bump(edited = true) {
    doc = session.doc;
    revision += 1;
    if (edited) noteEdit();
    else touch();
  }

  function systemDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function paintPreferences(next: Preferences) {
    preferences = next;
    const theme = resolveTheme(next.theme, systemDark());
    document.documentElement.dataset.theme = theme;
    scene?.setDimLonely(next.dimLonely);
    scene?.setLabelScale(next.labelScale);
    scene?.setReduceMotion(next.reduceMotion);
    scene?.setBackdrop(theme === "light" ? "#f4f1ea" : "#101820");
    scene?.setAxisGizmo(next.showAxisGizmo);
    touch();
  }

  function updatePreferences(next: Preferences) {
    const normalized = normalizePreferences(next);
    paintPreferences(normalized);
    void bridge.savePreferences(normalized);
  }

  async function refreshTitle() {
    const track = saves.get(activeId);
    const status = track ? statusFor(track, preferences, session.history.stateId) : { mark: "", text: "" };
    await bridge.setTitle(windowTitle(status.mark, tabTitle(session.doc.meta.title)));
  }

  function fail(error: unknown) {
    scene?.flash(error instanceof Error ? error.message : "That edit didn't apply");
  }

  function rememberFocus() {
    const active = document.activeElement;
    focusBack = active instanceof HTMLElement ? active : null;
  }

  function restoreFocus() {
    const target = focusBack;
    focusBack = null;
    if (target && document.contains(target)) target.focus();
    else scene?.focusCanvas();
  }

  function typingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || Boolean(target.closest(".cm-editor"));
  }

  function hintMode(): HintMode {
    if (linkMode) return "link";
    if (hud.operator === "grab") return "grab";
    if (hud.operator === "view") return "view";
    if (panel === "edit") return "edit";
    if (panel === "read") return "read";
    return "navigate";
  }

  function openedTitle(): string | null {
    if (panel === "closed" || !shown) return null;
    if (shown.kind === "node") {
      const node = session.doc.nodes[shown.id];
      return node ? nodeTitle(node) || "Untitled" : "Missing node";
    }
    const link = session.doc.links[shown.id];
    if (!link) return "Missing link";
    const label = linkLabel(link, session.doc.linkTypes[link.typeId]);
    return label.title || session.doc.linkTypes[link.typeId]?.name || "Link";
  }

  function openPalette() {
    if (paletteOpen) return;
    if (!helpOpen && !aboutOpen) rememberFocus();
    helpOpen = false;
    aboutOpen = false;
    paletteOpen = true;
  }

  function closePalette() {
    if (!paletteOpen) return;
    paletteOpen = false;
    restoreFocus();
  }

  function openHelp() {
    if (helpOpen) return;
    if (!paletteOpen && !aboutOpen) rememberFocus();
    paletteOpen = false;
    aboutOpen = false;
    helpOpen = true;
  }

  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    restoreFocus();
  }

  function openAbout() {
    if (aboutOpen) return;
    if (!paletteOpen && !helpOpen) rememberFocus();
    paletteOpen = false;
    helpOpen = false;
    aboutOpen = true;
  }

  function closeAbout() {
    if (!aboutOpen) return;
    aboutOpen = false;
    restoreFocus();
  }

  function checkForUpdates() {
    void openReleasesPage();
  }

  function togglePreferences() {
    if (prefsOpen) {
      prefsOpen = false;
      restoreFocus();
      return;
    }
    rememberFocus();
    prefsOpen = true;
  }

  function cycleFocus(delta: 1 | -1) {
    const active = document.activeElement;
    let current: RegionId = "scene";
    if (active instanceof HTMLElement) {
      if (active.closest("#region-tabs")) current = "tabs";
      else if (active.closest("#region-reader")) current = "reader";
      else if (active.id === "region-status" || active.closest("#region-status")) current = "status";
    }
    const next = cycleRegion(current, delta, panel !== "closed");
    if (next === "tabs") document.getElementById("region-tabs")?.focus();
    else if (next === "scene") scene?.focusCanvas();
    else if (next === "reader") (document.getElementById("reader-title") ?? document.getElementById("region-reader"))?.focus();
    else document.getElementById("region-status")?.focus();
  }

  function runCommand(id: string) {
    closePalette();
    if (id === "save") void saveActive();
    else if (id === "save-as") void saveAs(activeId);
    else if (id === "open") void openDialog();
    else if (id === "new-tab") newMap();
    else if (id === "close-tab") void requestClose(activeId);
    else if (id === "preferences") togglePreferences();
    else if (id === "undo") undo();
    else if (id === "redo") redo();
    else if (id === "help") openHelp();
    else if (id === "about") openAbout();
    else if (id === "updates") checkForUpdates();
    else if (id === "legend") screen = screen?.name === "legend" ? null : { name: "legend" };
    else if (id === "types") screen = screen?.name === "manager" ? null : { name: "manager" };
    else if (id === "link") beginLink();
    else if (id === "frame") scene?.frameAll();
    else if (id === "focus") scene?.focus();
    else if (id === "new-node") onModEnter();
    else if (id === "delete") deleteSelection();
    else if (id === "gizmo") updatePreferences({ ...preferences, showAxisGizmo: !preferences.showAxisGizmo });
  }

  function runPalette(hit: PaletteHit) {
    if (hit.kind === "node") {
      closePalette();
      scene?.selectNode(hit.id);
      scene?.focus();
      scene?.focusCanvas();
      return;
    }
    runCommand(hit.id);
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

  function commitToReader() {
    if (panel === "edit") leaveEdit();
    shown = shown ?? currentTarget();
    editFromReader = false;
    panel = "read";
    focusToken += 1;
  }

  function handleEscape() {
    if (screen) {
      screen = null;
      return true;
    }
    if (linkMode) {
      endLink();
      return true;
    }
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

  function linkAppearanceChanged(previous: MapDocument, next: MapDocument) {
    if (JSON.stringify(previous.linkTypes) !== JSON.stringify(next.linkTypes)) return true;
    for (const id of Object.keys(previous.links)) {
      const left = previous.links[id];
      const right = next.links[id];
      if (!left || !right) continue;
      if (left.typeId !== right.typeId || left.source !== right.source || left.target !== right.target) return true;
      if (JSON.stringify(left.waypoints ?? null) !== JSON.stringify(right.waypoints ?? null)) return true;
    }
    return false;
  }

  function appearanceKind(previous: MapDocument, next: MapDocument): "text" | "structure" | "links" {
    if (!sameStructure(previous, next)) return "structure";
    if (linkAppearanceChanged(previous, next)) return "links";
    return "text";
  }

  function afterHistory() {
    if (linkMode && !session.doc.nodes[linkMode.sourceId]) {
      endLink();
      if (screen?.name === "picker" || screen?.name === "search" || screen?.name === "follow") screen = null;
    } else if (linkMode?.targetId && !session.doc.nodes[linkMode.targetId]) {
      linkMode = { ...linkMode, targetId: null };
      if (screen?.name === "picker" && screen.purpose === "new-link") screen = null;
      refreshCursor();
    }
    const selected = session.selection.linkId;
    const typeId = selected ? session.doc.links[selected]?.typeId : undefined;
    if (typeId) activeTypeId = typeId;
  }

  function undo() {
    if (panel === "edit") leaveEdit();
    const previous = session.doc;
    if (!session.undo()) {
      scene?.flash("Nothing to undo");
      return;
    }
    const kind = appearanceKind(previous, session.doc);
    bump();
    scene?.sync(session.doc, kind);
    scene?.applySelection(session.selection);
    afterHistory();
    retargetPanel();
  }

  function redo() {
    if (panel === "edit") leaveEdit();
    const previous = session.doc;
    if (!session.redo()) {
      scene?.flash("Nothing to redo");
      return;
    }
    const kind = appearanceKind(previous, session.doc);
    bump();
    scene?.sync(session.doc, kind);
    scene?.applySelection(session.selection);
    afterHistory();
    retargetPanel();
  }

  function openNewNode(id: string) {
    shown = { kind: "node", id };
    editSeed = { text: "", title: "", placeholder: "Untitled" };
    editToken += 1;
    editFromReader = false;
    panel = "edit";
  }

  function createLinkedOf(explicitType?: string) {
    if (panel === "edit") leaveEdit();
    const anchorId = scene?.anchorNodeId() ?? null;
    if (!anchorId || !session.doc.nodes[anchorId] || !scene) {
      scene?.flash("Select a node, then Tab to link a new one");
      return;
    }
    const id = createId();
    const linkId = createId();
    const position = placeNode(scene.placementContext(anchorId));
    const typeId =
      explicitType && session.doc.linkTypes[explicitType]
        ? explicitType
        : session.doc.linkTypes[lastTypeId]
          ? lastTypeId
          : (session.doc.settings.defaultLinkTypeId ?? "relates-to");
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
    activeTypeId = typeId;
    bump();
    scene.sync(session.doc, "structure");
    scene.selectNode(id);
    openNewNode(id);
  }

  function onModEnter() {
    if (linkMode || screen) return;
    const action = modEnterAction({ panel, pinned, overlayFocused: overlayFocused() });
    if (action.kind === "commit-to-reader") {
      commitToReader();
      return;
    }
    if (action.kind !== "create-unlinked" || !scene) return;
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
    openNewNode(id);
  }

  function endLink() {
    linkMode = null;
    scene?.setLinkMode(false);
    scene?.setStatus("Ready");
  }

  function refreshCursor() {
    if (!linkMode || !scene) {
      scene?.setLinkCursor(null);
      return;
    }
    const type = linkMode.typeId ? session.doc.linkTypes[linkMode.typeId] : undefined;
    scene.setLinkCursor({
      sourceId: linkMode.sourceId,
      targetId: linkMode.targetId,
      color: type?.color ?? "#9bb0c4",
    });
    const target = linkMode.targetId ? session.doc.nodes[linkMode.targetId] : undefined;
    const targetTitle = target ? nodeTitle(target) || "Untitled" : "choose a target";
    scene.setStatus(`Link · ${type?.name ?? "type on Enter"} · ${targetTitle}`);
  }

  function settleEdit() {
    if (panel !== "edit") return;
    leaveEdit();
    editFromReader = false;
    panel = pinned ? "read" : "closed";
    if (panel === "closed") focusScene();
  }

  function beginLink() {
    settleEdit();
    const sourceId = scene?.anchorNodeId() ?? null;
    if (!sourceId || !session.doc.nodes[sourceId]) {
      scene?.flash("Select a node to link from");
      return;
    }
    linkMode = { sourceId, targetId: null, typeId: null };
    scene?.setLinkMode(true);
    refreshCursor();
  }

  function moveLinkTarget(direction: "left" | "right" | "up" | "down") {
    if (!linkMode || !scene) return;
    const from = linkMode.targetId ?? linkMode.sourceId;
    const next = scene.spatialFrom(from, direction);
    if (!next) return;
    linkMode = { ...linkMode, targetId: next };
    refreshCursor();
  }

  function prepick(digit: number) {
    if (!linkMode) return;
    const typeId = typeIdForDigit(session.doc, digit);
    if (!typeId) {
      scene?.flash("No type on that number");
      return;
    }
    linkMode = { ...linkMode, typeId };
    refreshCursor();
  }

  function createLink(typeId: string) {
    if (!linkMode?.targetId || !scene) return;
    const id = createId();
    const source = linkMode.sourceId;
    const target = linkMode.targetId;
    try {
      session.dispatch({ type: "addLink", id, link: { source, target, typeId, text: "" } });
    } catch (error) {
      fail(error);
      return;
    }
    lastTypeId = typeId;
    activeTypeId = typeId;
    endLink();
    bump();
    scene.sync(session.doc, "links");
    scene.selectLink(id);
    scene.flash(session.doc.linkTypes[typeId]?.name ?? "Link");
  }

  function confirmLink() {
    if (!linkMode) return;
    if (!linkMode.targetId) {
      scene?.flash("Choose a target node");
      return;
    }
    const fallback = session.doc.linkTypes[lastTypeId] ? lastTypeId : defaultTypeId;
    const decision = linkCommit(linkMode.typeId, preferences.skipPicker, fallback);
    if (decision.kind === "pick") screen = { name: "picker", purpose: "new-link" };
    else createLink(decision.typeId);
  }

  function newLinkTarget() {
    if (!linkMode || !scene) return;
    const id = createId();
    const position = placeNode(scene.placementContext(linkMode.sourceId));
    try {
      session.dispatch({ type: "addNode", id, node: { text: "", position } });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene.sync(session.doc, "structure");
    linkMode = { ...linkMode, targetId: id };
    refreshCursor();
  }

  function beginShiftTab() {
    settleEdit();
    const anchorId = scene?.anchorNodeId() ?? null;
    if (!anchorId || !session.doc.nodes[anchorId]) {
      scene?.flash("Select a node, then Shift+Tab to link a new one");
      return;
    }
    screen = { name: "picker", purpose: "shift-tab" };
  }

  function applyFilters(next: Record<string, LinkTypeFilter>) {
    session.setLinkFilters(next);
    bump(false);
    scene?.sync(session.doc, "links");
  }

  function assignType(linkId: string, typeId: string, group?: { groupKey: string; now: number }) {
    try {
      session.dispatch({ type: "setLinkType", linkId, typeId }, group);
    } catch (error) {
      fail(error);
      return;
    }
    lastTypeId = typeId;
    activeTypeId = typeId;
    bump();
    scene?.sync(session.doc, "links");
    scene?.flash(session.doc.linkTypes[typeId]?.name ?? typeId);
  }

  function cycleSelectedType(delta: 1 | -1) {
    const linkId = hud.selectedLinkId;
    const link = linkId ? session.doc.links[linkId] : undefined;
    if (!linkId || !link) {
      scene?.flash("Select a link to change its type");
      return;
    }
    const next = cycleTypeId(session.doc, link.typeId, delta);
    if (!next) return;
    assignType(linkId, next, { groupKey: `type-cycle:${linkId}`, now: Date.now() });
  }

  function reverseSelected() {
    const linkId = hud.selectedLinkId;
    if (!linkId || !session.doc.links[linkId]) {
      scene?.flash("Select a link to reverse");
      return;
    }
    try {
      session.dispatch({ type: "reverseLink", linkId });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "links");
    scene?.flash("Reversed");
  }

  function cycleTyped(delta: 1 | -1) {
    const nodeId = scene?.anchorNodeId() ?? hud.selectedId;
    if (!nodeId || !activeTypeId) {
      scene?.flash("Select a link to choose a type");
      return;
    }
    const next = cycleTypedLink(session.doc, session.index, nodeId, activeTypeId, hud.selectedLinkId, delta);
    if (!next) scene?.flash("No visible links of that type");
    else scene?.selectLink(next);
  }

  function beginFollow(sense: "forward" | "backward") {
    const nodeId = scene?.anchorNodeId() ?? hud.selectedId;
    if (!nodeId || !activeTypeId) {
      scene?.flash(activeTypeId ? "Select a node to follow" : "Select a link to choose a type");
      return;
    }
    const hits = followVisible(session.doc, session.index, nodeId, activeTypeId, sense);
    if (hits.length === 0) {
      scene?.flash("No link of that type that way");
      return;
    }
    if (hits.length === 1) {
      scene?.selectNode(hits[0].nodeId);
      return;
    }
    followRows = hits.map((hit) => ({
      key: hit.linkId,
      nodeId: hit.nodeId,
      label: nodeTitle(session.doc.nodes[hit.nodeId]) || "Untitled",
    }));
    screen = { name: "follow" };
  }

  function digitFrom(event: KeyboardEvent): number | null {
    if (event.metaKey || event.ctrlKey) return null;
    const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
    return match ? Number(match[1]) : null;
  }

  function sceneKey(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;
    const arrow =
      event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown";
    if (linkMode) {
      if (event.key === "Escape") {
        event.preventDefault();
        endLink();
        return true;
      }
      if (arrow && !event.shiftKey && !event.altKey && !mod) {
        event.preventDefault();
        const direction = (
          { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const
        )[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
        moveLinkTarget(direction);
        return true;
      }
      if (event.key === "Enter" && !mod) {
        event.preventDefault();
        confirmLink();
        return true;
      }
      if (event.code === "KeyN" && !mod && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        newLinkTarget();
        return true;
      }
      if (event.key === "/" && !mod && !event.altKey) {
        event.preventDefault();
        screen = { name: "search" };
        return true;
      }
      const picked = digitFrom(event);
      if (picked != null && picked >= 1 && picked <= 9 && !event.altKey) {
        event.preventDefault();
        prepick(picked);
        return true;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        return true;
      }
      return false;
    }
    if (event.key === "Tab" && event.shiftKey && !mod && !event.altKey) {
      event.preventDefault();
      beginShiftTab();
      return true;
    }
    if (mod && event.shiftKey && event.code === "KeyL" && !event.altKey) {
      event.preventDefault();
      screen = screen?.name === "manager" ? null : { name: "manager" };
      return true;
    }
    if (!mod && event.shiftKey && event.code === "KeyL" && !event.altKey) {
      event.preventDefault();
      screen = screen?.name === "legend" ? null : { name: "legend" };
      return true;
    }
    if (!mod && !event.shiftKey && !event.altKey && event.code === "KeyL" && !event.repeat) {
      event.preventDefault();
      beginLink();
      return true;
    }
    const digit = digitFrom(event);
    if (event.altKey && !mod && digit === 0) {
      event.preventDefault();
      applyFilters({});
      scene?.flash("All types shown");
      return true;
    }
    if (event.altKey && !mod && digit != null && digit >= 1 && digit <= 9) {
      event.preventDefault();
      const typeId = typeIdForDigit(session.doc, digit);
      if (!typeId) {
        scene?.flash("No type on that number");
        return true;
      }
      applyFilters(withFilter(session.doc.view?.linkTypeFilters, typeId, toggleShownHidden(session.doc.view?.linkTypeFilters?.[typeId])));
      return true;
    }
    if (!mod && !event.altKey && digit != null && digit >= 1 && digit <= 9) {
      const linkId = hud.selectedLinkId;
      if (!linkId || !session.doc.links[linkId]) return false;
      event.preventDefault();
      const typeId = typeIdForDigit(session.doc, digit);
      if (!typeId) {
        scene?.flash("No type on that number");
        return true;
      }
      assignType(linkId, typeId);
      return true;
    }
    if (!mod && event.code === "KeyT" && event.shiftKey && !event.repeat) {
      event.preventDefault();
      cycleSelectedType(event.altKey ? -1 : 1);
      return true;
    }
    if (!mod && !event.shiftKey && !event.altKey && event.code === "KeyT" && !event.repeat) {
      event.preventDefault();
      if (!hud.selectedLinkId || !session.doc.links[hud.selectedLinkId]) {
        scene?.flash("Select a link to change its type");
        return true;
      }
      screen = { name: "picker", purpose: "retarget" };
      return true;
    }
    if (!mod && !event.shiftKey && !event.altKey && event.code === "KeyR" && !event.repeat) {
      event.preventDefault();
      reverseSelected();
      return true;
    }
    if (event.altKey && !mod && (event.code === "BracketRight" || event.code === "BracketLeft")) {
      event.preventDefault();
      cycleTyped(event.code === "BracketRight" ? 1 : -1);
      return true;
    }
    if (!mod && !event.altKey && !event.shiftKey && (event.key === "." || event.key === ",")) {
      event.preventDefault();
      beginFollow(event.key === "." ? "forward" : "backward");
      return true;
    }
    return false;
  }

  function onPick(id: string) {
    const purpose = screen?.name === "picker" ? screen.purpose : "retarget";
    screen = null;
    if (purpose === "new-link") createLink(id);
    else if (purpose === "shift-tab") createLinkedOf(id);
    else if (hud.selectedLinkId) assignType(hud.selectedLinkId, id);
  }

  function onSaveType(id: string, draft: TypeDraft) {
    try {
      session.dispatch({
        type: "updateLinkType",
        id,
        patch: {
          name: draft.name,
          color: draft.color.trim(),
          pattern: draft.pattern,
          width: draft.width,
          direction: draft.direction,
          icon: draft.icon.trim(),
          description: draft.description.trim(),
        },
      });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "links");
  }

  function onAddType(draft: TypeDraft) {
    const fresh = freshType(session.doc, draft.name);
    try {
      session.dispatch({
        type: "addLinkType",
        id: fresh.id,
        linkType: {
          ...fresh.linkType,
          color: draft.color.trim(),
          pattern: draft.pattern,
          width: draft.width,
          direction: draft.direction,
          ...(draft.icon.trim() ? { icon: draft.icon.trim() } : {}),
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        },
      });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "links");
    if (screen?.name === "picker") onPick(fresh.id);
  }

  function onDeleteType(id: string, mode: "reassign" | "delete-links", to: string) {
    if (Object.keys(session.doc.linkTypes).length < 2) {
      scene?.flash("A map keeps at least one link type");
      return;
    }
    const commands = deleteTypeCommands(session.doc, id, { mode, to });
    const now = Date.now();
    const key = `delete-type:${id}`;
    try {
      for (const command of commands) session.dispatch(command, { groupKey: key, now });
    } catch (error) {
      fail(error);
      return;
    }
    if (lastTypeId === id) lastTypeId = to;
    if (activeTypeId === id) activeTypeId = to;
    bump();
    scene?.sync(session.doc, mode === "delete-links" ? "structure" : "links");
  }

  function onReorder(id: string, delta: -1 | 1) {
    const order = shiftedOrder(
      rows.map((row) => ({ id: row.id, order: row.order })),
      id,
      delta,
    );
    if (!order) return;
    try {
      session.dispatch({ type: "reorderLinkType", id, order });
    } catch (error) {
      fail(error);
      return;
    }
    bump();
    scene?.sync(session.doc, "links");
  }

  function onSearch(id: string) {
    screen = null;
    if (!linkMode || !session.doc.nodes[id]) return;
    linkMode = { ...linkMode, targetId: id };
    refreshCursor();
  }

  function onFollow(index: number) {
    const row = followRows[index];
    screen = null;
    if (row) scene?.selectNode(row.nodeId);
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
    if (linkMode && !session.doc.nodes[linkMode.sourceId]) endLink();
    else if (linkMode?.targetId && !session.doc.nodes[linkMode.targetId]) {
      linkMode = { ...linkMode, targetId: null };
      refreshCursor();
    }
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

  function captureChrome(): Chrome {
    return {
      panel,
      pinned,
      shown: shown ? { ...shown } : null,
      editFromReader,
      lastTypeId,
      linkMode: linkMode ? { ...linkMode } : null,
      screen: screen ? { ...screen } : null,
      activeTypeId,
      mapKind,
      pose: scene?.getPose() ?? null,
    };
  }

  function restoreChrome(chrome: Chrome) {
    panel = chrome.panel === "edit" ? (chrome.pinned ? "read" : "closed") : chrome.panel;
    pinned = chrome.pinned;
    shown = chrome.shown;
    editFromReader = false;
    lastTypeId = chrome.lastTypeId;
    linkMode = chrome.linkMode;
    screen = chrome.screen;
    activeTypeId = chrome.activeTypeId;
    mapKind = chrome.mapKind;
    bench = null;
  }

  function showSession(nextKind: MapKind, pose: Chrome["pose"]) {
    doc = session.doc;
    revision += 1;
    mapKind = nextKind;
    scene?.setLinkMode(linkMode !== null);
    scene?.load(session.doc);
    if (pose) scene?.setPose(pose);
    scene?.applySelection(session.selection);
    scene?.setDimLonely(preferences.dimLonely);
    if (linkMode) refreshCursor();
    touch();
    void refreshTitle();
  }

  function openTab(next: MapSession, track: SaveTrack, kind: MapKind, edit: boolean) {
    if (panel === "edit") leaveEdit();
    shelf.set(activeId, { session, chrome: captureChrome() });
    const id = createId();
    saves.set(id, track);
    tabOrder = [...tabOrder, id];
    activeId = id;
    session = next;
    panel = "closed";
    pinned = false;
    shown = null;
    editFromReader = false;
    lastTypeId = next.doc.settings.defaultLinkTypeId ?? "relates-to";
    linkMode = null;
    screen = null;
    activeTypeId = null;
    showSession(kind, null);
    if (edit) editFirstNode();
  }

  function editFirstNode() {
    const nodeId = session.selection.nodeId ?? Object.keys(session.doc.nodes)[0] ?? null;
    if (!nodeId) return;
    scene?.selectNode(nodeId);
    beginEdit(false);
  }

  function activate(id: string) {
    if (id === activeId || !shelf.has(id)) return;
    if (panel === "edit") leaveEdit();
    const next = shelf.get(id);
    if (!next) return;
    shelf.set(activeId, { session, chrome: captureChrome() });
    shelf.delete(id);
    activeId = id;
    session = next.session;
    restoreChrome(next.chrome);
    showSession(next.chrome.mapKind, next.chrome.pose);
  }

  function chooseMap(id: "stress" | "sample") {
    const next = MapSession.load(id === "stress" ? stressMap() : urbanFloodingDocument());
    const track = freshTrack(createId());
    track.savedStateId = next.history.stateId;
    openTab(next, track, id, false);
  }

  function newMap() {
    openTab(makeBlank(), freshTrack(createId(), { edited: true }), "new", true);
  }

  function toggleMap() {
    chooseMap(mapKind === "sample" ? "stress" : "sample");
  }

  function tabIdForPath(path: string): string | null {
    for (const id of tabOrder) if (saves.get(id)?.path === path) return id;
    return null;
  }

  function askPath(purpose: "open" | "save", suggested: string, files: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      pathWait = resolve;
      dialog = { kind: "path", purpose, suggested, files };
    });
  }

  async function writeRecovery(id: string) {
    const sess = sessionFor(id);
    const track = saves.get(id);
    if (!sess || !track) return;
    const now = Date.now();
    const clock = {
      mode: preferences.saveMode,
      path: track.path,
      dirty: sess.history.stateId !== track.savedStateId,
      paused: track.paused,
      conflict: track.conflict,
      saving: track.saving,
      lastEditAt: track.lastEditAt,
      burstStartedAt: track.burstStartedAt,
      lastAutosaveAt: track.lastAutosaveAt,
      lastRecoveryAt: track.lastRecoveryAt,
      lastBackupAt: track.lastBackupAt,
      savedAt: track.lastSavedAt,
      delayMs: preferences.autosaveDelayMs,
      maxIntervalMs: preferences.autosaveMaxIntervalMs,
      recoveryIdleMs: preferences.recoveryIdleMs,
      recoveryMaxMs: preferences.recoveryMaxMs,
    };
    if (!shouldWriteRecovery(clock, now)) return;
    const record: RecoveryItem = {
      id: track.recoveryId,
      savedAt: new Date(now).toISOString(),
      title: tabTitle(sess.doc.meta.title),
      path: track.path,
      mapText: snapshotText(sess, poseFor(id)),
    };
    const outcome = await bridge.writeRecovery(record);
    if (outcome.kind === "ok") {
      track.lastRecoveryAt = now;
      touch();
    } else if (outcome.kind === "newer-major") {
      track.paused = true;
      touch();
    }
  }

  async function saveTab(id: string, reason: "manual" | "autosave" | "close"): Promise<boolean> {
    const sess = sessionFor(id);
    const track = saves.get(id);
    if (!sess || !track) return false;
    if (!track.path) return false;
    const now = Date.now();
    const dirty = sess.history.stateId !== track.savedStateId;
    const clock = {
      mode: preferences.saveMode,
      path: track.path,
      dirty,
      paused: track.paused,
      conflict: track.conflict,
      saving: track.saving,
      lastEditAt: track.lastEditAt,
      burstStartedAt: track.burstStartedAt,
      lastAutosaveAt: track.lastAutosaveAt,
      lastRecoveryAt: track.lastRecoveryAt,
      lastBackupAt: track.lastBackupAt,
      savedAt: track.lastSavedAt,
      delayMs: preferences.autosaveDelayMs,
      maxIntervalMs: preferences.autosaveMaxIntervalMs,
      recoveryIdleMs: preferences.recoveryIdleMs,
      recoveryMaxMs: preferences.recoveryMaxMs,
    };
    if (reason !== "manual" && !shouldAutosave(clock, now, reason === "close" ? "close" : "tick")) return !dirty;
    if (track.saving) return false;
    track.saving = true;
    touch();
    const rotate = shouldRotateBackup(clock, now);
    const outcome = await bridge.save({
      path: track.path,
      text: snapshotText(sess, poseFor(id)),
      expected: track.stamp,
      rotateBackup: rotate,
      backupKeep: preferences.backupKeep,
      backupLocation: preferences.backupLocation,
    });
    track.saving = false;
    if (outcome.kind === "ok") {
      markSaved(track, sess.history.stateId, outcome.stamp, now, rotate);
      await bridge.deleteRecovery(track.recoveryId);
      touch();
      void refreshTitle();
      return true;
    }
    track.paused = true;
    if (outcome.kind === "external-change") {
      track.conflict = true;
      dialog = { kind: "conflict", path: track.path };
    } else if (outcome.kind === "newer-major") {
      dialog = { kind: "notice", message: "This map was made with a newer version of the app. Please update to open it." };
    } else {
      track.error = outcome.message;
      dialog = { kind: "failure", message: outcome.message };
    }
    touch();
    void refreshTitle();
    return false;
  }

  async function saveAs(id: string): Promise<boolean> {
    const sess = sessionFor(id);
    const track = saves.get(id);
    if (!sess || !track) return false;
    const suggested = `${tabTitle(sess.doc.meta.title)}.mindmap3d`;
    let path = bridge.native ? await bridge.pickSave(suggested) : null;
    if (!path) {
      const files = await bridge.listFiles();
      path = await askPath("save", suggested, files);
    }
    if (!path) return false;
    path = ensureSuffix(path);
    const other = tabIdForPath(path);
    if (other && other !== id) {
      activate(other);
      scene?.flash("That file is already open");
      return false;
    }
    track.path = path;
    track.stamp = null;
    track.conflict = false;
    return saveTab(id, "manual");
  }

  async function saveActive() {
    const track = saves.get(activeId);
    if (!track) return;
    if (!track.path) await saveAs(activeId);
    else await saveTab(activeId, "manual");
  }

  async function openFromPath(path: string) {
    const existing = tabIdForPath(path);
    if (existing) {
      activate(existing);
      return;
    }
    try {
      const read = await bridge.read(path);
      const next = MapSession.load(JSON.parse(read.text) as unknown);
      const track = freshTrack(createId());
      track.path = path;
      track.stamp = read.stamp;
      track.savedStateId = next.history.stateId;
      track.lastSavedAt = read.stamp.modifiedMs;
      const untouched = tabOrder.length === 1 && !saves.get(activeId)?.path && session.history.stateId <= 1;
      openTab(next, track, "sample", false);
      if (untouched) dropTab(tabOrder[0], false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That file could not be opened";
      dialog = { kind: "notice", message };
    }
  }

  async function openDialog() {
    let path = bridge.native ? await bridge.pickOpen() : null;
    if (!path) {
      const files = await bridge.listFiles();
      path = await askPath("open", "", files);
    }
    if (path) await openFromPath(ensureSuffix(path));
  }

  function dropTab(id: string, remember: boolean) {
    const track = saves.get(id);
    const entry = id === activeId ? { session, chrome: captureChrome() } : shelf.get(id);
    if (remember && entry && track) {
      closedStack.push({ ...entry, save: { ...track } });
      if (closedStack.length > 12) closedStack.shift();
    }
    if (track) void bridge.deleteRecovery(track.recoveryId);
    shelf.delete(id);
    saves.delete(id);
    const nextOrder = tabOrder.filter((item) => item !== id);
    if (nextOrder.length === 0) {
      const blank = makeBlank();
      const nid = createId();
      saves.set(nid, freshTrack(nid, { edited: true }));
      tabOrder = [nid];
      activeId = nid;
      session = blank;
      panel = "closed";
      pinned = false;
      shown = null;
      linkMode = null;
      screen = null;
      showSession("new", null);
      editFirstNode();
      return;
    }
    tabOrder = nextOrder;
    if (id === activeId) {
      const neighbor = nextOrder[nextOrder.length - 1];
      const next = shelf.get(neighbor);
      shelf.delete(neighbor);
      activeId = neighbor;
      if (next) {
        session = next.session;
        restoreChrome(next.chrome);
        showSession(next.chrome.mapKind, next.chrome.pose);
      }
    } else touch();
  }

  async function requestClose(id: string) {
    const sess = sessionFor(id);
    const track = saves.get(id);
    if (!sess || !track) return;
    if (preferences.saveMode === "autosave" && track.path && !track.paused && !track.conflict) {
      const ok = await saveTab(id, "close");
      if (ok) dropTab(id, true);
      return;
    }
    if (promptFor(track, preferences, sess.history.stateId)) {
      pendingClose = id;
      dialog = { kind: "close-tab", title: tabTitle(sess.doc.meta.title) };
      return;
    }
    dropTab(id, true);
  }

  function titlesNeedingPrompt(): { id: string; title: string }[] {
    const rows: { id: string; title: string }[] = [];
    for (const id of tabOrder) {
      const sess = sessionFor(id);
      const track = saves.get(id);
      if (!sess || !track) continue;
      if (promptFor(track, preferences, sess.history.stateId)) rows.push({ id, title: tabTitle(sess.doc.meta.title) });
    }
    return rows;
  }

  async function flushAutosave() {
    for (const id of [...tabOrder]) {
      const track = saves.get(id);
      if (!track?.path || preferences.saveMode !== "autosave" || track.paused || track.conflict) continue;
      await saveTab(id, "close");
    }
  }

  async function finishQuit() {
    quitting = true;
    await bridge.destroyWindow();
  }

  async function requestQuit() {
    await flushAutosave();
    const pending = titlesNeedingPrompt();
    if (pending.length === 0) {
      for (const id of [...tabOrder]) {
        const track = saves.get(id);
        if (track) void bridge.deleteRecovery(track.recoveryId);
      }
      await finishQuit();
      return;
    }
    if (pending.length === 1) {
      quitAfterClose = true;
      pendingClose = pending[0].id;
      dialog = { kind: "close-tab", title: pending[0].title };
      return;
    }
    quitAfterClose = true;
    dialog = { kind: "quit", titles: pending.map((row) => row.title) };
  }

  function reopenClosed() {
    const last = closedStack.pop();
    if (!last) {
      scene?.flash("No closed tab to reopen");
      return;
    }
    openTab(last.session, { ...last.save, saving: false }, last.chrome.mapKind, false);
    const id = activeId;
    const chrome = last.chrome;
    restoreChrome(chrome);
    showSession(chrome.mapKind, chrome.pose);
    if (id) saves.set(id, { ...last.save, saving: false });
  }

  function cycleTab(delta: number) {
    if (tabOrder.length < 2) return;
    const index = tabOrder.indexOf(activeId);
    const next = tabOrder[(index + delta + tabOrder.length) % tabOrder.length];
    if (next) activate(next);
  }

  async function tickTabs() {
    const now = Date.now();
    for (const id of tabOrder) {
      const sess = sessionFor(id);
      const track = saves.get(id);
      if (!sess || !track || track.saving) continue;
      const dirty = sess.history.stateId !== track.savedStateId;
      const clock = {
        mode: preferences.saveMode,
        path: track.path,
        dirty,
        paused: track.paused,
        conflict: track.conflict,
        saving: track.saving,
        lastEditAt: track.lastEditAt,
        burstStartedAt: track.burstStartedAt,
        lastAutosaveAt: track.lastAutosaveAt,
        lastRecoveryAt: track.lastRecoveryAt,
        lastBackupAt: track.lastBackupAt,
        savedAt: track.lastSavedAt,
        delayMs: preferences.autosaveDelayMs,
        maxIntervalMs: preferences.autosaveMaxIntervalMs,
        recoveryIdleMs: preferences.recoveryIdleMs,
        recoveryMaxMs: preferences.recoveryMaxMs,
      };
      if (shouldWriteRecovery(clock, now)) await writeRecovery(id);
      if (shouldAutosave(clock, now, "tick")) await saveTab(id, "autosave");
    }
  }

  function onBlur() {
    for (const id of tabOrder) {
      const track = saves.get(id);
      if (track?.path && preferences.saveMode === "autosave") void saveTab(id, "close");
    }
  }

  function onFileKey(event: KeyboardEvent) {
    if (event.key === "F6") {
      event.preventDefault();
      event.stopPropagation();
      cycleFocus(event.shiftKey ? -1 : 1);
      return;
    }
    if (paletteOpen || helpOpen || aboutOpen) return;
    if (dialog) return;
    const typing = typingTarget(event.target);
    if (!typing && bindingById("help").chords.some((chord) => matchesChord(chord, event))) {
      event.preventDefault();
      event.stopPropagation();
      openHelp();
      return;
    }
    if (!typing && bindingById("palette").chords.some((chord) => matchesChord(chord, event))) {
      if (event.key === "/" && (linkMode || screen?.name === "search")) return;
      event.preventDefault();
      event.stopPropagation();
      openPalette();
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      cycleTab(event.shiftKey ? -1 : 1);
      return;
    }
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) void saveAs(activeId);
      else void saveActive();
      return;
    }
    if (key === "o" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void openDialog();
      return;
    }
    if (key === "t" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      reopenClosed();
      return;
    }
    if (key === "t") {
      event.preventDefault();
      event.stopPropagation();
      newMap();
      return;
    }
    if (key === "w" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void requestClose(activeId);
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      event.stopPropagation();
      togglePreferences();
      return;
    }
    if (key === "n" && !event.shiftKey && !screen && panel !== "edit" && !linkMode && !prefsOpen && !aboutOpen) {
      event.preventDefault();
      event.stopPropagation();
      newMap();
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (digit && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const n = Number(digit[1]);
      const id = n === 9 ? tabOrder[tabOrder.length - 1] : tabOrder[n - 1];
      if (id) activate(id);
    }
  }

  async function onCloseTabChoice(choice: "save" | "discard" | "cancel") {
    dialog = null;
    const id = pendingClose;
    pendingClose = null;
    if (!id || choice === "cancel") {
      closeQueue = [];
      quitAfterClose = false;
      return;
    }
    if (choice === "save") {
      const track = saves.get(id);
      const ok = track?.path ? await saveTab(id, "manual") : await saveAs(id);
      if (!ok) {
        closeQueue = [];
        quitAfterClose = false;
        return;
      }
    }
    dropTab(id, choice === "discard" || choice === "save");
    const next = closeQueue.shift();
    if (next) {
      const sess = sessionFor(next);
      pendingClose = next;
      dialog = { kind: "close-tab", title: tabTitle(sess?.doc.meta.title) };
      return;
    }
    if (quitAfterClose) {
      quitAfterClose = false;
      await finishQuit();
    }
  }

  async function onQuitChoice(choice: "save-all" | "review" | "discard" | "cancel") {
    dialog = null;
    if (choice === "cancel") {
      quitAfterClose = false;
      return;
    }
    const pending = titlesNeedingPrompt();
    if (choice === "discard") {
      for (const row of pending) dropTab(row.id, false);
      quitAfterClose = false;
      await finishQuit();
      return;
    }
    if (choice === "review") {
      closeQueue = pending.slice(1).map((row) => row.id);
      if (pending[0]) {
        pendingClose = pending[0].id;
        dialog = { kind: "close-tab", title: pending[0].title };
      }
      return;
    }
    for (const row of pending) {
      const track = saves.get(row.id);
      if (!track) continue;
      const ok = track.path ? await saveTab(row.id, "manual") : await saveAs(row.id);
      if (!ok) {
        quitAfterClose = false;
        return;
      }
      dropTab(row.id, true);
    }
    quitAfterClose = false;
    await finishQuit();
  }

  async function onRecoveryChoice(choice: "restore" | "discard", id: string) {
    const current = dialog?.kind === "recovery" ? dialog.items : [];
    const item = current.find((entry) => entry.id === id);
    if (choice === "discard") await bridge.deleteRecovery(id);
    if (choice === "restore" && item) {
      try {
        const next = MapSession.load(JSON.parse(item.mapText) as unknown);
        const track = freshTrack(item.id, { edited: true });
        track.path = item.path;
        track.savedStateId = -1;
        if (item.path) {
          try {
            track.stamp = (await bridge.read(item.path)).stamp;
          } catch {
            track.stamp = null;
          }
        }
        openTab(next, track, "sample", false);
      } catch (error) {
        dialog = { kind: "notice", message: error instanceof Error ? error.message : "That recovery could not be opened" };
        return;
      }
    }
    const rest = current.filter((entry) => entry.id !== id);
    dialog = rest.length ? { kind: "recovery", items: rest } : null;
  }

  async function onConflictChoice(choice: "reload" | "save-as" | "cancel") {
    const path = dialog?.kind === "conflict" ? dialog.path : saves.get(activeId)?.path;
    dialog = null;
    const track = saves.get(activeId);
    if (!track || !path) return;
    if (choice === "cancel") return;
    if (choice === "save-as") {
      track.conflict = false;
      track.paused = false;
      await saveAs(activeId);
      return;
    }
    try {
      const read = await bridge.read(path);
      const next = MapSession.load(JSON.parse(read.text) as unknown);
      session = next;
      track.stamp = read.stamp;
      track.savedStateId = next.history.stateId;
      track.conflict = false;
      track.paused = false;
      track.lastEditAt = null;
      track.burstStartedAt = null;
      showSession(mapKind, null);
    } catch (error) {
      dialog = { kind: "notice", message: error instanceof Error ? error.message : "Reload failed" };
    }
  }

  async function onFailureChoice(choice: "retry" | "save-as" | "cancel") {
    dialog = null;
    const track = saves.get(activeId);
    if (!track) return;
    if (choice === "cancel") return;
    track.paused = false;
    if (choice === "retry") await saveTab(activeId, "manual");
    else await saveAs(activeId);
  }

  function onPathChoice(path: string | null) {
    dialog = null;
    const wait = pathWait;
    pathWait = null;
    wait?.(path);
  }

  onMount(() => {
    if (!host) return;
    scene = createMindMapScene(host, session.doc, publish, () => toggleMap(), {
      isOverlayFocused: overlayFocused,
      handleEscape,
      openReader,
      editDirect: () => beginEdit(false),
      createLinked: () => createLinkedOf(),
      createUnlinked: onModEnter,
      deleteSelection,
      undo,
      redo,
      togglePin,
      commitMove,
      blocksSceneKeys: () => screen !== null || prefsOpen || dialog !== null || paletteOpen || helpOpen || aboutOpen,
      sceneKey,
      linkActive: () => linkMode !== null,
      hoverLinkTarget: (id) => {
        if (!linkMode || !id || id === linkMode.targetId) return;
        linkMode = { ...linkMode, targetId: id };
        refreshCursor();
      },
      confirmLinkClick: (id) => {
        if (!linkMode) return;
        const decision = linkPointerConfirm(linkMode.targetId, id);
        if (!decision.create || !decision.targetId) {
          scene?.flash("Choose a target node");
          return;
        }
        if (linkMode.targetId !== decision.targetId) linkMode = { ...linkMode, targetId: decision.targetId };
        refreshCursor();
        confirmLink();
      },
      cancelLink: () => endLink(),
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
        linkTypes: session.doc.linkTypes,
        filters: session.doc.view?.linkTypeFilters ?? {},
        selection: scene?.getSelection() ?? null,
        linkMode,
        screen: screen?.name ?? null,
        activeTypeId,
        tabs: tabOrder.map((id) => {
          const sess = sessionFor(id);
          const track = saves.get(id);
          const status = track && sess ? statusFor(track, preferences, sess.history.stateId) : { mark: "", text: "" };
          return { id, title: tabTitle(sess?.doc.meta.title), mark: status.mark, path: track?.path ?? null, text: status.text };
        }),
        saveStatus: fileStatus,
        preferences,
        path: saves.get(activeId)?.path ?? null,
        dirty: session.history.stateId !== (saves.get(activeId)?.savedStateId ?? 0),
        dialog: dialog?.kind ?? null,
        prefsOpen,
        paletteOpen,
        helpOpen,
        aboutOpen,
        releasesUrl: RELEASES_PAGE_URL,
        errorLogPath,
        live: liveText,
        axisGizmo: preferences.showAxisGizmo,
      }),
      flushRecovery: () => writeRecovery(activeId),
      skipClosePrompt: () => {
        quitting = true;
      },
      requestQuit: () => requestQuit(),
      closeTab: () => requestClose(activeId),
      save: () => saveActive(),
      openPreferences: () => {
        if (!prefsOpen) rememberFocus();
        prefsOpen = true;
      },
      openPalette: () => openPalette(),
      closePalette: () => closePalette(),
      openAbout: () => openAbout(),
      closeAbout: () => closeAbout(),
      setPreferences: (partial: Partial<Preferences>) => updatePreferences({ ...preferences, ...partial }),
      selectNode: (id: string | null) => scene?.selectNode(id),
      selectLink: (id: string) => scene?.selectLink(id),
      loadDocument: (next: MapDocument) => {
        session = MapSession.load(next);
        const track = saves.get(activeId);
        if (track) {
          track.path = null;
          track.stamp = null;
          track.savedStateId = session.history.stateId;
          track.lastEditAt = null;
          track.burstStartedAt = null;
          track.conflict = false;
          track.paused = false;
        }
        doc = session.doc;
        revision += 1;
        mapKind = "sample";
        scene?.load(session.doc);
        touch();
      },
    };
    (window as unknown as { __mindmap?: typeof api }).__mindmap = api;
    paintPreferences(preferences);
    editFirstNode();
    const onUnload = (event: BeforeUnloadEvent) => {
      if (quitting) return;
      if (titlesNeedingPrompt().length > 0) event.preventDefault();
    };
    const stopErrors = installErrorLog((line) => {
      void bridge.appendErrorLog(line).catch(() => {});
    });
    window.addEventListener("beforeunload", onUnload);
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      if (preferences.theme === "system") paintPreferences(preferences);
    };
    themeMedia.addEventListener("change", onTheme);
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopOpen = () => {};
    let stopClose = () => {};
    void (async () => {
      bridge = await createFileBridge();
      errorLogPath = await bridge.errorLogPath();
      paintPreferences(await bridge.loadPreferences());
      stopOpen = bridge.onOpenPaths((paths) => {
        for (const path of paths) void openFromPath(path);
      });
      stopClose = bridge.onCloseRequested(() => void requestQuit());
      const startup = await bridge.takeStartupPaths();
      for (const path of startup) await openFromPath(path);
      const recovery = await bridge.listRecovery();
      if (recovery.length > 0) dialog = { kind: "recovery", items: recovery };
      void refreshTitle();
      timer = setInterval(() => void tickTabs(), 400);
    })();
    return () => {
      stopErrors();
      if (timer) clearInterval(timer);
      themeMedia.removeEventListener("change", onTheme);
      window.removeEventListener("beforeunload", onUnload);
      stopOpen();
      stopClose();
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

  $effect(() => {
    revision;
    hud.selectedId;
    hud.selectedLinkId;
    hud.operator;
    panel;
    shown;
    linkMode;
    liveText = liveAnnouncement({
      doc: session.doc,
      index: session.index,
      nodeId: hud.selectedId,
      linkId: hud.selectedLinkId,
      panel,
      openedTitle: openedTitle(),
      linkMode: linkMode !== null,
      operator: hud.operator,
    });
  });

  $effect(() => {
    const open = dialog !== null;
    if (open && !dialogWasOpen) rememberFocus();
    if (!open && dialogWasOpen) restoreFocus();
    dialogWasOpen = open;
  });

  $effect(() => {
    const id = hud.selectedLinkId;
    revision;
    if (!id) return;
    const typeId = session.doc.links[id]?.typeId;
    if (typeId) activeTypeId = typeId;
  });
</script>

<svelte:window onkeydowncapture={onFileKey} onblur={onBlur} />

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
    <TabStrip tabs={strip} {activeId} onActivate={activate} onClose={(id) => void requestClose(id)} />
    <!-- The status line is a focus stop for F6, so it takes a tab index on purpose. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="status" id="region-status" role="region" aria-label="Status" tabindex="0">
      <span class="file" aria-live="polite">{fileStatus}</span>
      <span>· {hud.message || hud.status}</span>
      <span> · {modeHint}</span>
      {#if filterLabel}
        <span>· {filterLabel}</span>
      {/if}
      {#if hud.prepMs != null}
        <span>· labels prepared in {hud.prepMs.toFixed(0)} ms</span>
      {/if}
    </div>
  </header>

  <aside class="tools">
    <div class="readout">
      <p class="kicker">Selected</p>
      <p class="title">{hud.selectedTitle}</p>
      <p class="meta">
        {#if linkMode}
          Linking from {nodeTitle(session.doc.nodes[linkMode.sourceId] ?? { text: "" }) || "Untitled"}
        {:else if hud.operator === "grab"}
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
      <p class="kicker">File</p>
      <div class="row">
        <button type="button" onclick={() => void saveActive()}>Save</button>
        <button type="button" onclick={() => void openDialog()}>Open</button>
        <button type="button" class:on={prefsOpen} onclick={togglePreferences}>Preferences</button>
      </div>
    </div>

    <div class="group">
      <p class="kicker">Map</p>
      <div class="row">
        <button type="button" class:on={mapKind === "new"} onclick={newMap}>New tab</button>
        <button type="button" class:on={mapKind === "stress"} onclick={() => chooseMap("stress")}>2,304 nodes</button>
        <button type="button" class:on={mapKind === "sample"} onclick={() => chooseMap("sample")}>Flooding sample</button>
      </div>
    </div>

    <div class="group">
      <p class="kicker">Links</p>
      <div class="row">
        <button type="button" class:on={linkMode !== null} onclick={beginLink}>Link</button>
        <button type="button" class:on={screen?.name === "legend"} onclick={() => (screen = screen?.name === "legend" ? null : { name: "legend" })}>Legend</button>
        <button type="button" class:on={screen?.name === "manager"} onclick={() => (screen = screen?.name === "manager" ? null : { name: "manager" })}>Types</button>
      </div>
    </div>

    <div class="group">
      <p class="kicker">Help</p>
      <div class="row">
        <button type="button" class:on={helpOpen} onclick={openHelp}>Shortcuts</button>
        <button type="button" class:on={aboutOpen} onclick={openAbout}>About</button>
        <button type="button" onclick={checkForUpdates}>Check for updates</button>
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
      onCommit={commitToReader}
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

  {#if screen}
    <LinkChrome
      {screen}
      {rows}
      nodes={nodeChoices}
      {followRows}
      {filters}
      {defaultTypeId}
      highlightId={lastTypeId}
      onClose={() => (screen = null)}
      {onPick}
      onFilter={(id, state) => applyFilters(withFilter(session.doc.view?.linkTypeFilters, id, state))}
      onSolo={(id) => applyFilters(soloFilters(rows.map((row) => row.id), id))}
      onShowAll={() => applyFilters({})}
      onOpenManager={() => (screen = { name: "manager" })}
      {onSaveType}
      {onAddType}
      {onDeleteType}
      {onReorder}
      onDefault={(id) => {
        try {
          session.dispatch({ type: "setDefaultLinkType", typeId: id });
        } catch (error) {
          fail(error);
          return;
        }
        bump();
        scene?.flash(session.doc.linkTypes[id]?.name ?? "Default type");
      }}
      {onSearch}
      {onFollow}
      onUndo={undo}
      onRedo={redo}
    />
  {/if}

  {#if paletteOpen}
    <Palette commands={PALETTE_COMMANDS} nodes={paletteNodes} onRun={runPalette} onClose={closePalette} />
  {/if}
  {#if helpOpen}
    <HelpSheet sections={shortcutSections} onClose={closeHelp} />
  {/if}
  {#if aboutOpen}
    <AboutPanel logPath={errorLogPath} onUpdates={checkForUpdates} onClose={closeAbout} />
  {/if}
  {#if prefsOpen}
    <PreferencesPanel {preferences} onChange={updatePreferences} onClose={togglePreferences} />
  {/if}
  {#if dialog}
    <FileDialogs
      {dialog}
      onCloseTab={(choice) => void onCloseTabChoice(choice)}
      onQuit={(choice) => void onQuitChoice(choice)}
      onRecovery={(choice, id) => void onRecoveryChoice(choice, id)}
      onConflict={(choice) => void onConflictChoice(choice)}
      onFailure={(choice) => void onFailureChoice(choice)}
      onPath={onPathChoice}
      onDismiss={() => (dialog = null)}
    />
  {/if}

  <footer class="keys">
    <span><kbd>Arrows</kbd> select</span>
    <span><kbd>Enter</kbd> read</span>
    <span><kbd>E</kbd> edit</span>
    <span><kbd>Esc</kbd> step back</span>
    <span><kbd>L</kbd> link</span>
    <span><kbd>Tab</kbd> new link</span>
    <span><kbd>Shift</kbd>+<kbd>Tab</kbd> pick type</span>
    <span><kbd>Mod</kbd>+<kbd>Enter</kbd> new node</span>
    <span><kbd>1</kbd>–<kbd>9</kbd> type</span>
    <span><kbd>T</kbd> types</span>
    <span><kbd>R</kbd> reverse</span>
    <span><kbd>.</kbd> <kbd>,</kbd> follow</span>
    <span><kbd>Shift</kbd>+<kbd>L</kbd> legend</span>
    <span><kbd>G</kbd> grab</span>
    <span><kbd>Del</kbd> delete</span>
    <span><kbd>Mod</kbd>+<kbd>S</kbd> save</span>
    <span><kbd>Mod</kbd>+<kbd>O</kbd> open</span>
    <span><kbd>Mod</kbd>+<kbd>T</kbd> tab</span>
    <span><kbd>Mod</kbd>+<kbd>W</kbd> close</span>
    <span><kbd>Mod</kbd>+<kbd>,</kbd> preferences</span>
    <span><kbd>Mod</kbd>+<kbd>Z</kbd> undo</span>
    <span><kbd>[</kbd> <kbd>]</kbd> cycle</span>
    <span><kbd>V</kbd> view</span>
    <span><kbd>F</kbd> focus</span>
    <span><kbd>/</kbd> commands</span>
    <span><kbd>?</kbd> help</span>
    <span><kbd>F6</kbd> regions</span>
  </footer>

  <nav class="tree-mirror" aria-label="Selection neighbourhood">
  <div role="tree" aria-label={tree.accessibleName}>
    {#if tree.empty}
      <div role="treeitem" aria-selected="false">{tree.summary}</div>
    {:else}
      <div role="treeitem" aria-expanded="true" aria-selected={hud.selectedLinkId == null}>
        <span>{tree.accessibleName}</span>
        <div role="group">
          {#each tree.groups as group (group.typeId)}
            <div role="treeitem" aria-expanded="true" aria-selected="false">
              <span>{group.typeName}, {group.links.length}</span>
              <div role="group">
                {#each group.links as link (link.linkId)}
                  <div role="treeitem" aria-expanded="true" aria-selected={hud.selectedLinkId === link.linkId}>
                    <span>{link.phrase}</span>
                    <div role="group">
                      <div role="treeitem" aria-selected="false">{link.other.loop ? `${link.other.title}, loop` : link.other.title}</div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  </nav>

  <p class="live" aria-live="polite">{liveText}</p>
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

  :global(.scene-canvas:focus-visible) {
    outline: 2px solid #e2b657;
    outline-offset: -3px;
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
    max-width: min(46vw, 520px);
    color: #c5d2e0;
    font-size: 14px;
  }

  .status:focus-visible {
    outline: 2px solid #e2b657;
    outline-offset: 3px;
  }

  .file {
    color: #ffe7a3;
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

  .live,
  .tree-mirror {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  :global(html[data-theme="light"]),
  :global(html[data-theme="light"] body) {
    background: #f4f1ea;
    color: #1c2430;
  }

  :global(html[data-theme="light"]) .tools {
    background: rgba(255, 252, 246, 0.92);
    border-color: rgba(28, 36, 48, 0.12);
    color: #1c2430;
  }

  :global(html[data-theme="light"]) .status,
  :global(html[data-theme="light"]) .meta,
  :global(html[data-theme="light"]) .fine,
  :global(html[data-theme="light"]) .keys,
  :global(html[data-theme="light"]) .kicker,
  :global(html[data-theme="light"]) dt {
    color: #3d4b5c;
  }

  :global(html[data-theme="light"]) button {
    background: rgba(255, 255, 255, 0.7);
    color: #1c2430;
    border-color: rgba(28, 36, 48, 0.16);
  }

  :global(html[data-theme="light"]) .file {
    color: #8a5a12;
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
