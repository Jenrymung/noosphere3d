<script lang="ts">
  let {
    tabs,
    activeId,
    onActivate,
    onClose,
  }: {
    tabs: { id: string; title: string; mark: string }[];
    activeId: string;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
  } = $props();
</script>

<div class="tabs" role="tablist" aria-label="Open maps">
  {#each tabs as tab (tab.id)}
    <div class="tab" class:on={tab.id === activeId}>
      <button type="button" role="tab" aria-selected={tab.id === activeId} onclick={() => onActivate(tab.id)}>
        {#if tab.mark}<span class="dot" aria-hidden="true">●</span>{/if}
        {tab.title}
      </button>
      <button type="button" class="close" aria-label={`Close ${tab.title}`} onclick={() => onClose(tab.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .tabs {
    pointer-events: auto;
    display: flex;
    gap: 6px;
    overflow: auto;
    max-width: min(640px, 46vw);
  }

  .tab {
    display: flex;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(8, 12, 18, 0.55);
  }

  .tab.on {
    border-color: #e2b657;
  }

  button {
    border: 0;
    background: transparent;
    color: #e7eef6;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  button[role="tab"] {
    padding: 4px 4px 4px 10px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    padding: 4px 8px 4px 2px;
    color: #9aabbd;
  }

  .dot {
    color: #e2b657;
  }

  @media (max-width: 720px) {
    .tabs {
      max-width: 100%;
    }
  }
</style>
