import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 900000,
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
page.setDefaultTimeout(900000);
const logs = [];
page.on("pageerror", (err) => logs.push(err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(msg.text().slice(0, 300));
});

await page.goto("http://127.0.0.1:43123/", { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => (window.__mindmap?.getHud?.().visibleLabels ?? 0) > 0, { timeout: 30000 });

async function shot(name) {
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${out}/${name}.png` });
  return page.evaluate(() => window.__mindmap.getHud());
}

await page.evaluate(() => {
  window.__mindmap.setLabelMode("sdf");
  window.__mindmap.setDensity("nearby");
  window.__mindmap.setViewDistance(12);
});
const before = await page.evaluate(() => window.__mindmap.getHud());
await page.keyboard.press("ArrowRight");
const oneRight = await shot("sdf-one-right");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowUp");
const localNav = await shot("sdf-nav-local");

await page.evaluate(() => {
  window.__mindmap.setDensity("all");
  window.__mindmap.setViewDistance(22);
});
const sdfAllMid = await shot("sdf-all-mid");
await page.evaluate(() => window.__mindmap.setLabelMode("css2d"));
const cssAllMid = await shot("css2d-all-mid");
await page.evaluate(() => window.__mindmap.setViewDistance(60));
const cssAllFar = await shot("css2d-all-far");
await page.evaluate(() => window.__mindmap.setLabelMode("sdf"));
const sdfAllFar = await shot("sdf-all-far");

console.log(JSON.stringify({
  before: { id: before.selectedId, title: before.selectedTitle },
  oneRight: { id: oneRight.selectedId, title: oneRight.selectedTitle, labels: oneRight.visibleLabels },
  localNav: { id: localNav.selectedId, title: localNav.selectedTitle, labels: localNav.visibleLabels },
  all: {
    sdfMid: { labels: sdfAllMid.visibleLabels, ms: sdfAllMid.avgMs },
    cssMid: { labels: cssAllMid.visibleLabels, ms: cssAllMid.avgMs },
    sdfFar: { labels: sdfAllFar.visibleLabels, ms: sdfAllFar.avgMs },
    cssFar: { labels: cssAllFar.visibleLabels, ms: cssAllFar.avgMs },
  },
  errors: logs.slice(0, 6),
}, null, 2));

const cases = [
  ["sdf", "all"],
  ["sdf", "nearby"],
  ["css2d", "all"],
  ["css2d", "nearby"],
];
for (const [mode, density] of cases) {
  const started = Date.now();
  const row = await page.evaluate(
    (nextMode, nextDensity) => window.__mindmap.benchCase(nextMode, nextDensity),
    mode,
    density,
  );
  console.log("ROW", JSON.stringify({ ...row, elapsedS: Math.round((Date.now() - started) / 1000) }));
}

await browser.close();
