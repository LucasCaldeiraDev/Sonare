#!/usr/bin/env node
/**
 * Captures scenes 02-05 on the MAIN route, before and after the remux.
 *
 * "before" is produced by redirecting each remux URL back to its untagged
 * master, so the two runs differ in exactly one thing: the container tag. Same
 * scroll positions, same damping settle, same hidden chrome.
 *
 * Also records currentSrc / videoWidth / readyState for all five segments,
 * which is the proof that the site no longer requests a raw master.
 *
 *   node scenes-capture.mjs <baseUrl> <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "media-comparison/scene01-fidelity/scenes";

/** Mirrors src/content/timeline.ts. */
const GLOBAL_DURATION = 29.083335;
const GLOBAL_FRAMES = 698;
const SCROLL_VH_PER_SECOND = 62;
const SETTLE = 2.0;

// Archived outside public/. The dev server serves the project root, so these
// still resolve while developing; in a built deploy they do not exist, which is
// correct — the "antes" comparison is a development-only exercise.
const ARCHIVE_URL = "/media-comparison/source-archive/masters";

const MASTER_FOR = {
  "scene-01-4k-bt709-full.mp4": `${ARCHIVE_URL}/001-Sonare-Cena%2001%20completa.mp4`,
  "scene-02-4k-bt709-full.mp4": `${ARCHIVE_URL}/002-Sonare-Cena%2002.mp4`,
  "scene-03-4k-bt709-full.mp4": `${ARCHIVE_URL}/003-Sonare-Cena-03.mp4`,
  "scene-04-4k-bt709-full.mp4": `${ARCHIVE_URL}/004-Sonare-Cena-04.mp4`,
  "scene-05-4k-bt709-full.mp4": `${ARCHIVE_URL}/005-Sonare-Cena-05.mp4`,
};

/** A representative frame in the middle of each segment. */
const SHOTS = [
  { id: "cena-01", frame: 60 },
  { id: "cena-02", frame: 217 },
  { id: "cena-03", frame: 326 },
  { id: "cena-04", frame: 447 },
  { id: "cena-05", frame: 600 },
];

const VP = { width: 1920, height: 1080 };

/** Global frame -> document scrollY, from the ScrollTrigger runway. */
function scrollForFrame(frame, innerHeight) {
  const total = GLOBAL_DURATION + SETTLE;
  const runway = Math.round(total * (SCROLL_VH_PER_SECOND / 100) * innerHeight);
  const t = (frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION;
  return Math.round((t / total) * runway);
}

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
  let sources = null;

  for (const mode of ["antes", "depois"]) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${mode}] ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`[${mode}] pageerror: ${e.message}`));

    if (mode === "antes") {
      for (const [remux, master] of Object.entries(MASTER_FOR)) {
        await page.route(`**/${remux}`, (r) => r.continue({ url: `${BASE}${master}` }));
      }
    }
    // Compare the moving image only — no cards, no hero copy, no header.
    await page.addStyleTag; // noop guard for older builds
    await page.goto(BASE, { waitUntil: "load", timeout: 90000 });
    await page.addStyleTag({ content: "header,.skip-link,.z-30,.z-40{display:none !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, {
      timeout: 90000,
    });

    for (const shot of SHOTS) {
      const y = scrollForFrame(shot.frame, VP.height);
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      // The playhead is damped (~110ms) and ScrollTrigger scrubs at 0.6, so the
      // canvas needs time to converge before the shutter.
      await page.waitForTimeout(4500);
      const file = join(OUT, `${shot.id}-${mode}.png`);
      await page.screenshot({ path: file, animations: "disabled" });
      console.log(`  ${mode.padEnd(7)} ${shot.id}  scrollY=${y}`);
    }

    if (mode === "depois") {
      sources = await page.evaluate(() =>
        Array.from(document.querySelectorAll("section video")).map((v, i) => ({
          index: i + 1,
          currentSrc: v.currentSrc,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          readyState: v.readyState,
        })),
      );
    }
    await ctx.close();
  }

  await browser.close();
  writeFileSync(join(OUT, "sources.json"), JSON.stringify({ sources, errors }, null, 2));

  console.log("\ncurrentSrc dos cinco segmentos (rota principal):");
  for (const s of sources ?? []) {
    console.log(
      `  seg ${s.index}  ${s.videoWidth}x${s.videoHeight}  rs=${s.readyState}  ${s.currentSrc.replace(BASE, "")}`,
    );
  }
  const raw = (sources ?? []).filter((s) => !/\/media\/web\/scene-0\d-4k-bt709-full\.mp4$/.test(s.currentSrc));
  console.log(raw.length ? `\n*** ${raw.length} segmento(s) ainda em master cru ***` : "\nnenhum master cru requisitado");
  console.log(errors.length ? `\nERROS (${errors.length}):\n  ${errors.join("\n  ")}` : "zero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
