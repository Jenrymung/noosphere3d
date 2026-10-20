<script lang="ts">
  import type { RecoveryItem } from "$lib/io/bridge";

  export type AppDialog =
    | { kind: "close-tab"; title: string }
    | { kind: "quit"; titles: string[] }
    | { kind: "recovery"; items: RecoveryItem[] }
    | { kind: "conflict"; path: string }
    | { kind: "failure"; message: string }
    | { kind: "path"; purpose: "open" | "save"; suggested: string; files: string[] }
    | { kind: "notice"; message: string };

  let {
    dialog,
    onCloseTab,
    onQuit,
    onRecovery,
    onConflict,
    onFailure,
    onPath,
    onDismiss,
  }: {
    dialog: AppDialog;
    onCloseTab: (choice: "save" | "discard" | "cancel") => void;
    onQuit: (choice: "save-all" | "review" | "discard" | "cancel") => void;
    onRecovery: (choice: "restore" | "discard", id: string) => void;
    onConflict: (choice: "reload" | "save-as" | "cancel") => void;
    onFailure: (choice: "retry" | "save-as" | "cancel") => void;
    onPath: (path: string | null) => void;
    onDismiss: () => void;
  } = $props();

  let draft = $state("");

  $effect(() => {
    if (dialog.kind === "path") draft = dialog.suggested;
  });

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (dialog.kind === "close-tab") onCloseTab("cancel");
    else if (dialog.kind === "quit") onQuit("cancel");
    else if (dialog.kind === "conflict") onConflict("cancel");
    else if (dialog.kind === "failure") onFailure("cancel");
    else if (dialog.kind === "path") onPath(null);
    else onDismiss();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<section class="dialog" data-overlay role="dialog" aria-modal="true">
  {#if dialog.kind === "close-tab"}
    <p class="kicker">Close tab</p>
    <h2>{dialog.title}</h2>
    <p>This map has unsaved changes.</p>
    <div class="row">
      <button type="button" onclick={() => onCloseTab("save")}>Save</button>
      <button type="button" onclick={() => onCloseTab("discard")}>Don't save</button>
      <button type="button" onclick={() => onCloseTab("cancel")}>Cancel</button>
    </div>
  {:else if dialog.kind === "quit"}
    <p class="kicker">Quit</p>
    <h2>{dialog.titles.length} maps are unsaved</h2>
    <ul>
      {#each dialog.titles as title}
        <li>{title}</li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" onclick={() => onQuit("save-all")}>Save all</button>
      <button type="button" onclick={() => onQuit("review")}>Review each</button>
      <button type="button" onclick={() => onQuit("discard")}>Discard all</button>
      <button type="button" onclick={() => onQuit("cancel")}>Cancel</button>
    </div>
  {:else if dialog.kind === "recovery"}
    <p class="kicker">Recovery</p>
    <h2>Restore unsaved maps?</h2>
    <p>The last session ended before these maps were closed.</p>
    <ul>
      {#each dialog.items as item (item.id)}
        <li>
          <span>{item.title}</span>
          <span class="meta">{item.path || "Not saved yet"} · {item.savedAt.slice(0, 16).replace("T", " ")}</span>
          <span class="row">
            <button type="button" onclick={() => onRecovery("restore", item.id)}>Restore</button>
            <button type="button" onclick={() => onRecovery("discard", item.id)}>Discard</button>
          </span>
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" onclick={onDismiss}>Continue</button>
    </div>
  {:else if dialog.kind === "conflict"}
    <p class="kicker">File changed</p>
    <h2>Another program changed this map</h2>
    <p>{dialog.path}</p>
    <div class="row">
      <button type="button" onclick={() => onConflict("reload")}>Reload</button>
      <button type="button" onclick={() => onConflict("save-as")}>Keep mine (Save As)</button>
      <button type="button" onclick={() => onConflict("cancel")}>Cancel</button>
    </div>
  {:else if dialog.kind === "failure"}
    <p class="kicker">Save failed</p>
    <h2>The map is still open</h2>
    <p>{dialog.message}</p>
    <div class="row">
      <button type="button" onclick={() => onFailure("retry")}>Retry</button>
      <button type="button" onclick={() => onFailure("save-as")}>Save As…</button>
      <button type="button" onclick={() => onFailure("cancel")}>Cancel</button>
    </div>
  {:else if dialog.kind === "path"}
    <p class="kicker">{dialog.purpose === "open" ? "Open" : "Save as"}</p>
    <h2>{dialog.purpose === "open" ? "Choose a map" : "Name the map file"}</h2>
    {#if dialog.purpose === "open" && dialog.files.length > 0}
      <ul>
        {#each dialog.files as file}
          <li><button type="button" onclick={() => onPath(file)}>{file}</button></li>
        {/each}
      </ul>
    {/if}
    <label>
      Path
      <input bind:value={draft} spellcheck="false" />
    </label>
    <div class="row">
      <button type="button" onclick={() => onPath(draft.trim() || null)}>{dialog.purpose === "open" ? "Open" : "Save"}</button>
      <button type="button" onclick={() => onPath(null)}>Cancel</button>
    </div>
  {:else}
    <p>{dialog.message}</p>
    <div class="row">
      <button type="button" onclick={onDismiss}>Close</button>
    </div>
  {/if}
</section>

<style>
  .dialog {
    pointer-events: auto;
    position: absolute;
    z-index: 7;
    top: 88px;
    left: 50%;
    transform: translateX(-50%);
    width: min(460px, calc(100vw - 24px));
    max-height: min(70vh, 640px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
    color: #e7eef6;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }

  p,
  .meta {
    margin: 0;
    color: #c5d2e0;
    font-size: 14px;
  }

  .kicker {
    margin: 0 0 4px;
    color: #8ea0b5;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  ul {
    list-style: none;
    margin: 10px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  button,
  input {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: #e7eef6;
    border-radius: 8px;
    padding: 7px 10px;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  input {
    width: 100%;
    cursor: text;
    margin-top: 4px;
    background: #0e1620;
  }

  label {
    display: block;
    margin-top: 10px;
    color: #8ea0b5;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(html[data-theme="light"]) .dialog {
    background: #f7f4ee;
    color: #1c2430;
    border-color: rgba(28, 36, 48, 0.14);
  }

  :global(html[data-theme="light"]) .dialog p,
  :global(html[data-theme="light"]) .dialog .meta,
  :global(html[data-theme="light"]) .dialog .kicker {
    color: #3d4b5c;
  }

  @media (max-width: 720px) {
    .dialog {
      top: auto;
      bottom: 56px;
      left: 8px;
      right: 8px;
      width: auto;
      transform: none;
    }
  }
</style>
