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
await page.goto("http://127.0.0.1:43123/", { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => (window.__mindmap?.getHud?.().visibleLabels ?? 0) > 0, { timeout: 30000 });

const cases = [
  { mode: "sdf", density: "nearby", frame: false, note: "close, 240 cap" },
  { mode: "css2d", density: "nearby", frame: false, note: "close, 240 cap" },
  { mode: "sdf", density: "all", frame: true, note: "framed, every title" },
  { mode: "css2d", density: "all", frame: true, note: "framed, every title" },
  { mode: "sdf", density: "nearby", frame: true, note: "framed, nearby cull" },
  { mode: "css2d", density: "nearby", frame: true, note: "framed, nearby cull" },
];

for (const item of cases) {
  if (!item.frame) {
    await page.evaluate(() => window.__mindmap.setViewDistance(12));
  }
  const started = Date.now();
  const row = await page.evaluate(
    (mode, density, frame) => window.__mindmap.benchCase(mode, density, frame),
    item.mode,
    item.density,
    item.frame,
  );
  const elapsedS = (Date.now() - started) / 1000;
  console.log(JSON.stringify({
    ...item,
    ...row,
    elapsedS: Math.round(elapsedS * 10) / 10,
    meanFromWallMs: Math.round((elapsedS * 1000) / 110),
  }));
}

await browser.close();
