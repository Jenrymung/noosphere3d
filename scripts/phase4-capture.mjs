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
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({ path: `${out}/${name}.png` });
}

const report = {};

await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes < 100);
await page.evaluate(() => window.__mindmap.setViewDistance(26));
await page.keyboard.down("Shift");
await page.keyboard.press("KeyL");
await page.keyboard.up("Shift");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === "legend");
await shot("phase4-legend");
report.legend = await page.evaluate(() => ({
  status: document.querySelector(".status")?.textContent ?? "",
  chrome: document.querySelector("[data-overlay]")?.innerText?.slice(0, 500) ?? "",
}));
await page.keyboard.press("Space");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === null);

await page.evaluate(() => window.__mindmap.newMap());
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes === 0);
await page.keyboard.down("Control");
await page.keyboard.press("Enter");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit" && window.__mindmap.getDoc().nodeIds.length === 1);
await page.keyboard.type("# Intake\n\nThe first note.");
await shot("phase4-edit");
await page.keyboard.down("Control");
await page.keyboard.press("Enter");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read", { timeout: 8000 }).catch(() => {});
report.afterModEnterInEdit = await page.evaluate(() => window.__mindmap.getDoc().panel);
if (report.afterModEnterInEdit !== "read") {
  await page.evaluate(() => document.querySelector("[data-editor-root]")?.focus());
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.__mindmap.getDoc().panel === "read", { timeout: 4000 }).catch(() => {});
  report.afterModEnterInEdit = await page.evaluate(() => window.__mindmap.getDoc().panel);
}
await shot("phase4-reader-after-commit");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed");

await page.keyboard.press("Tab");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "edit" && window.__mindmap.getDoc().nodeIds.length === 2);
await page.keyboard.type("# Outfall");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().panel === "closed" && window.__mindmap.getDoc().linkIds.length === 1);

await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const id = doc.nodeIds.find((nodeId) => String(doc.nodes[nodeId].text).includes("Intake"));
  if (id) window.__mindmap.selectNode(id);
});
await page.keyboard.press("KeyL");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode?.sourceId);
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => window.__mindmap.getDoc().linkMode?.targetId);
await shot("phase4-rubber");
report.rubber = await page.evaluate(() => ({
  status: document.querySelector(".status")?.textContent ?? "",
  linkMode: window.__mindmap.getDoc().linkMode,
}));
await page.keyboard.press("Digit2");
await shot("phase4-rubber-causes");
report.prepick = await page.evaluate(() => document.querySelector(".status")?.textContent ?? "");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__mindmap.getDoc().linkIds.length === 2 && window.__mindmap.getDoc().screen === null);
await page.keyboard.press("KeyT");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === "picker");
await shot("phase4-picker");
report.pickerHighlight = await page.evaluate(() => document.querySelector("[data-overlay] li.on")?.innerText ?? "");
await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === null);
await page.keyboard.press("Digit2");
await page.waitForFunction(() => window.__mindmap.getDoc().linkIds.length === 2 && window.__mindmap.getDoc().screen === null);
report.created = await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  const link = doc.links[doc.selection.linkId];
  return { typeId: link?.typeId, source: link?.source, target: link?.target, selection: doc.selection };
});
await shot("phase4-linked");

await page.keyboard.down("Control");
await page.keyboard.down("Shift");
await page.keyboard.press("KeyL");
await page.keyboard.up("Shift");
await page.keyboard.up("Control");
await page.waitForFunction(() => window.__mindmap.getDoc().screen === "manager");
await shot("phase4-manager");
await page.keyboard.press("Enter");
await page.waitForSelector("[data-overlay] input");
await shot("phase4-type-form");
await page.keyboard.press("Escape");

await page.setViewport({ width: 390, height: 844 });
await shot("phase4-manager-narrow");
await page.keyboard.press("Escape");

report.logs = logs;
console.log(JSON.stringify(report, null, 2));
await browser.close();
