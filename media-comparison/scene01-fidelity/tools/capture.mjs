#!/usr/bin/env node
/**
 * Capture harness for the scene-01 fidelity audit.
 *
 * Drives real Google Chrome (not Playwright's bundled Chromium) and runs
 * HEADED on purpose: headless falls back to SwiftShader for WebGL, which would
 * make mode D a measurement of a software rasteriser instead of the GPU path
 * the user actually looks at.
 *
 * Every capture is a full-viewport screenshot with the UI hidden, so the PNG is
 * exactly the stage at exactly the requested size — directly comparable to the
 * ffmpeg reference of the same dimensions.
 *
 *   node capture.mjs <baseUrl> <outDir> [--only <substring>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "media-comparison/scene01-fidelity/captures";
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

/** The comparison set. `q` is merged into the /quality-diagnostic query string. */
const VIEWPORTS = [
  { name: "1920x1080-dpr1", width: 1920, height: 1080, dsf: 1 },
  { name: "1440x900-dpr1", width: 1440, height: 900, dsf: 1 },
  { name: "1920x1080-dpr2", width: 1920, height: 1080, dsf: 2 },
  { name: "1920x1058-masterAR", width: 1920, height: 1058, dsf: 1 },
  { name: "2400x1000-wide", width: 2400, height: 1000, dsf: 1 },
];

const SHOTS = [
  { id: "A-ref-lanczos", q: { mode: "A", ref: "lanczos" } },
  { id: "A-ref-native", q: { mode: "A", ref: "native" } },
  { id: "B-native-remux", q: { mode: "B", vsrc: "remux" } },
  { id: "B-native-master", q: { mode: "B", vsrc: "master" } },
  { id: "C-canvas2d-low", q: { mode: "C", sq: "low" } },
  { id: "C-canvas2d-medium", q: { mode: "C", sq: "medium" } },
  { id: "C-canvas2d-high", q: { mode: "C", sq: "high" } },
  { id: "C-canvas2d-high-dpr2", q: { mode: "C", sq: "high", dpr: "2" } },
  { id: "C-canvas2d-high-dpr15", q: { mode: "C", sq: "high", dpr: "1.5" } },
  { id: "C-canvas2d-low-master", q: { mode: "C", sq: "low", vsrc: "master" } },
  { id: "D-webgl-linear", q: { mode: "D", glq: "linear" } },
  { id: "D-webgl-mipmap", q: { mode: "D", glq: "mipmap" } },
  { id: "D-webgl-lanczos", q: { mode: "D", glq: "lanczos" } },
];

const url = (q) => {
  const p = new URLSearchParams({ fit: "cover", frame: "0", zoom: "1", ui: "0", ...q });
  return `${BASE}/quality-diagnostic?${p}`;
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  // Headless by default: this agent has no interactive desktop, so a headed
  // launch simply hangs. The GPU flags matter — plain headless picks SwiftShader
  // for WebGL, which would make mode D a software-rasteriser measurement rather
  // than the pipeline the user sees. __qd.glRenderer records which one ran, so
  // the report can state it rather than assume it.
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !process.argv.includes("--headed"),
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=CalculateNativeWinOcclusion",
      "--use-angle=d3d11",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
    ],
  });

  const manifest = [];
  const errors = [];

  for (const vp of VIEWPORTS) {
    let ctx = null;
    let page = null;

    // A 4K decoder plus a DPR-2 backing store is enough to take the renderer
    // process down. When that happens every later call on the same page throws
    // "Page crashed", so the context is rebuilt instead of silently losing the
    // rest of the viewport's shots.
    const freshPage = async () => {
      if (ctx) await ctx.close().catch(() => {});
      ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
        colorScheme: "dark",
      });
      page = await ctx.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`[${vp.name}] ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(`[${vp.name}] pageerror: ${e.message}`));
      page.on("crash", () => errors.push(`[${vp.name}] renderer crashed`));
    };
    await freshPage();

    for (const shot of SHOTS) {
      if (ONLY && !`${vp.name}/${shot.id}`.includes(ONLY)) continue;
      const target = url(shot.q);

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await page.goto(target, { waitUntil: "load", timeout: 60000 });
          // state:"attached", not the default "visible": the whole route is
          // position:fixed, so <body> has a zero-height box and would never
          // satisfy Playwright's visibility check even once the flag is set.
          await page.waitForSelector('body[data-qd-ready="1"]', {
            state: "attached",
            timeout: 45000,
          });
          // Readiness means "a paint ran". Give the compositor a beat so the
          // video layer is actually on screen before the shutter.
          await page.waitForTimeout(600);

          const state = await page.evaluate(() => window.__qd);
          const dir = join(OUT, vp.name);
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${shot.id}.png`);
          await page.screenshot({ path: file, animations: "disabled" });
          manifest.push({ viewport: vp.name, id: shot.id, file, url: target, state });
          console.log(
            `  ${vp.name.padEnd(20)} ${shot.id.padEnd(24)} ok   gl=${state?.glRenderer ?? "-"}`,
          );
          break;
        } catch (e) {
          const msg = String(e.message).split("\n")[0];
          if (attempt === 0) {
            console.log(`  ${vp.name.padEnd(20)} ${shot.id.padEnd(24)} retry (${msg})`);
            await freshPage();
          } else {
            console.log(`  ${vp.name.padEnd(20)} ${shot.id.padEnd(24)} FAILED  ${msg}`);
            errors.push(`[${vp.name}/${shot.id}] ${msg}`);
            await freshPage();
          }
        }
      }
    }
    if (ctx) await ctx.close().catch(() => {});
  }

  await browser.close();
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ manifest, errors }, null, 2));
  console.log(`\n${manifest.length} captures -> ${OUT}`);
  if (errors.length) {
    console.log(`\nCONSOLE / PAGE ERRORS (${errors.length}):`);
    for (const e of errors) console.log("  " + e);
  } else {
    console.log("zero console errors");
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
