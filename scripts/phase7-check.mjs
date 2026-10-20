import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

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
const remote = [];
page.on("request", (request) => {
  const url = request.url();
  if (url.startsWith("blob:") || url.startsWith("data:")) return;
  if (url.startsWith("http://127.0.0.1:43123") || url.startsWith("http://localhost:43123")) return;
  remote.push(url);
});

await page.goto("http://127.0.0.1:43123/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 60000 });
await page.evaluate(() => {
  window.__opened = [];
  window.open = (url) => {
    window.__opened.push(String(url));
    return null;
  };
});

await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "About");
  button?.click();
});
await page.waitForFunction(() => document.activeElement?.id === "about-title");
const about = await page.evaluate(() => {
  const doc = window.__mindmap.getDoc();
  return {
    title: document.getElementById("about-title")?.textContent ?? "",
    focused: document.activeElement?.id ?? null,
    pending: document.body.innerText.includes("pending"),
    dompurify: document.body.innerText.includes("DOMPurify"),
    log: doc.errorLogPath,
    releases: doc.releasesUrl,
    aboutOpen: doc.aboutOpen,
    blocks: doc.aboutOpen === true,
  };
});
await page.screenshot({ path: `${outDir}/about-desktop.png` });

await page.evaluate(() => {
  window.dispatchEvent(new ErrorEvent("error", { message: "disk full\nretry" }));
});
await page.waitForFunction(() => (localStorage.getItem("mindmap3d.error-log.v1") || "").includes("disk full"));
const logLine = await page.evaluate(() => localStorage.getItem("mindmap3d.error-log.v1"));

await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__mindmap.getDoc().aboutOpen === false);

await page.addScriptTag({ path: new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname });
await page.evaluate(() => window.__mindmap.openAbout());
await page.waitForSelector("#about-title");
const axe = await page.evaluate(async () => {
  const outcome = await window.axe.run(document.querySelector(".about"), { resultTypes: ["violations"] });
  return outcome.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
});

await page.setViewport({ width: 390, height: 800 });
await page.screenshot({ path: `${outDir}/about-narrow.png` });
const narrow = await page.evaluate(() => {
  const panel = document.querySelector(".about");
  const rect = panel?.getBoundingClientRect();
  return { width: rect?.width ?? 0, visible: Boolean(rect && rect.width > 0 && rect.top < window.innerHeight) };
});

const opened = await page.evaluate(() => window.__opened);
console.log(JSON.stringify({ about, logLine, axe, narrow, opened, remote }, null, 2));
await browser.close();
