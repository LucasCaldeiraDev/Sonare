#!/usr/bin/env node
/**
 * Scene 01 look comparison: range tag x sharpening.
 *
 * Everything is the same frame, crop, viewport and DPR — only the container
 * range tag and the shader's unsharp amount change.
 *
 *   node sharpen-compare.mjs <baseUrl>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/sharpen";

const SHOTS = [
  { id: "1-atual-full-canvas", q: { mode: "C", vsrc: "remux", sq: "high" } },
  { id: "2-tv-canvas", q: { mode: "C", vsrc: "tv", sq: "high" } },
  { id: "3-tv-webgl-sharp000", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0" } },
  { id: "4-tv-webgl-sharp025", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0.25" } },
  { id: "5-tv-webgl-sharp050", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0.5" } },
  { id: "6-tv-webgl-sharp080", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0.8" } },
];

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
    ],
  });
  const errors = [];

  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${shot.id}] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${shot.id}] ${m.text()}`);
    });

    const p = new URLSearchParams({ fit: "cover", frame: "0", zoom: "1", ui: "0", ...shot.q });
    const url = `${BASE}/quality-diagnostic?${p}`;
    await page.goto(url, { waitUntil: "load", timeout: 90000 });
    await page.waitForSelector('body[data-qd-ready="1"]', { state: "attached", timeout: 60000 });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => window.__qd);
    await page.screenshot({ path: join(OUT, `${shot.id}.png`), animations: "disabled" });
    console.log(`  ${shot.id.padEnd(24)} ok  ${st.currentSrc.split("/").pop()}`);
    await ctx.close();
  }

  await browser.close();
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
