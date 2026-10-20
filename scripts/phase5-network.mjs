import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const requests = [];
page.on("request", (req) => requests.push(req.url()));
page.on("pageerror", (err) => console.log("pageerror", String(err).slice(0, 400)));
await page.goto("http://127.0.0.1:43123/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 30000 });
await page.evaluate(() => window.__mindmap.setMap("sample"));
await page.waitForFunction(() => window.__mindmap.getHud().ready && window.__mindmap.getHud().nodes > 5 && window.__mindmap.getHud().nodes < 100, { timeout: 12000 }).catch(() => {});
const hud = await page.evaluate(() => window.__mindmap.getHud());
console.log("hud", JSON.stringify(hud));
const remote = requests.filter((url) => {
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost";
  } catch {
    return true;
  }
});
console.log(JSON.stringify({ remote, localFonts: requests.filter((url) => url.includes("unicode-fonts")).slice(0, 8) }, null, 2));
await browser.close();
if (remote.length) process.exit(1);
