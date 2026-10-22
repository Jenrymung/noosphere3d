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

/** Render note Markdown. Raw HTML is off, then DOMPurify. Images become placeholders. GFM tables become HTML tables. */
export function renderMarkdown(source: string): string {
  const prepared = (source ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^(\s*[-*+]\s+)\[ \]/gm, "$1☐")
    .replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, "$1☑");
  const html = renderMixed(prepared);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "class"],
  });
}

function renderMixed(source: string): string {
  const lines = source.split("\n");
  let html = "";
  const prose: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (prose.length === 0) return;
    html += markdown.render(prose.join("\n"));
    prose.length = 0;
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? "";
    const marker = fenceMarker(line);
    if (fence) {
      prose.push(line);
      if (marker === fence) fence = null;
      i += 1;
      continue;
    }
    if (marker) {
      prose.push(line);
      fence = marker;
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      flush();
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        rows.push(lines[i] ?? "");
        i += 1;
      }
      html += renderTable(rows);
      continue;
    }
    prose.push(line);
    i += 1;
  }
  flush();
  return html;
}

function fenceMarker(line: string): string | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match?.[1] ?? null;
}

function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = body.split("|");
  return cells.length >= 2 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function isTableRow(line: string): boolean {
  return line.trim().includes("|");
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? "";
  const delim = lines[index + 1] ?? "";
  if (/^ {4,}/.test(header)) return false;
  return header.includes("|") && isDelimiterRow(delim);
}

function splitCells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\" && text[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (text[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += text[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function renderTable(rows: string[]): string {
  const header = splitCells(rows[0] ?? "");
  const body = rows.slice(2).map((row) => {
    const cells = splitCells(row);
    while (cells.length < header.length) cells.push("");
    return cells.slice(0, header.length);
  });
  const head = header.map((cell) => `<th>${markdown.renderInline(cell)}</th>`).join("");
  const bodyHtml = body.map((cells) => `<tr>${cells.map((cell) => `<td>${markdown.renderInline(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
