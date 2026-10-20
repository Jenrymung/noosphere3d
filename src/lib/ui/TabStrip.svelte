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

<div class="tabs" id="region-tabs" role="tablist" aria-label="Open maps" tabindex="0">
  {#each tabs as tab (tab.id)}
    <div class="tab" class:on={tab.id === activeId} role="presentation">
      <button
        type="button"
        role="tab"
        aria-selected={tab.id === activeId}
        aria-label={tab.mark ? `${tab.title}, unsaved` : undefined}
        onclick={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".close")) onClose(tab.id);
          else onActivate(tab.id);
        }}
      >
        {#if tab.mark}<span class="dot" aria-hidden="true">●</span>{/if}
        <span class="name">{tab.title}</span>
        <span class="close" aria-hidden="true">×</span>
      </button>
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

  .tabs:focus-visible {
    outline: 2px solid #e2b657;
    outline-offset: 3px;
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
    display: flex;
    align-items: center;
    padding: 4px 0 4px 10px;
    max-width: 200px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    padding: 4px 8px 4px 6px;
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
