<script lang="ts">
  import { APP_VERSION, LICENCE_STATUS, THIRD_PARTY_NOTICES } from "$lib/about/notices";
  import { RELEASES_PAGE_URL } from "$lib/about/releases";

  let {
    logPath,
    onUpdates,
    onClose,
  }: {
    logPath: string;
    onUpdates: () => void;
    onClose: () => void;
  } = $props();

  let titleEl = $state<HTMLHeadingElement | null>(null);

  $effect(() => {
    queueMicrotask(() => titleEl?.focus());
  });

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="about" data-overlay role="dialog" aria-modal="true" aria-labelledby="about-title">
  <p class="kicker">Help</p>
  <h2 id="about-title" tabindex="-1" bind:this={titleEl}>About Noosphere 3D</h2>
  <p>Version {APP_VERSION}</p>
  <p>{LICENCE_STATUS}</p>
  <h3>Third-party notices</h3>
  <ul>
    {#each THIRD_PARTY_NOTICES as item (item.name)}
      <li><strong>{item.name}</strong> · {item.licence} · {item.note}</li>
    {/each}
  </ul>
  <h3>Error log</h3>
  <p class="path">{logPath}</p>
  <p class="hint">The log stays on this computer. Attach it yourself if you send a bug report.</p>
  <h3>Updates</h3>
  <p class="hint">Check for updates opens {RELEASES_PAGE_URL} in your browser. That address is a placeholder until the project is public. The app does not contact it.</p>
  <div class="row">
    <button type="button" onclick={onUpdates}>Check for updates</button>
    <button type="button" onclick={onClose}>Close</button>
  </div>
</div>

<style>
  .about {
    pointer-events: auto;
    position: absolute;
    z-index: 7;
    box-sizing: border-box;
    top: 72px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 24px));
    max-height: min(78vh, 720px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    background: #0c121c;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e7eef6;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
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
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #d5deea;
  }

  p,
  li {
    margin-top: 6px;
    font-size: 14px;
  }

  ul {
    margin: 6px 0 0;
    padding-left: 18px;
  }

  .kicker,
  .hint,
  .path {
    color: #d5deea;
  }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .path {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    word-break: break-all;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  button {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0e1620;
    color: #e7eef6;
    border-radius: 8px;
    padding: 7px 10px;
    font: inherit;
    cursor: pointer;
  }

  :global(html[data-theme="light"]) .about {
    background: #f7f4ee;
    color: #1c2430;
  }

  :global(html[data-theme="light"]) .about h3,
  :global(html[data-theme="light"]) .about .kicker,
  :global(html[data-theme="light"]) .about .hint,
  :global(html[data-theme="light"]) .about .path {
    color: #3e4c5e;
  }

  :global(html[data-theme="light"]) .about button {
    background: #fff;
    color: #1c2430;
  }

  @media (max-width: 720px) {
    .about {
      top: 12px;
      max-height: calc(100vh - 24px);
    }
  }
</style>
