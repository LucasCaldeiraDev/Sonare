#!/usr/bin/env node
/**
 * Captures the real site hero (not the diagnostic bench) in the states the
 * audit has to prove:
 *
 *   before-clean     the pre-fix site: the untagged master swapped back in by
 *                    route interception, overlays hidden. This is the "darker,
 *                    crushed" state the user reported.
 *   after-clean      the same page on the tagged remux, overlays hidden.
 *   poster-only      the mp4 aborted, so the poster is what stays on screen.
 *                    Diffing this against after-clean is the no-jump proof.
 *   after-overlay    the shipped state, hero copy and header included.
 *
 *   node site-capture.mjs <baseUrl> <outDir> [--tag <suffix>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "media-comparison/scene01-fidelity/site";
const tagIdx = process.argv.indexOf("--tag");
const TAG = tagIdx > -1 ? `-${process.argv[tagIdx + 1]}` : "";

const REMUX = "**/scene-01-4k-bt709-tv.mp4";
const MASTER_FILE = "media-comparison/source-archive/masters/001-Sonare-Cena 01 completa.mp4";
const MASTER_URL = "/media-comparison/source-archive/masters/001-Sonare-Cena%2001%20completa.mp4";

/** Everything that is not the moving image. Hidden for the clean comparisons. */
const HIDE_CHROME = `
  header, .skip-link, .z-30, .z-40 { display: none !important; }
`;

const STATES = [
  { id: "before-clean", swapToMaster: true, hideChrome: true, blockVideo: false },
  { id: "after-clean", swapToMaster: false, hideChrome: true, blockVideo: false },
  { id: "poster-only", swapToMaster: false, hideChrome: true, blockVideo: true },
  { id: "after-overlay", swapToMaster: false, hideChrome: false, blockVideo: false },
];

const VIEWPORTS = [
  { name: "1920x1080-dpr1", width: 1920, height: 1080, dsf: 1 },
  { name: "1440x900-dpr1", width: 1440, height: 900, dsf: 1 },
];

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const masterBytes = readFileSync(MASTER_FILE);
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
  const results = [];

  for (const vp of VIEWPORTS) {
    for (const st of STATES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
      });
      const page = await ctx.newPage();
      page.on("console", (m) => {
        // poster-only aborts the mp4 on purpose; the resulting load failure is
        // the point of the state, not a defect.
        if (st.blockVideo && /Failed to load resource/i.test(m.text())) return;
        if (m.type() === "error") errors.push(`[${vp.name}/${st.id}] ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(`[${vp.name}/${st.id}] pageerror: ${e.message}`));

      if (st.blockVideo) {
        await page.route("**/*.mp4", (r) => r.abort());
      } else if (st.swapToMaster) {
        // Point the request at the ORIGINAL untagged file: same pixels, no colr
        // box, so the container tag is the only variable. Redirecting beats
        // fulfilling with the bytes — buffering 35 MB through the driver is
        // slow enough to blow the readiness timeout.
        await page.route(REMUX, (r) => r.continue({ url: `${BASE}${MASTER_URL}` }));
      }
      if (st.hideChrome) await page.addInitScript(() => {
        window.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = "header,.skip-link,.z-30,.z-40{display:none !important}";
          document.head.appendChild(s);
        });
      });

      try {
        await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
        if (st.hideChrome) await page.addStyleTag({ content: HIDE_CHROME });

        if (st.blockVideo) {
          // Poster is the visible surface only while the canvas is still blank.
          // NOTE: waitForFunction's second positional parameter is the argument
          // handed to the page function — options are third. Passing options
          // second silently leaves the default 30s timeout in place.
          await page.waitForFunction(
            () => document.body.dataset.heroSource === "poster",
            null,
            { timeout: 30000 },
          );
        } else {
          await page.waitForFunction(
            () => document.body.dataset.heroSource === "video",
            null,
            { timeout: 90000 },
          );
        }
        await page.waitForTimeout(900);

        const info = await page.evaluate(() => {
          const v = document.querySelector("section video");
          const c = document.querySelector("section canvas");
          return {
            currentSrc: v ? v.currentSrc : null,
            videoWidth: v ? v.videoWidth : null,
            videoHeight: v ? v.videoHeight : null,
            readyState: v ? v.readyState : null,
            canvas: c ? { w: c.width, h: c.height } : null,
            clientW: c ? c.clientWidth : null,
            clientH: c ? c.clientHeight : null,
            dpr: window.devicePixelRatio,
            heroSource: document.body.dataset.heroSource ?? null,
          };
        });

        const dir = join(OUT, vp.name);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${st.id}${TAG}.png`);
        await page.screenshot({ path: file, animations: "disabled" });
        results.push({ viewport: vp.name, state: st.id, file, info });
        console.log(`  ${vp.name.padEnd(16)} ${st.id.padEnd(16)} ok  ${info.videoWidth ?? "-"}x${info.videoHeight ?? "-"} canvas ${info.canvas ? info.canvas.w + "x" + info.canvas.h : "-"}`);
      } catch (e) {
        console.log(`  ${vp.name.padEnd(16)} ${st.id.padEnd(16)} FAILED ${String(e.message).split("\n")[0]}`);
        errors.push(`[${vp.name}/${st.id}] ${String(e.message).split("\n")[0]}`);
      }
      await ctx.close();
    }
  }

  await browser.close();
  writeFileSync(join(OUT, `manifest${TAG}.json`), JSON.stringify({ results, errors }, null, 2));
  console.log(errors.length ? `\nERRORS (${errors.length}):\n  ${errors.join("\n  ")}` : "\nzero console errors");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
