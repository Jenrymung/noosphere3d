<script lang="ts">
  import { sortedLinkTypes } from "$lib/core/graph";
  import { linkLabel, nodeTitle } from "$lib/core/title";
  import type { MapDocument } from "$lib/core/types";
  import { renderMarkdown } from "$lib/editor/markdown";
  import MarkdownField from "$lib/editor/MarkdownField.svelte";

  type Target = { kind: "node" | "link"; id: string };

  let {
    doc,
    shown,
    mode,
    pinned,
    editToken,
    focusToken,
    seedText,
    seedTitle,
    seedPlaceholder,
    onText,
    onTitle,
    onEscape,
    onCommit,
    onEdit,
    onPin,
    onOpen,
    onUndo,
    onRedo,
    documentMarkdown = null,
    documentTitle = "Third-party notices",
  }: {
    doc: MapDocument;
    shown: Target | null;
    mode: "read" | "edit";
    pinned: boolean;
    editToken: number;
    focusToken: number;
    seedText: string;
    seedTitle: string;
    seedPlaceholder: string;
    onText: (value: string) => void;
    onTitle: (value: string) => void;
    onEscape: () => void;
    onCommit: () => void;
    onEdit: () => void;
    onPin: () => void;
    onOpen: (target: Target) => void;
    onUndo: () => void;
    onRedo: () => void;
    /** Bundled markdown shown instead of the selected note. Null keeps the map Reader. */
    documentMarkdown?: string | null;
    documentTitle?: string;
  } = $props();

  let root = $state<HTMLElement | null>(null);
  let prose = $state<HTMLElement | null>(null);
  let titleEl = $state<HTMLInputElement | null>(null);
  let draftText = $state("");
  let draftTitle = $state("");

  $effect(() => {
    if (mode !== "edit") return;
    editToken;
    draftText = seedText;
    draftTitle = seedTitle;
  });

  let headingEl = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    if (mode !== "read") return;
    focusToken;
    queueMicrotask(() => headingEl?.focus());
  });

  const documentMode = $derived(documentMarkdown !== null);
  const node = $derived(shown?.kind === "node" ? doc.nodes[shown.id] : undefined);
  const link = $derived(shown?.kind === "link" ? doc.links[shown.id] : undefined);
  const reading = $derived(documentMode ? (documentMarkdown ?? "") : mode === "read" ? (node?.text ?? link?.text ?? "") : draftText);
  const html = $derived(renderMarkdown(reading));

  const groups = $derived.by(() => {
    if (!shown || shown.kind !== "node") return [];
    const buckets = new Map<string, { id: string; name: string; color: string; items: { id: string; label: string }[] }>();
    for (const { id: typeId, type } of sortedLinkTypes(doc)) {
      buckets.set(typeId, { id: typeId, name: type.name, color: type.color, items: [] });
    }
    for (const [id, item] of Object.entries(doc.links)) {
      if (item.source !== shown.id && item.target !== shown.id) continue;
      const otherId = item.source === shown.id ? item.target : item.source;
      const other = doc.nodes[otherId];
      const bucket = buckets.get(item.typeId) ?? {
        id: item.typeId,
        name: doc.linkTypes[item.typeId]?.name ?? item.typeId,
        color: "#999999",
        items: [],
      };
      bucket.items.push({ id, label: other ? nodeTitle(other) || "Untitled" : otherId });
      buckets.set(item.typeId, bucket);
    }
    return [...buckets.values()].filter((bucket) => bucket.items.length > 0);
  });

  const header = $derived.by(() => {
    if (documentMode) {
      return {
        kicker: "Notices",
        title: documentTitle,
        meta: "Bundled with this build. Works offline.",
        color: "#9bb0c4",
      };
    }
    if (!shown) return { kicker: "Reader", title: "Nothing open", meta: "Select a node, or press Mod+Enter to start a map.", color: "#9bb0c4" };
    if (shown.kind === "node") {
      const title = node ? nodeTitle(node) || "Untitled" : "Missing node";
      return {
        kicker: mode === "edit" ? "Edit node" : "Reader",
        title,
        meta: node ? `${groups.reduce((sum, group) => sum + group.items.length, 0)} links` : "This node is gone",
        color: node?.style?.color ?? "#d5dbe6",
      };
    }
    const type = link ? doc.linkTypes[link.typeId] : undefined;
    const label = link ? linkLabel(link, type) : null;
    const source = link ? endpoint(link.source) : "";
    const target = link ? endpoint(link.target) : "";
    const mark = type?.direction === "bidirectional" ? "↔" : type?.direction === "undirected" ? "—" : "→";
    return {
      kicker: mode === "edit" ? "Edit link" : "Link",
      title: label?.title || type?.name || "Link",
      meta: link ? `${source} ${mark} ${type?.name ?? "Unknown type"} ${mark} ${target}` : "This link is gone",
      color: type?.color ?? "#999999",
    };
  });

  function endpoint(id: string): string {
    const item = doc.nodes[id];
    return item ? nodeTitle(item) || "Untitled" : id;
  }

  function onPanelKey(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key === "Enter" && mod) {
      if (mode !== "edit") return;
      event.preventDefault();
      event.stopPropagation();
      onCommit();
      return;
    }
    if (mod && event.code === "Backslash") {
      event.preventDefault();
      event.stopPropagation();
      onPin();
      return;
    }
    if (mod && event.code === "KeyZ" && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (mod && event.code === "KeyY" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      onRedo();
      return;
    }
    if (mode === "edit" && event.altKey && event.code === "KeyT") {
      event.preventDefault();
      if (document.activeElement === titleEl) root?.querySelector<HTMLElement>(".cm-content")?.focus();
      else titleEl?.focus();
      return;
    }
    if (documentMode && mode === "read" && (event.code === "KeyE" || event.key === "Enter") && !mod && !event.altKey) {
      event.preventDefault();
      return;
    }
    if (mode === "read" && event.target instanceof HTMLAnchorElement) return;
    if (mode === "read" && event.code === "KeyE" && !mod && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      onEdit();
      return;
    }
    if (mode === "read" && event.key === "Enter" && !mod) {
      event.preventDefault();
      onEdit();
      return;
    }
    if (mode !== "read" || !prose) return;
    const line = 48;
    if (event.key === "ArrowDown") prose.scrollBy({ top: line });
    else if (event.key === "ArrowUp") prose.scrollBy({ top: -line });
    else if (event.key === "PageDown" || event.key === " ") prose.scrollBy({ top: prose.clientHeight * 0.9 });
    else if (event.key === "PageUp") prose.scrollBy({ top: -prose.clientHeight * 0.9 });
    else return;
    event.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="reader" class:wide={documentMode} id="region-reader" data-editor-root role="complementary" aria-labelledby="reader-title" bind:this={root} onkeydown={onPanelKey}>
  <header class="reader-head">
    <span class="swatch" style:background={header.color}></span>
    <div>
      <p class="kicker">{header.kicker}</p>
      <h2 id="reader-title" tabindex="-1" bind:this={headingEl}>{header.title}</h2>
      <p class="meta">{header.meta}</p>
    </div>
    {#if !documentMode}
      <button type="button" class:on={pinned} aria-pressed={pinned} onclick={onPin}>
        {pinned ? "Pinned" : "Pin"}
      </button>
    {/if}
  </header>

  {#if mode === "edit" && shown && !documentMode}
    <label class="title-field">
      <span>Title</span>
      <input
        bind:this={titleEl}
        bind:value={draftTitle}
        placeholder={seedPlaceholder || "Derived from the first line"}
        oninput={() => onTitle(draftTitle)}
      />
    </label>
    {#key editToken}
      <MarkdownField text={seedText} placeholder="Markdown body" onChange={(value) => { draftText = value; onText(value); }} />
    {/key}
    <p class="kicker preview-label">Preview</p>
  {/if}

  {#if !documentMode && shown?.kind === "node" && groups.length > 0 && mode === "read"}
    <div class="groups">
      {#each groups as group (group.id)}
        <p class="type-name"><span class="swatch tiny" style:background={group.color}></span>{group.name}</p>
        <ul>
          {#each group.items as item (item.id)}
            <li><button type="button" onclick={() => onOpen({ kind: "link", id: item.id })}>{item.label}</button></li>
          {/each}
        </ul>
      {/each}
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="prose" role="region" aria-label={documentMode ? "Third-party notices" : "Note"} tabindex="0" bind:this={prose}>
    {#if documentMode}
      {@html html}
    {:else if !shown}
      <p class="empty">Nothing is open. Press Enter on a node, or Mod+Enter to place a new one.</p>
    {:else if !reading.trim()}
      <p class="empty">This note is empty. Press E to write it.</p>
    {:else}
      {@html html}
    {/if}
  </div>
  <p class="hint">
    {#if documentMode}
      Esc closes · arrows scroll · F6 moves between regions
    {:else if mode === "edit"}
      Esc steps back · Mod+Enter keeps it and opens the Reader · Alt+T title
    {:else}
      E edits · Esc closes · arrows scroll
    {/if}
  </p>
</aside>

<style>
  .reader {
    pointer-events: auto;
    position: absolute;
    z-index: 3;
    top: 16px;
    right: 16px;
    bottom: 52px;
    width: min(380px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .reader.wide {
    width: min(720px, calc(100vw - 32px));
  }

  .reader-head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .reader-head div {
    flex: 1;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    line-height: 1.25;
  }

  h2:focus-visible {
    outline: 2px solid #e2b657;
    outline-offset: 3px;
  }

  .kicker,
  .meta,
  .hint,
  .empty,
  .type-name {
    margin: 0;
    color: #9aabbd;
    font-size: 13px;
  }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8ea0b5;
  }

  .swatch {
    width: 12px;
    height: 16px;
    margin-top: 4px;
    border-radius: 2px;
    flex: none;
  }

  .swatch.tiny {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin: 0 6px 0 0;
  }

  button {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e7eef6;
    border-radius: 999px;
    padding: 4px 10px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  button.on,
  button:hover {
    border-color: #e2b657;
    color: #fff6dc;
  }

  .title-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: #8ea0b5;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  input {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0e1620;
    color: #e7eef6;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 15px;
    letter-spacing: 0;
    text-transform: none;
  }

  input:focus {
    outline: 1px solid #e2b657;
  }

  .groups ul {
    list-style: none;
    margin: 4px 0 8px;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .prose {
    flex: 1;
    overflow: auto;
    padding-right: 4px;
    line-height: 1.45;
    outline: none;
  }

  .prose:focus {
    outline: 1px solid rgba(226, 182, 87, 0.45);
    border-radius: 8px;
  }

  .preview-label {
    margin-top: 2px;
  }

  :global(.reader .prose h1),
  :global(.reader .prose h2),
  :global(.reader .prose h3) {
    margin: 0.4em 0 0.2em;
    font-size: 1.05rem;
  }

  :global(.reader .prose p),
  :global(.reader .prose ul) {
    margin: 0.35em 0;
  }

  :global(.reader .prose table) {
    border-collapse: collapse;
    width: max-content;
    max-width: none;
    font-size: 12px;
  }

  :global(.reader .prose th),
  :global(.reader .prose td) {
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 3px 6px;
    text-align: left;
    vertical-align: top;
  }

  :global(.reader .prose a) {
    color: #9ecbff;
  }

  :global(.reader .prose code) {
    font-family: ui-monospace, monospace;
    background: rgba(255, 255, 255, 0.06);
    padding: 0 4px;
    border-radius: 4px;
  }

  :global(.reader .image-placeholder) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
    margin: 8px 0;
    padding: 8px 10px;
    border: 1px dashed rgba(255, 255, 255, 0.24);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
  }

  :global(.reader .image-label) {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #e2b657;
  }

  :global(.reader .image-src) {
    color: #8ea0b5;
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .reader {
      top: auto;
      left: 8px;
      right: 8px;
      width: auto;
      max-height: 46vh;
    }
  }
</style>
