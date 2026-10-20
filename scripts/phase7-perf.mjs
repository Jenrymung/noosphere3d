import puppeteer from "puppeteer-core";

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
await page.goto("http://127.0.0.1:43123/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__mindmap?.getHud?.().ready === true, { timeout: 90000 });

await page.evaluate(() => {
  window.__raf = 0;
  const native = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    window.__raf += 1;
    return native(callback);
  };
});
await new Promise((resolve) => setTimeout(resolve, 2500));
await page.evaluate(() => {
  window.__raf = 0;
});
await new Promise((resolve) => setTimeout(resolve, 2000));
const idle = await page.evaluate(() => ({
  rafInTwoSeconds: window.__raf,
  nodes: window.__mindmap.getHud().nodes,
  labelMode: window.__mindmap.getHud().labelMode,
}));

const started = Date.now();
await page.evaluate(() => window.__mindmap.setMap("stress"));
await page.waitForFunction(() => window.__mindmap.getHud().nodes >= 2300, { timeout: 180000 });
const loadMs = Date.now() - started;
const row = await page.evaluate(() => window.__mindmap.benchCase("sdf", "nearby", false));
console.log(JSON.stringify({
  note: "SwiftShader software WebGL. Not an integrated-GPU 60 fps measurement.",
  idle,
  stressLoadMs: loadMs,
  stressNodes: await page.evaluate(() => window.__mindmap.getHud().nodes),
  orbit: row,
}, null, 2));
await browser.close();
