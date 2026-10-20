import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 180000,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1440,900",
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(90000);
const logs = [];
const requests = [];
page.on("pageerror", (err) => logs.push(`pageerror: ${String(err).slice(0, 800)}`));
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(`console: ${msg.text().slice(0, 500)}`);
});
page.on("request", (req) => requests.push(req.url()));

await page.goto("http://127.0.0.1:43123/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 90000 });
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit");

async function shot(name) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({ path: `${out}/${name}.png` });
}

const report = {};
await shot("phase6-startup");
report.startup = await page.evaluate(() => ({
  panel: window.__mindmap.getDoc().panel,
  gizmo: document.querySelector(".scene-canvas")?.dataset.axisGizmo ?? null,
  canvasRole: document.querySelector(".scene-canvas")?.getAttribute("role"),
  tree: document.querySelector("[role=tree]")?.getAttribute("aria-label") ?? "",
  status: document.querySelector("#region-status")?.textContent ?? "",
}));

await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");
await page.keyboard.press("Slash");
await page.waitForFunction(() => window.__mindmap.getDoc().paletteOpen === true);
await page.keyboard.type(">save");
await shot("phase6-palette");
report.palette = await page.evaluate(() => ({
  open: window.__mindmap.getDoc().paletteOpen,
  rows: [...document.querySelectorAll("#palette-results [role=option]")].map((node) => node.textContent?.trim()),
}));
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().paletteOpen === false);

await page.keyboard.down("Shift");
await page.keyboard.press("Slash");
await page.keyboard.up("Shift");
await page.waitForFunction(() => window.__mindmap.getDoc().helpOpen === true);
await shot("phase6-help");
report.help = await page.evaluate(() => ({
  title: document.querySelector("#help-title")?.textContent ?? "",
  hasPalette: document.querySelector(".help")?.innerText.includes("/ or Mod+K") ?? false,
  hasDev: document.querySelector(".help")?.innerText.includes("Label drawing") ?? false,
}));
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().helpOpen === false);

const foci = [];
for (let step = 0; step < 4; step += 1) {
  await page.keyboard.press("F6");
  await new Promise((resolve) => setTimeout(resolve, 80));
  foci.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("role") || document.activeElement?.tagName));
}
report.regions = foci;

await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes === 3);
await page.evaluate(() => window.__mindmap.setViewDistance(26));
await page.evaluate(() => window.__mindmap.selectNode("n-flood"));
await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("KeyL");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode);
await page.keyboard.press("Slash");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === "search" && window.__mindmap.getDoc().paletteOpen === false);
report.linkSlash = await page.evaluate(() => ({ screen: window.__mindmap.getDoc().screen, palette: window.__mindmap.getDoc().paletteOpen }));
await page.keyboard.press("Escape");
await page.keyboard.down("Control");
await page.keyboard.press("KeyK");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().paletteOpen === true);
await page.keyboard.type("@flood");
report.paletteNodes = await page.evaluate(() => [...document.querySelectorAll("#palette-results [role=option]")].map((node) => node.textContent?.trim()));
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getDoc().paletteOpen === false);
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode == null);

await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read");
const readerFoci = [];
for (let step = 0; step < 4; step += 1) {
  await page.keyboard.press("F6");
  await new Promise((resolve) => setTimeout(resolve, 80));
  readerFoci.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
}
report.readerRegions = readerFoci;
await page.evaluate(() => document.getElementById("reader-title")?.focus());
await shot("phase6-reader");
report.reader = await page.evaluate(() => ({
  panel: window.__mindmap.getDoc().panel,
  live: document.querySelector(".live")?.textContent ?? "",
  heading: document.activeElement?.id ?? "",
  tree: document.querySelector("[role=tree]")?.innerText ?? "",
}));
await page.keyboard.press("KeyE");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");

await page.evaluate(() => window.__mindmap.setPreferences({ saveMode: "autosave", showAxisGizmo: true }));
await page.evaluate(() => {
  void window.__mindmap.save();
});
await page.waitForFunction(() => window.__mindmap.getDoc().dialog === "path");
await page.evaluate(async () => {
  const input = document.querySelector(".dialog input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "phase6-flood.mindmap3d");
  input?.dispatchEvent(new Event("input", { bubbles: true }));
  const button = [...document.querySelectorAll(".dialog button")].find((node) => node.textContent?.trim() === "Save");
  button?.click();
  const started = Date.now();
  while (Date.now() - started < 4000) {
    const doc = window.__mindmap.getDoc();
    if (doc.path && !doc.dialog) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});
report.saved = await page.evaluate(() => ({
  path: window.__mindmap.getDoc().path,
  dirty: window.__mindmap.getDoc().dirty,
  mode: window.__mindmap.getDoc().preferences.saveMode,
}));

await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.down("Shift");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.keyboard.up("Shift");
await page.keyboard.down("Alt");
await page.keyboard.press("Digit1");
await page.keyboard.up("Alt");
await new Promise((resolve) => setTimeout(resolve, 2600));
report.viewOnly = await page.evaluate((path) => {
  const file = JSON.parse(localStorage.getItem("mindmap3d.files.v1") || "{}").files?.[path];
  const parsed = file ? JSON.parse(file.text) : null;
  return {
    modifiedMs: file?.modifiedMs ?? null,
    bytes: file?.text.length ?? 0,
    text: file?.text ?? "",
    fileFilters: parsed?.view?.linkTypeFilters ?? null,
  };
}, "phase6-flood.mindmap3d");
report.viewOnlyDirty = await page.evaluate(() => ({
  dirty: window.__mindmap.getDoc().dirty,
  filters: window.__mindmap.getDoc().filters,
  status: window.__mindmap.getDoc().saveStatus,
}));

await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("KeyE");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit");
await new Promise((resolve) => setTimeout(resolve, 250));
await page.keyboard.type(" noted");
await page.waitForFunction(() => window.__mindmap.getDoc().dirty === true);
await page.waitForFunction(() => window.__mindmap.getDoc().dirty === false, { timeout: 8000 });
report.afterEdit = await page.evaluate((before) => {
  const file = JSON.parse(localStorage.getItem("mindmap3d.files.v1") || "{}").files?.["phase6-flood.mindmap3d"];
  const parsed = file ? JSON.parse(file.text) : null;
  return {
    dirty: window.__mindmap.getDoc().dirty,
    changed: file?.text !== before,
    modifiedMoved: file?.modifiedMs !== undefined,
    filters: parsed?.view?.linkTypeFilters ?? null,
    hasCamera: Boolean(parsed?.view?.camera),
    status: window.__mindmap.getDoc().saveStatus,
  };
}, report.viewOnly?.text ?? "");

await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");
await page.evaluate(() => window.__mindmap.setPreferences({ showAxisGizmo: false }));
await shot("phase6-gizmo-off");
report.gizmo = await page.evaluate(() => document.querySelector(".scene-canvas")?.dataset.axisGizmo ?? null);
await page.evaluate(() => window.__mindmap.setPreferences({ showAxisGizmo: true }));
await page.evaluate(() => window.__mindmap.selectNode("n-flood"));
await page.evaluate(() => window.__mindmap.setViewDistance(22));
await shot("phase6-gizmo");

await page.addScriptTag({ path: new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname });
report.axe = await page.evaluate(async () => {
  const outcome = await window.axe.run(document, { resultTypes: ["violations"] });
  return outcome.violations.map((item) => ({
    id: item.id,
    impact: item.impact,
    count: item.nodes.length,
    sample: item.nodes.slice(0, 2).map((node) => node.target.join(" ")),
  }));
});

await page.setViewport({ width: 390, height: 844 });
await shot("phase6-narrow");

const remote = [...new Set(requests.filter((url) => {
  if (url.startsWith("blob:") || url.startsWith("data:")) return false;
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost";
  } catch {
    return false;
  }
}))];
report.remote = remote;
report.logs = logs;
if (report.viewOnly) {
  report.viewOnly = {
    modifiedMs: report.viewOnly.modifiedMs,
    bytes: report.viewOnly.bytes,
    fileFilters: report.viewOnly.fileFilters,
  };
}
console.log(JSON.stringify(report, null, 2));
await browser.close();
