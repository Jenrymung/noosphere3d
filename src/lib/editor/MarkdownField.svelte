<script lang="ts">
  import { defaultKeymap } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
  import { onMount } from "svelte";

  let {
    text,
    placeholder,
    onChange,
  }: {
    text: string;
    placeholder: string;
    onChange: (value: string) => void;
  } = $props();

  let host = $state<HTMLDivElement | null>(null);

  const theme = EditorView.theme(
    {
      "&": {
        background: "#0e1620",
        color: "#e7eef6",
        fontSize: "14px",
      },
      "&.cm-focused": {
        outline: "1px solid #e2b657",
      },
      ".cm-scroller": {
        fontFamily: "ui-monospace, 'Source Sans 3', sans-serif",
        minHeight: "9rem",
        maxHeight: "28vh",
      },
      ".cm-content": {
        padding: "8px 10px",
        caretColor: "#ffe7a3",
      },
      ".cm-placeholder": {
        color: "#7d8fa3",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "#ffe7a3",
      },
    },
    { dark: true },
  );

  onMount(() => {
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: text,
        extensions: [
          keymap.of(defaultKeymap),
          markdown(),
          EditorView.lineWrapping,
          placeholderExt(placeholder || "Write the note in Markdown"),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
  });
</script>

<div class="cm-host" bind:this={host}></div>

<style>
  .cm-host {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    overflow: hidden;
  }
</style>
