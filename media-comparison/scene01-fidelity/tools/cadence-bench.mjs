#!/usr/bin/env node
/**
 * Cadence of VISIBLE frames — the metric the previous report got wrong.
 *
 * The old number summed requestVideoFrameCallback across every element,
 * standby decoders included, and reported 36,9 "fps" from a 24 fps source.
 * That is arithmetically impossible for one visible surface and was counting
 * decoder chatter nobody could see.
 *
 * Here a frame counts only when the pair (drawn track, drawn media frame)
 * changes, read from __cnVisible, which the canvas writes at the moment it
 * actually puts different pixels on screen. At 1x the ceiling is one frame
 * every 41,67 ms; what matters is not the mean but the spread, so the output
 * is the interval distribution and the count of long gaps.
 *
 *   node cadence-bench.mjs <baseUrl> [--modes a,b,c]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/cadence";

const GLOBAL_DURATION = 29.083335;
const GLOBAL_FRAMES = 698;
const SCROLL_VH_PER_SECOND = 62;
const SETTLE = 2.0;
const VH = 1080;

const scrollFor = (frame) => {
  const total = GLOBAL_DURATION + SETTLE;
  const runway = Math.round(total * (SCROLL_VH_PER_SECOND / 100) * VH);
  return Math.round((((frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION) / total) * runway);
};

/** ~1x story speed is 24 global frames per second of wall clock. */
const GESTURES = [
  { id: "desce-1x", label: "desce ~1x", kf: [[0, 20], [5000, 140]] },
  { id: "desce-rapido", label: "desce rápido", kf: [[0, 20], [1200, 300]] },
  { id: "sobe-1x", label: "sobe ~1x", kf: [[0, 140], [5000, 20]] },
  { id: "sobe-rapido", label: "sobe rápido", kf: [[0, 300], [1200, 20]] },
  { id: "acelera", label: "acelera", kf: [[0, 20], [1500, 45], [3000, 200]] },
  { id: "desacelera", label: "desacelera", kf: [[0, 200], [1500, 45], [3000, 20]] },
  { id: "zigzag", label: "zigzag", kf: [[0, 60], [900, 160], [1800, 60], [2700, 160]] },
  { id: "reversao-cena", label: "reversão na cena", kf: [[0, 60], [1600, 140], [3200, 60]] },
  { id: "reversao-fronteira", label: "reversão na fronteira", kf: [[0, 150], [1200, 182], [2400, 150]] },
];
const HOLD = 1200;

const MODES = {
  base: "",
  standbyOff: "?standby=off",
  fixedRate1: "?fixedRate=1",
  noReverse: "?reverseMedia=off",
  dpr1: "?dpr=1",
  gopLongo: "?media=original&reverseMedia=off",
};

const DRIVE = async ({ kf, hold }) => {
  const at = (t) => {
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) {
      if (t <= kf[i][0]) {
        const [t0, y0] = kf[i - 1];
        const [t1, y1] = kf[i];
        return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
      }
    }
    return kf[kf.length - 1][1];
  };
  window.scrollTo(0, at(0));
  await new Promise((r) => setTimeout(r, 1300));

  const v = window.__cnVisible;
  const base = {
    n: v.newFrameAt.length,
    draws: v.draws,
    redraws: v.redraws,
    switches: v.trackSwitches,
    rate: v.rateChanges(),
    seeks: v.syncSeeks(),
    drawMs: v.drawMs.length,
  };
  const t0 = performance.now();
  const duration = kf[kf.length - 1][0] + hold;
  const longTasks = [];
  let po = null;
  try {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1));
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch { /* unsupported */ }

  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      window.scrollTo(0, Math.round(at(Math.min(t, kf[kf.length - 1][0]))));
      if (t < duration) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  if (po) po.disconnect();

  const times = v.newFrameAt.slice(base.n);
  const drawMs = v.drawMs.slice(base.drawMs);
  return {
    durationMs: duration,
    times,
    drawMs,
    longTasks,
    draws: v.draws - base.draws,
    redraws: v.redraws - base.redraws,
    switches: v.trackSwitches - base.switches,
    rateChanges: v.rateChanges() - base.rate,
    seeks: v.syncSeeks() - base.seeks,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
};

const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

function analyse(r) {
  const gaps = [];
  for (let i = 1; i < r.times.length; i++) gaps.push(r.times[i] - r.times[i - 1]);
  const over = (n) => gaps.filter((g) => g > n).length;
  return {
    unique: r.times.length,
    fps: +(r.times.length / (r.durationMs / 1000)).toFixed(1),
    p50: pct(gaps, 50),
    p95: pct(gaps, 95),
    p99: pct(gaps, 99),
    max: gaps.length ? +Math.max(...gaps).toFixed(1) : null,
    over50: over(50),
    over75: over(75),
    over100: over(100),
    over150: over(150),
    draws: r.draws,
    redraws: r.redraws,
    switches: r.switches,
    rateChanges: r.rateChanges,
    seeks: r.seeks,
    drawMsP95: pct(r.drawMs, 95),
    longTasks: r.longTasks.length,
    heapMB: r.heapMB,
    gaps,
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : ["base"];
  })();

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
    ],
  });

  const out = {};
  const errors = [];
  for (const mode of wanted) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${mode}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${mode}] ${c.text()}`); });
    await page.goto(`${BASE}/${MODES[mode] ?? ""}`, { waitUntil: "load", timeout: 90000 });
    // `scroll-behavior: smooth` throttles a rAF-driven scrollTo to ~200 px/s.
    // See factorial-bench.mjs for the measurement.
    await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    out[mode] = {};
    for (const g of GESTURES) {
      const kf = g.kf.map(([t, f]) => [t, scrollFor(f)]);
      out[mode][g.id] = analyse(await page.evaluate(DRIVE, { kf, hold: HOLD }));
      await page.waitForTimeout(400);
    }
    console.log(`  ${mode} concluído`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "cadence.json"), JSON.stringify({ out, errors }, null, 2));

  for (const mode of wanted) {
    console.log(`\n### modo: ${mode}   (teto de uma fonte 24 fps a 1x = 41,7 ms)`);
    console.log("gesto                  únicos  fps   p50    p95    p99    máx   >50 >75 >100 >150  redraws  trocas  rate  seeks  draw p95  LT");
    console.log("-".repeat(134));
    for (const g of GESTURES) {
      const a = out[mode][g.id];
      console.log(
        `${g.label.padEnd(22)}${String(a.unique).padStart(6)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.p99).padStart(7)}${String(a.max).padStart(7)}` +
          `${String(a.over50).padStart(5)}${String(a.over75).padStart(4)}${String(a.over100).padStart(5)}${String(a.over150).padStart(5)}` +
          `${String(a.redraws).padStart(9)}${String(a.switches).padStart(8)}${String(a.rateChanges).padStart(6)}${String(a.seeks).padStart(7)}` +
          `${String(a.drawMsP95).padStart(10)}${String(a.longTasks).padStart(4)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
