<script lang="ts">
  import type { Preferences } from "$lib/io/preferences";

  let { preferences, onChange, onClose }: { preferences: Preferences; onChange: (next: Preferences) => void; onClose: () => void } =
    $props();

  function patch(partial: Partial<Preferences>) {
    onChange({ ...preferences, ...partial });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="prefs" data-overlay role="dialog" aria-modal="true" aria-labelledby="prefs-title">
  <header>
    <p class="kicker">Preferences</p>
    <h2 id="prefs-title">This computer</h2>
  </header>

  <fieldset>
    <legend>Saving</legend>
    <label>
      Save mode
      <select value={preferences.saveMode} onchange={(event) => patch({ saveMode: (event.currentTarget as HTMLSelectElement).value as Preferences["saveMode"] })}>
        <option value="manual">Manual</option>
        <option value="autosave">Autosave to file</option>
      </select>
    </label>
    <label>
      Autosave delay (seconds)
      <input type="number" min="0.2" max="60" step="0.1" value={preferences.autosaveDelayMs / 1000} onchange={(event) => patch({ autosaveDelayMs: Number((event.currentTarget as HTMLInputElement).value) * 1000 })} />
    </label>
    <label>
      Autosave maximum interval (seconds)
      <input type="number" min="1" max="300" step="1" value={preferences.autosaveMaxIntervalMs / 1000} onchange={(event) => patch({ autosaveMaxIntervalMs: Number((event.currentTarget as HTMLInputElement).value) * 1000 })} />
    </label>
    <label>
      Backups to keep
      <input type="number" min="0" max="50" step="1" value={preferences.backupKeep} onchange={(event) => patch({ backupKeep: Number((event.currentTarget as HTMLInputElement).value) })} />
    </label>
    <label>
      Backup location
      <select value={preferences.backupLocation} onchange={(event) => patch({ backupLocation: (event.currentTarget as HTMLSelectElement).value as Preferences["backupLocation"] })}>
        <option value="app-data">App data folder</option>
        <option value="beside">Next to the map</option>
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>Appearance</legend>
    <label>
      Theme
      <select value={preferences.theme} onchange={(event) => patch({ theme: (event.currentTarget as HTMLSelectElement).value as Preferences["theme"] })}>
        <option value="system">System</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    </label>
    <label>
      Label size ({Math.round(preferences.labelScale * 100)}%)
      <input type="range" min="70" max="180" step="5" value={Math.round(preferences.labelScale * 100)} oninput={(event) => patch({ labelScale: Number((event.currentTarget as HTMLInputElement).value) / 100 })} />
    </label>
    <label>
      Reduced motion
      <select value={preferences.reduceMotion} onchange={(event) => patch({ reduceMotion: (event.currentTarget as HTMLSelectElement).value as Preferences["reduceMotion"] })}>
        <option value="system">Follow the system</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" checked={preferences.dimLonely} onchange={(event) => patch({ dimLonely: (event.currentTarget as HTMLInputElement).checked })} />
      Dim nodes with no visible links
    </label>
    <label class="check">
      <input type="checkbox" checked={preferences.showAxisGizmo} onchange={(event) => patch({ showAxisGizmo: (event.currentTarget as HTMLInputElement).checked })} />
      Show the corner axis gizmo
    </label>
  </fieldset>

  <fieldset>
    <legend>Linking</legend>
    <label class="check">
      <input type="checkbox" checked={preferences.skipPicker} onchange={(event) => patch({ skipPicker: (event.currentTarget as HTMLInputElement).checked })} />
      Skip the picker and use the last type
    </label>
  </fieldset>

  <div class="row">
    <button type="button" onclick={onClose}>Done</button>
  </div>
  <p class="hint">These settings stay on this computer. Esc closes the window.</p>
</div>

<style>
  .prefs {
    pointer-events: auto;
    position: absolute;
    z-index: 6;
    top: 72px;
    left: 50%;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 24px));
    max-height: min(78vh, 720px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    background: rgba(12, 18, 28, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
    color: #e7eef6;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .kicker,
  .hint {
    margin: 0;
    color: #9aabbd;
    font-size: 13px;
  }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  fieldset {
    margin: 12px 0 0;
    padding: 8px 10px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }

  legend {
    padding: 0 4px;
    color: #8ea0b5;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
  select,
  button {
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
    margin-top: 12px;
  }

  button {
    cursor: pointer;
  }

  .hint {
    margin-top: 8px;
  }

  :global(html[data-theme="light"]) .prefs {
    background: #f7f4ee;
    color: #1c2430;
    border-color: rgba(28, 36, 48, 0.14);
  }

  :global(html[data-theme="light"]) .prefs .kicker,
  :global(html[data-theme="light"]) .prefs .hint,
  :global(html[data-theme="light"]) .prefs label,
  :global(html[data-theme="light"]) .prefs legend {
    color: #3d4b5c;
  }

  :global(html[data-theme="light"]) .prefs {
    background: #f7f4ee;
    color: #1c2430;
    border-color: rgba(28, 36, 48, 0.14);
  }

  :global(html[data-theme="light"]) .prefs .kicker,
  :global(html[data-theme="light"]) .prefs .hint,
  :global(html[data-theme="light"]) .prefs label,
  :global(html[data-theme="light"]) .prefs legend {
    color: #3d4b5c;
  }

  @media (max-width: 720px) {
    .prefs {
      top: auto;
      bottom: 48px;
      left: 8px;
      right: 8px;
      width: auto;
      transform: none;
    }
  }
</style>
