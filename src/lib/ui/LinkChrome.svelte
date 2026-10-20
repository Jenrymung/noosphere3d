<script lang="ts">
  import { untrack } from "svelte";
  import type { TypeDraft } from "$lib/input/linkForm";
  import type { TypeRow } from "$lib/input/linkOps";
  import { fuzzyRank } from "$lib/input/linkOps";

  type Screen =
    | { name: "picker"; purpose: string }
    | { name: "legend" }
    | { name: "manager" }
    | { name: "search" }
    | { name: "follow" };

  let {
    screen,
    rows,
    nodes,
    followRows,
    filters,
    dimLonely,
    skipPicker,
    defaultTypeId,
    highlightId = "",
    onClose,
    onPick,
    onFilter,
    onSolo,
    onShowAll,
    onDimLonely,
    onSkipPicker,
    onOpenManager,
    onSaveType,
    onAddType,
    onDeleteType,
    onReorder,
    onDefault,
    onSearch,
    onFollow,
    onUndo,
    onRedo,
  }: {
    screen: Screen;
    rows: TypeRow[];
    nodes: { id: string; title: string }[];
    followRows: { key: string; label: string }[];
    filters: Record<string, string>;
    dimLonely: boolean;
    skipPicker: boolean;
    defaultTypeId: string;
    highlightId?: string;
    onClose: () => void;
    onPick: (id: string) => void;
    onFilter: (id: string, state: "shown" | "dimmed" | "hidden") => void;
    onSolo: (id: string) => void;
    onShowAll: () => void;
    onDimLonely: (on: boolean) => void;
    onSkipPicker: (on: boolean) => void;
    onOpenManager: (id: string) => void;
    onSaveType: (id: string, draft: TypeDraft) => void;
    onAddType: (draft: TypeDraft) => void;
    onDeleteType: (id: string, mode: "reassign" | "delete-links", to: string) => void;
    onReorder: (id: string, delta: -1 | 1) => void;
    onDefault: (id: string) => void;
    onSearch: (id: string) => void;
    onFollow: (index: number) => void;
    onUndo: () => void;
    onRedo: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let form = $state<TypeDraft | null>(null);
  let formTitle = $state("New type");
  let editingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let reassignTo = $state("");

  const listed = $derived.by(() => {
    if (screen.name === "picker") return fuzzyRank(rows, query, (row) => `${row.name} ${row.description ?? ""}`);
    if (screen.name === "search") return fuzzyRank(nodes, query, (node) => node.title).slice(0, 12);
    if (screen.name === "follow") return followRows;
    return rows;
  });

  $effect(() => {
    screen.name;
    query = "";
    const start = untrack(() => (screen.name === "picker" ? rows.findIndex((row) => row.id === highlightId) : 0));
    index = start < 0 ? 0 : start;
    form = null;
    deletingId = null;
    editingId = null;
  });

  function clamp(value: number) {
    const size = listed.length;
    if (size === 0) return 0;
    return (value + size) % size;
  }

  function draftFrom(row: TypeRow): TypeDraft {
    return {
      name: row.name,
      color: row.color,
      pattern: row.pattern,
      width: row.width,
      direction: row.direction,
      icon: row.icon ?? "",
      description: row.description ?? "",
    };
  }

  function blankDraft(name: string): TypeDraft {
    return {
      name: name.trim() || "New type",
      color: "#56B4E9",
      pattern: "solid",
      width: "normal",
      direction: "directed",
      icon: "",
      description: "",
    };
  }

  function onKey(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    const target = event.target as HTMLElement | null;
    const typing = Boolean(target?.closest("input, textarea, select"));
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (deletingId) deletingId = null;
      else if (form) form = null;
      else onClose();
      return;
    }
    if (typing) return;
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
    if (event.code === "KeyL" && event.shiftKey && !event.altKey) {
      if ((!mod && screen.name === "legend") || (mod && screen.name === "manager")) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
    }
    if (screen.name === "manager" && (event.key === "Delete" || event.key === "Backspace") && !mod && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const row = rows[index];
      if (row) openDelete(row.id);
      return;
    }
    const digit = digitOf(event);
    if (digit && screen.name !== "manager") {
      event.preventDefault();
      event.stopPropagation();
      if (screen.name === "follow") {
        if (digit <= followRows.length) onFollow(digit - 1);
        return;
      }
      const row = rows.find((item) => item.digit === digit);
      if (row && screen.name === "picker") onPick(row.id);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (screen.name === "manager" && event.altKey) {
        const row = rows[index];
        if (!row) return;
        const delta = event.key === "ArrowUp" ? -1 : 1;
        const next = index + delta;
        if (next < 0 || next >= rows.length) return;
        onReorder(row.id, delta);
        index = next;
        return;
      }
      index = clamp(index + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" && !mod) {
      event.preventDefault();
      event.stopPropagation();
      choose();
      return;
    }
    if (mod && event.code === "KeyN" && (screen.name === "picker" || screen.name === "manager")) {
      event.preventDefault();
      event.stopPropagation();
      formTitle = "New type";
      editingId = null;
      form = blankDraft(query);
      return;
    }
    if (screen.name === "legend" && event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      const row = rows[index];
      if (!row) return;
      const state = filters[row.id] ?? "shown";
      const next = state === "shown" ? "dimmed" : state === "dimmed" ? "hidden" : "shown";
      onFilter(row.id, next);
      return;
    }
    if (screen.name === "legend" && event.code === "KeyS" && !mod) {
      event.preventDefault();
      event.stopPropagation();
      const row = rows[index];
      if (row) onSolo(row.id);
      return;
    }
    if (screen.name === "legend" && event.code === "KeyA" && !mod) {
      event.preventDefault();
      event.stopPropagation();
      onShowAll();
      return;
    }
    if ((screen.name === "picker" || screen.name === "search") && event.key.length === 1 && !mod && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      query += event.key;
      index = 0;
      return;
    }
    if ((screen.name === "picker" || screen.name === "search") && event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      query = query.slice(0, -1);
      index = 0;
    }
  }

  function choose() {
    if (screen.name === "picker") {
      const row = listed[index] as TypeRow | undefined;
      if (row) onPick(row.id);
    } else if (screen.name === "search") {
      const node = listed[index] as { id: string } | undefined;
      if (node) onSearch(node.id);
    } else if (screen.name === "follow") {
      if (followRows[index]) onFollow(index);
    } else if (screen.name === "legend") {
      const row = rows[index];
      if (row) onOpenManager(row.id);
    } else if (screen.name === "manager") {
      const row = rows[index];
      if (!row) return;
      formTitle = row.name;
      editingId = row.id;
      form = draftFrom(row);
    }
  }

  function digitOf(event: KeyboardEvent): number | null {
    if (event.altKey || event.metaKey || event.ctrlKey) return null;
    const match = /^Digit([1-9])$/.exec(event.code);
    return match ? Number(match[1]) : null;
  }

  function stateOf(id: string): string {
    return filters[id] ?? "shown";
  }

  function openDelete(id: string) {
    deletingId = id;
    reassignTo = rows.find((item) => item.id === defaultTypeId && item.id !== id)?.id ?? rows.find((item) => item.id !== id)?.id ?? "";
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<section class="chrome" class:legend={screen.name === "legend"} data-overlay>
  {#if form}
    <header>
      <p class="kicker">{formTitle}</p>
      <h2>{editingId ? "Edit type" : "New type"}</h2>
    </header>
    <label>Name <input bind:value={form.name} /></label>
    <label>Colour <input bind:value={form.color} spellcheck="false" /></label>
    <label>
      Pattern
      <select bind:value={form.pattern}>
        <option value="solid">solid</option>
        <option value="dashed">dashed</option>
        <option value="dotted">dotted</option>
      </select>
    </label>
    <label>
      Width
      <select bind:value={form.width}>
        <option value="thin">thin</option>
        <option value="normal">normal</option>
        <option value="thick">thick</option>
      </select>
    </label>
    <label>
      Direction
      <select bind:value={form.direction}>
        <option value="directed">directed</option>
        <option value="bidirectional">bidirectional</option>
        <option value="undirected">undirected</option>
      </select>
    </label>
    <label>Icon <input bind:value={form.icon} maxlength="8" /></label>
    <label>Description <input bind:value={form.description} /></label>
    <div class="row">
      <button
        type="button"
        onclick={() => {
          if (!form) return;
          if (editingId) onSaveType(editingId, form);
          else onAddType(form);
          form = null;
        }}>Save</button
      >
      <button type="button" onclick={() => (form = null)}>Cancel</button>
    </div>
  {:else if deletingId}
    {@const row = rows.find((item) => item.id === deletingId)}
    {@const others = rows.filter((item) => item.id !== deletingId)}
    <header>
      <p class="kicker">Delete type</p>
      <h2>{row?.name}</h2>
    </header>
    {#if others.length === 0}
      <p class="meta">A map keeps at least one link type.</p>
      <div class="row">
        <button type="button" onclick={() => (deletingId = null)}>Close</button>
      </div>
    {:else}
      <p class="meta">{row?.count ?? 0} links use this type. Move them, or delete the links too.</p>
      <label>
        Move links to
        <select bind:value={reassignTo}>
          {#each others as item (item.id)}
            <option value={item.id}>{item.name}</option>
          {/each}
        </select>
      </label>
      <div class="row">
        <button
          type="button"
          onclick={() => {
            if (deletingId && reassignTo) onDeleteType(deletingId, "reassign", reassignTo);
            deletingId = null;
          }}>Move links</button
        >
        <button
          type="button"
          onclick={() => {
            if (deletingId && reassignTo) onDeleteType(deletingId, "delete-links", reassignTo);
            deletingId = null;
          }}>Delete links</button
        >
        <button type="button" onclick={() => (deletingId = null)}>Cancel</button>
      </div>
    {/if}
  {:else}
    <header>
      <p class="kicker">
        {screen.name === "picker" ? "Type" : screen.name === "legend" ? "Legend" : screen.name === "manager" ? "Link types" : screen.name === "search" ? "Target" : "Follow"}
      </p>
      <h2>
        {screen.name === "picker"
          ? "Choose a link type"
          : screen.name === "search"
            ? "Find a node"
            : screen.name === "follow"
              ? "Which link?"
              : screen.name === "legend"
                ? "Line styles"
                : "Manage types"}
      </h2>
      {#if screen.name === "picker" || screen.name === "search"}
        <p class="query">{query || "Type to search"}</p>
      {/if}
    </header>
    <ul>
      {#each listed as item, itemIndex (screen.name === "search" ? (item as { id: string }).id : screen.name === "follow" ? (item as { key: string }).key : (item as TypeRow).id)}
        <li class:on={itemIndex === index}>
          {#if screen.name === "search"}
            <button type="button" onclick={() => onSearch((item as { id: string }).id)}>{(item as { title: string }).title}</button>
          {:else if screen.name === "follow"}
            <button type="button" onclick={() => onFollow(itemIndex)}>{itemIndex < 9 ? `${itemIndex + 1} ` : ""}{(item as { label: string }).label}</button>
          {:else}
            {@const row = item as TypeRow}
            <button
              type="button"
              onclick={() => (screen.name === "legend" ? onOpenManager(row.id) : screen.name === "manager" ? ((editingId = row.id), (formTitle = row.name), (form = draftFrom(row))) : onPick(row.id))}
            >
              <span class="swatch" style:background={row.color}></span>
              {#if row.digit}<kbd>{row.digit}</kbd>{/if}
              <span class="name" class:unused={row.count === 0}>{row.icon ? `${row.icon} ` : ""}{row.name}</span>
              <span class="count">{row.count}</span>
              {#if screen.name === "manager"}
                <span class="state">{row.pattern} · {row.direction === "bidirectional" ? "both ways" : row.direction}</span>
              {:else if screen.name === "legend"}
                <span class="state">{stateOf(row.id)}</span>
              {/if}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if screen.name === "legend"}
      <div class="row">
        <button type="button" onclick={onShowAll}>Show all</button>
        <button type="button" class:on={dimLonely} onclick={() => onDimLonely(!dimLonely)}>Dim unlinked nodes</button>
      </div>
      <p class="hint">Space cycles shown, dimmed, hidden. S solos. A shows all. Esc returns to the map.</p>
    {:else if screen.name === "manager"}
      <label class="check"><input type="checkbox" checked={skipPicker} onchange={(event) => onSkipPicker((event.currentTarget as HTMLInputElement).checked)} /> Skip the picker and use the last type</label>
      <div class="row">
        <button type="button" onclick={() => { const row = rows[index]; if (row) onDefault(row.id); }}>Make default</button>
        <button type="button" onclick={() => { const row = rows[index]; if (row) openDelete(row.id); }}>Delete</button>
        <button type="button" onclick={() => { formTitle = "New type"; editingId = null; form = blankDraft(""); }}>New type</button>
      </div>
      <p class="hint">Alt+arrows reorder the number keys. The default is {rows.find((row) => row.id === defaultTypeId)?.name ?? "the first type"}.</p>
    {:else if screen.name === "picker"}
      <p class="hint">1–9 choose. Mod+N creates a type from the search. Esc goes back.</p>
    {:else}
      <p class="hint">Enter chooses. Esc goes back.</p>
    {/if}
  {/if}
</section>

<style>
  .chrome {
    pointer-events: auto;
    position: absolute;
    z-index: 4;
    top: 84px;
    left: 50%;
    transform: translateX(-50%);
    width: min(420px, calc(100vw - 32px));
    max-height: min(70vh, 640px);
    overflow: auto;
    padding: 14px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
  }

  .chrome.legend {
    top: auto;
    bottom: 52px;
    left: 292px;
    transform: none;
    width: min(360px, calc(100vw - 320px));
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .kicker,
  .meta,
  .hint,
  .query,
  .state,
  .count {
    margin: 0;
    color: #9aabbd;
    font-size: 13px;
  }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .query {
    margin-top: 6px;
    color: #ffe7a3;
  }

  ul {
    list-style: none;
    margin: 10px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  li.on button {
    border-color: #e2b657;
    background: rgba(226, 182, 87, 0.08);
  }

  button {
    width: 100%;
    text-align: left;
    display: flex;
    gap: 8px;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #e7eef6;
    border-radius: 8px;
    padding: 6px 8px;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .swatch {
    width: 10px;
    height: 14px;
    border-radius: 2px;
    flex: none;
  }

  .name {
    flex: 1;
  }

  .name.unused {
    color: #7d8fa3;
  }

  kbd {
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 4px;
    padding: 0 4px;
    font-family: inherit;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    color: #8ea0b5;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  input,
  select {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0e1620;
    color: #e7eef6;
    border-radius: 8px;
    padding: 7px 8px;
    font: inherit;
    font-size: 14px;
    letter-spacing: 0;
    text-transform: none;
  }

  .check {
    flex-direction: row;
    align-items: center;
    text-transform: none;
    letter-spacing: 0;
    font-size: 14px;
    color: #d5e0ec;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .row button {
    width: auto;
  }

  .hint {
    margin-top: 8px;
  }

  @media (max-width: 720px) {
    .chrome,
    .chrome.legend {
      left: 8px;
      right: 8px;
      width: auto;
      transform: none;
      bottom: 48px;
      top: auto;
      max-height: 58vh;
    }
  }
</style>
