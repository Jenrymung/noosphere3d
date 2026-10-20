<script lang="ts">
  import { paletteResults, type PaletteCommand, type PaletteHit, type PaletteNode } from "$lib/input/palette";

  let {
    commands,
    nodes,
    onRun,
    onClose,
  }: {
    commands: PaletteCommand[];
    nodes: PaletteNode[];
    onRun: (hit: PaletteHit) => void;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let field = $state<HTMLInputElement | null>(null);
  const results = $derived(paletteResults(commands, nodes, query));

  $effect(() => {
    query;
    index = 0;
  });

  $effect(() => {
    queueMicrotask(() => field?.focus());
  });

  function choose(next: number) {
    if (results.length === 0) return;
    index = (next + results.length) % results.length;
  }

  function onKey(event: KeyboardEvent) {
    const inside = event.target instanceof Node && Boolean(field?.closest(".palette")?.contains(event.target));
    if (!inside && event.key !== "Escape") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      choose(index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      choose(index - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const hit = results[index];
      if (hit) onRun(hit);
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="palette" data-overlay role="dialog" aria-modal="true" aria-labelledby="palette-title">
  <p class="kicker" id="palette-title">Command palette</p>
  <input
    bind:this={field}
    bind:value={query}
    placeholder="Commands and nodes. > commands, @ nodes"
    aria-label="Search commands and nodes"
    aria-controls="palette-results"
    oninput={() => (index = 0)}
  />
  <ul id="palette-results" role="listbox">
    {#each results as hit, itemIndex (hit.kind + hit.id)}
      <li>
        <button
          type="button"
          role="option"
          aria-selected={itemIndex === index}
          class:on={itemIndex === index}
          onclick={() => onRun(hit)}
          onpointerenter={() => (index = itemIndex)}
        >
          <span>{hit.label}</span>
          <span class="keys">{hit.kind === "command" ? hit.keys : "Node"}</span>
        </button>
      </li>
    {:else}
      <li class="empty">No matches</li>
    {/each}
  </ul>
</div>

<style>
  .palette {
    pointer-events: auto;
    position: absolute;
    z-index: 8;
    top: 14vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 24px));
    padding: 14px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
    color: #e7eef6;
  }

  .kicker {
    margin: 0 0 8px;
    color: #9aabbd;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: #0e1620;
    color: #e7eef6;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 16px;
  }

  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    max-height: min(46vh, 360px);
    overflow: auto;
  }

  button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
    padding: 7px 8px;
    border-radius: 8px;
    cursor: pointer;
  }

  button.on,
  button:hover {
    background: rgba(226, 182, 87, 0.16);
  }

  .keys,
  .empty {
    color: #9aabbd;
    font-size: 13px;
  }

  .empty {
    padding: 8px;
  }

  :global(html[data-theme="light"]) .palette {
    background: #f7f4ee;
    color: #1c2430;
  }

  :global(html[data-theme="light"]) .palette input {
    background: #fff;
    color: #1c2430;
  }
</style>
