import { readFileSync, mkdirSync } from "node:fs";
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
page.on("pageerror", (err) => logs.push(String(err).slice(0, 400)));
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(msg.text().slice(0, 400));
});

await page.evaluateOnNewDocument(() => {
  let frames = 0;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    orig((time) => {
      frames += 1;
      window.__raf = frames;
      callback(time);
    });
});

await page.goto("http://127.0.0.1:43123/", { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 60000 });

async function shot(name) {
  await new Promise((resolve) => setTimeout(resolve, 450));
  await page.screenshot({ path: `${out}/${name}.png` });
  return page.evaluate(() => window.__mindmap.getHud());
}

await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().selectedId === "n-flood");
const overview = await shot("phase2-sample-overview");

await page.keyboard.press("ArrowUp");
await page.keyboard.press("ArrowLeft");
const afterArrows = await shot("phase2-after-arrows");
await page.keyboard.press("b");
const afterBack = await page.evaluate(() => window.__mindmap.getHud());

await page.keyboard.press("]");
const linkSelected = await shot("phase2-link-selected");
await page.keyboard.press("ArrowRight");
const linkEndpoint = await page.evaluate(() => window.__mindmap.getHud());

await page.keyboard.press("Home");
const framed = await shot("phase2-frame-all");

await page.evaluate(() => window.__mindmap.focus());
await page.evaluate(() => window.__mindmap.setViewDistance(5.5));
const icons = await shot("phase2-icons-close");

const beforeView = await page.evaluate(() => window.__mindmap.getPose());
await page.keyboard.press("v");
await page.mouse.move(500, 420);
await page.mouse.move(680, 510);
const duringView = await page.evaluate(() => ({ pose: window.__mindmap.getPose(), hud: window.__mindmap.getHud() }));
await page.keyboard.press("Escape");
await new Promise((resolve) => setTimeout(resolve, 200));
const afterCancel = await page.evaluate(() => window.__mindmap.getPose());

await page.keyboard.press("v");
await page.mouse.move(640, 400);
await page.mouse.move(760, 470);
await page.mouse.click(760, 470);
const afterConfirm = await page.evaluate(() => window.__mindmap.getPose());
await shot("phase2-view-kept");

await page.evaluate(() => window.__mindmap.setViewDistance(40));
await page.keyboard.press("ArrowUp");
await new Promise((resolve) => setTimeout(resolve, 500));
const followed = await page.evaluate(() => window.__mindmap.getPose());

const idleStart = await page.evaluate(() => window.__raf ?? 0);
await new Promise((resolve) => setTimeout(resolve, 800));
const idleEnd = await page.evaluate(() => window.__raf ?? 0);

const sample = JSON.parse(readFileSync("samples/urban-flooding.mindmap3d", "utf8"));
sample.links["l-self"] = {
  source: "n-flood",
  target: "n-flood",
  typeId: "causes",
  title: "Feeds itself",
  text: "A loop beside the node.",
};
await page.evaluate((doc) => window.__mindmap.loadDocument(doc), sample);
await page.waitForFunction(() => window.__mindmap.getHud().ready);
await page.evaluate(() => window.__mindmap.setViewDistance(7));
const selfLink = await shot("phase2-self-link");

await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().selectedId === "n-flood");
const mobile = await shot("phase2-mobile");

function dist(pose) {
  const p = pose.position;
  const t = pose.target;
  return Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
}

console.log(
  JSON.stringify(
    {
      overview: { id: overview.selectedId, title: overview.selectedTitle, operator: overview.operator },
      afterArrows: { id: afterArrows.selectedId, title: afterArrows.selectedTitle },
      afterBack: { id: afterBack.selectedId, title: afterBack.selectedTitle },
      linkSelected: { kind: linkSelected.selectionKind, id: linkSelected.selectedLinkId, title: linkSelected.selectedTitle },
      linkEndpoint: { id: linkEndpoint.selectedId, kind: linkEndpoint.selectionKind, title: linkEndpoint.selectedTitle },
      framed: { title: framed.selectedTitle },
      icons: { id: icons.selectedId, title: icons.selectedTitle },
      view: {
        before: beforeView,
        during: { operator: duringView.hud.operator, pose: duringView.pose },
        afterCancel,
        afterConfirm,
        cancelMatches: JSON.stringify(beforeView) === JSON.stringify(afterCancel),
      },
      followDistance: dist(followed),
      selfLink: { title: selfLink.selectedTitle, ready: selfLink.ready },
      mobile: { title: mobile.selectedTitle, ready: mobile.ready },
      idleRafDelta: idleEnd - idleStart,
      errors: logs.slice(0, 8),
    },
    null,
    2,
  ),
);

await browser.close();
