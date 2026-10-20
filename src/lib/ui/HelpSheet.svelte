<script lang="ts">
  import { fuzzyScore } from "$lib/input/linkOps";

  let {
    sections,
    onClose,
  }: {
    sections: { title: string; rows: { keys: string; action: string }[] }[];
    onClose: () => void;
  } = $props();

  let query = $state("");
  let field = $state<HTMLInputElement | null>(null);

  const visible = $derived(
    sections
      .map((section) => ({
        title: section.title,
        rows: section.rows.filter((row) => fuzzyScore(query, `${row.keys} ${row.action}`) != null),
      }))
      .filter((section) => section.rows.length > 0),
  );

  $effect(() => {
    queueMicrotask(() => field?.focus());
  });

  function onKey(event: KeyboardEvent) {
    const inside = event.target instanceof Node && Boolean(field?.closest(".help")?.contains(event.target));
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "?" && inside && query.length === 0 && event.target === field) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!inside) return;
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="help" data-overlay role="dialog" aria-modal="true" aria-labelledby="help-title">
  <header>
    <p class="kicker">Keyboard</p>
    <h2 id="help-title">Shortcuts</h2>
  </header>
  <input bind:this={field} bind:value={query} placeholder="Search shortcuts" aria-label="Search shortcuts" />
  <div class="sheet">
    {#each visible as section (section.title)}
      <h3>{section.title}</h3>
      <table>
        <tbody>
          {#each section.rows as row (`${section.title}:${row.keys}`)}
            <tr>
              <th scope="row">{row.keys}</th>
              <td>{row.action}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="empty">No shortcuts match.</p>
    {/each}
  </div>
  <p class="hint">Generated from the keymap. Esc or ? closes it.</p>
</div>

<style>
  .help {
    pointer-events: auto;
    position: absolute;
    z-index: 8;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px, calc(100vw - 24px));
    max-height: min(78vh, 760px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
    color: #e7eef6;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 18px;
  }

  h3 {
    margin-top: 14px;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8ea0b5;
  }

  .kicker,
  .hint,
  .empty {
    color: #9aabbd;
    font-size: 13px;
  }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: #0e1620;
    color: #e7eef6;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 4px 8px 4px 0;
    font-weight: 450;
  }

  th {
    width: 38%;
    color: #ffe7a3;
    font-weight: 600;
  }

  .hint {
    margin-top: 12px;
  }

  :global(html[data-theme="light"]) .help {
    background: #f7f4ee;
    color: #1c2430;
  }

  :global(html[data-theme="light"]) .help input {
    background: #fff;
    color: #1c2430;
  }
</style>
