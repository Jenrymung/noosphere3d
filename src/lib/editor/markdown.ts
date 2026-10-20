import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

markdown.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const alt = escapeHtml(token.content || "Untitled image");
  const src = escapeHtml(token.attrGet("src") ?? "");
  const file = src ? `<span class="image-src">${src}</span>` : "";
  return `<p class="image-placeholder"><span class="image-label">Image</span> ${alt}${file}</p>`;
};

markdown.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  if (token.attrIndex("target") < 0) token.attrPush(["target", "_blank"]);
  if (token.attrIndex("rel") < 0) token.attrPush(["rel", "noopener noreferrer"]);
  return self.renderToken(tokens, index, options);
};

/** Render note Markdown. Raw HTML is off, then DOMPurify. Images become placeholders. */
export function renderMarkdown(source: string): string {
  const prepared = (source ?? "")
    .replace(/^(\s*[-*+]\s+)\[ \]/gm, "$1☐")
    .replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, "$1☑");
  const html = markdown.render(prepared);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "class"],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
