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
page.on("pageerror", (err) => logs.push(`pageerror: ${String(err).slice(0, 500)}`));
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(`console: ${msg.text().slice(0, 500)}`);
});

await page.goto("http://127.0.0.1:43123/", { waitUntil: "networkidle0", timeout: 90000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 90000 });

async function shot(name) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: `${out}/${name}.png` });
}

const report = {};

await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes < 100);
await page.evaluate(() => window.__mindmap.setViewDistance(28));
await shot("phase3-arrows-far");
await page.evaluate(() => window.__mindmap.setViewDistance(6));
await shot("phase3-arrows-near");

await page.evaluate(() => window.__mindmap.newMap());
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes === 0);
await shot("phase3-empty");

await page.keyboard.down("Control");
await page.keyboard.press("Enter");
await page.keyboard.up("Control");
await page.waitForSelector(".cm-content", { timeout: 20000 });
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit" && window.__mindmap.getDoc().nodeIds.length === 1);
await page.keyboard.type("# Culvert note\n\nWater stands in the street.\n\nSee the [report](https://example.com/rain).\n\n![Culvert](images/culvert.png)");
await shot("phase3-edit");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");
await new Promise((resolve) => setTimeout(resolve, 250));

await page.keyboard.press("Tab");
await page.waitForSelector(".cm-content");
await page.waitForFunction(() => window.__mindmap.getDoc().nodeIds.length === 2 && window.__mindmap.getDoc().panel === "edit");
await page.keyboard.type("# Pump house\n\nThe second note, linked from the first.");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed" && window.__mindmap.getDoc().linkIds.length === 1);
await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const id = doc.nodeIds.find((nodeId) => String(doc.nodes[nodeId].text).includes("Culvert"));
  if (id) window.__mindmap.selectNode(id);
});
await shot("phase3-two-nodes");

await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read");
await shot("phase3-reader");
const readerText = await page.evaluate(() => ({
  html: document.querySelector(".prose")?.innerHTML ?? "",
  title: document.querySelector(".reader h2")?.textContent ?? "",
}));
report.reader = {
  title: readerText.title,
  hasHeading: readerText.html.includes("<h1"),
  hasPlaceholder: readerText.html.includes("image-placeholder") && !readerText.html.includes("<img"),
  hasLink: readerText.html.includes('target="_blank"') && readerText.html.includes("noopener"),
};

await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");
const beforeGrab = await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const id = doc.selection.nodeId;
  return { id, position: { ...doc.nodes[id].position } };
});
await page.keyboard.press("g");
await page.waitForFunction(() => window.__mindmap.getHud().operator === "grab");
for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getHud().operator === "" && window.__mindmap.getDoc().canUndo);
const afterGrab = await page.evaluate((id) => ({ ...window.__mindmap.getDoc().nodes[id].position }), beforeGrab.id);
await page.keyboard.down("Control");
await page.keyboard.press("KeyZ");
await page.keyboard.up("Control");
await page.waitForFunction(
  (id, before) => {
    const position = window.__mindmap.getDoc().nodes[id].position;
    return Math.hypot(position.x - before.x, position.y - before.y, position.z - before.z) < 0.05;
  },
  {},
  beforeGrab.id,
  beforeGrab.position,
);
const afterUndo = await page.evaluate((id) => ({ ...window.__mindmap.getDoc().nodes[id].position }), beforeGrab.id);
report.grab = { before: beforeGrab.position, afterGrab, afterUndo, moved: Math.hypot(afterGrab.x - beforeGrab.position.x, afterGrab.y - beforeGrab.position.y, afterGrab.z - beforeGrab.position.z) };

await page.keyboard.down("Control");
await page.keyboard.press("Enter");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit" && window.__mindmap.getDoc().nodeIds.length === 3);
await page.keyboard.type("Third, unlinked");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");

const escape = await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const third = doc.selection.nodeId;
  const linkId = doc.linkIds[0];
  window.__mindmap.selectLink(linkId);
  const onLink = window.__mindmap.getDoc().selection;
  return { third, linkId, onLink };
});
await page.keyboard.press("Escape");
await new Promise((resolve) => setTimeout(resolve, 150));
const back = await page.evaluate(() => window.__mindmap.getDoc().selection);
await page.keyboard.press("Escape");
await new Promise((resolve) => setTimeout(resolve, 150));
const cleared = await page.evaluate(() => window.__mindmap.getHud());
report.escape = { arrived: escape.third, onLink: escape.onLink, afterEsc: back, clearedId: cleared.selectedId, clearedKind: cleared.selectionKind };

await page.evaluate((id) => window.__mindmap.selectNode(id), escape.third);
await page.mouse.click(980, 430);
await new Promise((resolve) => setTimeout(resolve, 200));
report.emptyClick = await page.evaluate(() => window.__mindmap.getHud().selectedId);

await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read");
await page.setViewport({ width: 390, height: 800 });
await new Promise((resolve) => setTimeout(resolve, 400));
await shot("phase3-reader-narrow");
await page.setViewport({ width: 1440, height: 900 });
await shot("phase3-after-escape");

report.logs = logs;
console.log(JSON.stringify(report, null, 2));
await browser.close();
