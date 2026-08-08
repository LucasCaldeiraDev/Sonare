#!/usr/bin/env node
/**
 * Why does scrollY=0 look softer than scrollY=1?
 *
 * Reconnaissance only — reads, measures, changes nothing. An init script is
 * installed BEFORE the app boots so the media events are captured from the very
 * first one, then the canvas is sampled continuously so we can see exactly what
 * is on screen at each instant and when it changes.
 *
 *   node init-diagnostic.mjs <baseUrl> [--warm]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const WARM = process.argv.includes("--warm");
const OUT = "media-comparison/scene01-fidelity/init";

/** Runs before any page script. Captures the media timeline from event zero. */
const RECORDER = () => {
  const w = window;
  w.__init = { t0: performance.now(), events: [], samples: [], rvfc: [] };
  const stamp = (name, extra) =>
    w.__init.events.push({ name, t: +(performance.now() - w.__init.t0).toFixed(1), ...extra });

  stamp("script-start");

  const wire = (v) => {
    if (v.__wired) return;
    v.__wired = true;
    stamp("video-element-created", { src: v.getAttribute("src") });
    for (const e of [
      "loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough",
      "seeking", "seeked", "playing", "waiting", "stalled", "error",
    ]) {
      v.addEventListener(e, () =>
        stamp(e, { readyState: v.readyState, currentTime: +v.currentTime.toFixed(4) }),
      );
    }
    if (typeof v.requestVideoFrameCallback === "function") {
      const cb = (_now, meta) => {
        w.__init.rvfc.push({
          t: +(performance.now() - w.__init.t0).toFixed(1),
          mediaTime: +meta.mediaTime.toFixed(4),
          presented: meta.presentedFrames,
        });
        v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    }
  };

  // Discovery by polling, not MutationObserver: an init script runs before the
  // document has a documentElement, so observe() throws there and takes the
  // rest of this script down with it. setInterval does not care.
  setInterval(() => {
    document.querySelectorAll("section video").forEach(wire);
  }, 4);

  // Sample what is actually painted on the canvas, continuously.
  w.__init.sampleErrors = 0;
  const sample = () => {
    const c = document.querySelector("section canvas");
    if (c && c.width) {
      try {
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        // A strip across the middle is enough to fingerprint the content and
        // track its mean luma without the cost of reading the whole surface.
        const d = ctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
        let sum = 0;
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          h = Math.imul(h ^ d[i], 16777619) >>> 0;
        }
        const v = document.querySelector("section video");
        w.__init.samples.push({
          t: +(performance.now() - w.__init.t0).toFixed(1),
          heroSource: document.body.dataset.heroSource ?? null,
          luma: +(sum / (d.length / 4)).toFixed(3),
          hash: h.toString(16),
          readyState: v ? v.readyState : null,
          currentTime: v ? +v.currentTime.toFixed(4) : null,
          canvas: `${c.width}x${c.height}`,
        });
      } catch {
        w.__init.sampleErrors += 1;
      }
    }
  };
  // setInterval, not rAF: rAF is throttled to zero while the document is
  // hidden, which is exactly the state a headless capture runs in.
  const sampler = setInterval(() => {
    sample();
    if (performance.now() - w.__init.t0 > 12000) clearInterval(sampler);
  }, 16);
};

const HIDE = "header,.skip-link,.z-30,.z-40{display:none !important}";

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(RECORDER);
  await page.addInitScript(
    ([css]) => {
      window.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
      });
    },
    [HIDE],
  );

  if (!WARM) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  }

  await page.goto(BASE, { waitUntil: "load", timeout: 90000 });

  // Let the page reach whatever steady state it reaches on its own — this is
  // exactly the state a visitor sees before touching the wheel.
  await page.waitForTimeout(6000);
  const atZero = await page.evaluate(() => ({
    scrollY: window.scrollY,
    heroSource: document.body.dataset.heroSource ?? null,
    ...(() => {
      const v = document.querySelector("section video");
      const c = document.querySelector("section canvas");
      return {
        currentSrc: v?.currentSrc ?? null,
        currentTime: v ? +v.currentTime.toFixed(5) : null,
        readyState: v?.readyState ?? null,
        videoWidth: v?.videoWidth ?? null,
        videoHeight: v?.videoHeight ?? null,
        canvasBacking: c ? `${c.width}x${c.height}` : null,
        canvasCss: c ? `${c.clientWidth}x${c.clientHeight}` : null,
        dpr: window.devicePixelRatio,
        presentedFrames: v?.getVideoPlaybackQuality?.().totalVideoFrames ?? null,
      };
    })(),
  }));
  await page.screenshot({ path: join(OUT, `A-scroll0${WARM ? "-warm" : ""}.png`) });

  const after = [];
  for (const y of [1, 3, 5]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1500);
    after.push(
      await page.evaluate((yy) => ({
        scrollY: yy,
        heroSource: document.body.dataset.heroSource ?? null,
        currentTime: +document.querySelector("section video").currentTime.toFixed(5),
        readyState: document.querySelector("section video").readyState,
      }), y),
    );
    await page.screenshot({ path: join(OUT, `B-scroll${y}${WARM ? "-warm" : ""}.png`) });
  }

  const rec = await page.evaluate(() => window.__init);
  await browser.close();

  writeFileSync(
    join(OUT, `record${WARM ? "-warm" : "-cold"}.json`),
    JSON.stringify({ atZero, after, events: rec.events, rvfc: rec.rvfc.slice(0, 40), samples: rec.samples }, null, 2),
  );

  console.log(`\n=== LINHA DO TEMPO DA MÍDIA (${WARM ? "cache quente" : "cache frio"}) ===`);
  for (const e of rec.events) {
    console.log(`  ${String(e.t).padStart(8)} ms  ${e.name.padEnd(22)} rs=${e.readyState ?? "-"} t=${e.currentTime ?? "-"}`);
  }
  console.log(`\n  primeiros requestVideoFrameCallback:`);
  for (const r of rec.rvfc.slice(0, 6)) {
    console.log(`  ${String(r.t).padStart(8)} ms  mediaTime=${r.mediaTime}  presented=${r.presented}`);
  }

  console.log("\n=== O QUE ESTAVA NO CANVAS, AO LONGO DO TEMPO ===");
  let prev = null;
  for (const s of rec.samples) {
    if (prev && s.hash === prev.hash && s.heroSource === prev.heroSource) continue;
    console.log(
      `  ${String(s.t).padStart(8)} ms  fonte=${String(s.heroSource).padEnd(6)} luma=${String(s.luma).padStart(7)} hash=${s.hash.padStart(8)} rs=${s.readyState} t=${s.currentTime} canvas=${s.canvas}`,
    );
    prev = s;
  }
  console.log(`  (${rec.samples.length} amostras, apenas as mudanças acima)`);

  console.log("\n=== ESTADO EM scrollY=0 (o que o visitante vê antes de rolar) ===");
  for (const [k, v] of Object.entries(atZero)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log("\n=== DEPOIS DE ROLAR ===");
  for (const a of after) console.log(`  scrollY=${a.scrollY}  fonte=${a.heroSource}  t=${a.currentTime}  rs=${a.readyState}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
