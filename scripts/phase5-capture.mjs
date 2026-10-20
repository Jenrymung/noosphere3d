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
page.setDefaultTimeout(120000);
const logs = [];
const requests = [];
page.on("pageerror", (err) => logs.push(`pageerror: ${String(err).slice(0, 800)}`));
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(`console: ${msg.text().slice(0, 500)}`);
});
page.on("request", (req) => requests.push(req.url()));

await page.goto("http://127.0.0.1:43123/", { waitUntil: "networkidle0", timeout: 90000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 90000 });
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit" && window.__mindmap.getDoc().nodeIds.length === 1);

async function shot(name) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: `${out}/${name}.png` });
}

const report = {};
await shot("phase5-startup");
report.startup = await page.evaluate(() => ({
  panel: window.__mindmap.getDoc().panel,
  status: document.querySelector(".status")?.textContent ?? "",
  tabs: window.__mindmap.getDoc().tabs,
  title: document.title,
}));

await page.evaluate(() => window.__mindmap.openPreferences());
await page.waitForFunction(() => window.__mindmap.getDoc().prefsOpen === true);
await shot("phase5-preferences");
report.prefs = await page.evaluate(() => ({
  sections: [...document.querySelectorAll(".prefs legend")].map((node) => node.textContent),
  checks: [...document.querySelectorAll(".prefs label")].map((node) => node.textContent?.trim()),
  skip: window.__mindmap.getDoc().preferences.skipPicker,
  dim: window.__mindmap.getDoc().preferences.dimLonely,
}));
await page.evaluate(() => window.__mindmap.setPreferences({ skipPicker: true, dimLonely: true, theme: "light", labelScale: 1.2 }));
await shot("phase5-preferences-light");
report.prefsApplied = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  skip: window.__mindmap.getDoc().preferences.skipPicker,
  dim: window.__mindmap.getDoc().preferences.dimLonely,
  scale: window.__mindmap.getDoc().preferences.labelScale,
}));
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().prefsOpen === false);

await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");
await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes < 100);
await page.evaluate(() => window.__mindmap.setViewDistance(26));
await page.keyboard.down("Shift");
await page.keyboard.press("KeyL");
await page.keyboard.up("Shift");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === "legend");
await shot("phase5-legend");
report.legend = await page.evaluate(() => ({
  samples: document.querySelectorAll("[data-overlay] .sample").length,
  patterns: [...document.querySelectorAll("[data-overlay] .sample")].map((node) => node.getAttribute("data-pattern")),
  unused: document.querySelectorAll("[data-overlay] .name.unused").length,
  checkbox: document.querySelectorAll("[data-overlay] input[type=checkbox]").length,
}));
await page.keyboard.press("Escape");

await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const id = doc.nodeIds[0];
  if (id) window.__mindmap.selectNode(id);
});
await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("KeyL");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode?.sourceId);
await page.keyboard.press("KeyN");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode?.targetId);
const beforeLinks = await page.evaluate(() => window.__mindmap.getDoc().linkIds.length);
const canvas = await page.$(".scene-canvas");
const box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.42);
await page.waitForFunction((count) => window.__mindmap.getDoc().linkIds.length > count || window.__mindmap.getDoc().screen === "picker", {}, beforeLinks);
report.clickLink = await page.evaluate((count) => ({
  before: count,
  after: window.__mindmap.getDoc().linkIds.length,
  screen: window.__mindmap.getDoc().screen,
  linkMode: window.__mindmap.getDoc().linkMode,
}), beforeLinks);
await shot("phase5-click-link");
if (report.clickLink.screen) await page.keyboard.press("Escape");

await page.evaluate(() => window.__mindmap.requestQuit());
await page.waitForFunction(() => window.__mindmap.getDoc().dialog === "quit" || window.__mindmap.getDoc().dialog === "close-tab");
await shot("phase5-quit");
report.quit = await page.evaluate(() => ({
  dialog: window.__mindmap.getDoc().dialog,
  text: document.querySelector("[data-overlay]")?.innerText?.slice(0, 400) ?? "",
}));
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().dialog === null);

await page.evaluate(() => {
  void window.__mindmap.save();
});
await page.waitForFunction(() => window.__mindmap.getDoc().dialog === "path", { timeout: 8000 });
await shot("phase5-save-as");
report.saved = await page.evaluate(async () => {
  const input = document.querySelector(".dialog input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "phase5-notes.mindmap3d");
  input?.dispatchEvent(new Event("input", { bubbles: true }));
  const button = [...document.querySelectorAll(".dialog button")].find((node) => node.textContent?.trim() === "Save");
  button?.click();
  const started = Date.now();
  while (Date.now() - started < 4000) {
    const doc = window.__mindmap.getDoc();
    if (doc.path && !doc.dialog) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const doc = window.__mindmap.getDoc();
  return {
    clicked: Boolean(button),
    path: doc.path,
    status: doc.saveStatus,
    dirty: doc.dirty,
    dialog: doc.dialog,
    overlay: document.querySelector("[data-overlay]")?.innerText?.slice(0, 240) ?? "",
  };
});

await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("KeyE");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit", { timeout: 8000 }).catch(() => {});
await page.keyboard.type(" extra");
await page.waitForFunction(() => window.__mindmap.getDoc().dirty === true);
await page.keyboard.down("Control");
await page.keyboard.press("KeyZ");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().dirty === false, { timeout: 4000 }).catch(() => {});
report.undoClean = await page.evaluate(() => ({
  dirty: window.__mindmap.getDoc().dirty,
  status: window.__mindmap.getDoc().saveStatus,
  panel: window.__mindmap.getDoc().panel,
}));
await page.keyboard.press("Escape");
await page.evaluate(() => document.querySelector(".scene-canvas")?.focus());
await page.keyboard.press("KeyE");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit", { timeout: 8000 }).catch(() => {});
await page.keyboard.type(" kept");
await new Promise((resolve) => setTimeout(resolve, 3600));
await page.evaluate(() => window.__mindmap.flushRecovery());
console.log(JSON.stringify({ startup: report.startup, prefs: report.prefsApplied, legend: report.legend, clickLink: report.clickLink, quit: report.quit?.dialog, saved: report.saved, undoClean: report.undoClean }));
await page.evaluate(() => window.__mindmap.skipClosePrompt());
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 90000 });
await page.waitForFunction(() => window.__mindmap.getDoc().dialog === "recovery", { timeout: 8000 }).catch(() => {});
await shot("phase5-recovery");
report.recovery = await page.evaluate(() => ({
  dialog: window.__mindmap.getDoc().dialog,
  text: document.querySelector("[data-overlay]")?.innerText?.slice(0, 500) ?? "",
}));
if (report.recovery.dialog === "recovery") {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".dialog button")].find((node) => node.textContent === "Restore");
    button?.click();
  });
  await page.waitForFunction(() => window.__mindmap.getDoc().tabs.length >= 1);
}

await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => window.__mindmap.openPreferences());
await shot("phase5-narrow");

const remote = requests.filter((url) => {
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost";
  } catch {
    return true;
  }
});
report.remote = remote;
report.logs = logs;
console.log(JSON.stringify(report, null, 2));
if (logs.length || remote.length) {
  await browser.close();
  process.exit(1);
}
await browser.close();
