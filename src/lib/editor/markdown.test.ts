// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("reader markdown", () => {
  it("renders headings, lists, and code, and drops raw HTML", () => {
    const html = renderMarkdown("# Flooding\n\n- storm drains\n\n`<script>alert(1)</script>`\n\n<script>alert(1)</script>");
    expect(html).toContain("<h1>Flooding</h1>");
    expect(html).toContain("<li>storm drains</li>");
    expect(html).toContain("<code>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("shows image markdown as a labelled placeholder", () => {
    const html = renderMarkdown("![Drain diagram](images/drain-diagram.png)");
    expect(html).toContain("Image");
    expect(html).toContain("Drain diagram");
    expect(html).toContain("images/drain-diagram.png");
    expect(html).not.toContain("<img");
  });

  it("renders a licence table", () => {
    const html = renderMarkdown("| Name | Licence |\n| --- | --- |\n| Tauri | MIT OR Apache-2.0 |\n| pipe | a \\| b |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<td>Tauri</td>");
    expect(html).toContain("a | b");
    expect(html).not.toContain("<script");
  });

  it("marks task lists and opens links outside the app", () => {
    const html = renderMarkdown("- [ ] inspect culverts\n- [x] map the drains\n\nSee the [report](https://example.com/rain).");
    expect(html).toContain("☐");
    expect(html).toContain("☑");
    expect(html).toContain('href="https://example.com/rain"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });
});
