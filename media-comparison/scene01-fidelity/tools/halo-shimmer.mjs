#!/usr/bin/env node
/**
 * Halo and shimmer, measured on a real frame sequence.
 *
 * halo    overshoot. For every pixel, the local min/max of the UNSHARPENED
 *         render is the range the scene actually contains there. A sharpened
 *         pixel that lands outside that range is not detail — it is a rim drawn
 *         around the edge. Counted as % of pixels and mean excess.
 *
 * shimmer temporal instability. During smooth camera motion, acutance should
 *         evolve smoothly. Aliasing makes it jitter. Measured as the standard
 *         deviation of the residual after removing a 3-frame moving average,
 *         so the underlying trend of the shot does not count as shimmer.
 *
 *   node halo-shimmer.mjs <baseUrl>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/halo";
const FRAMES = Array.from({ length: 12 }, (_, i) => 8 + i);

const RENDERERS = [
  { id: "canvas2d", q: { mode: "C", sq: "high" }, label: "Canvas 2D" },
  { id: "webgl", q: { mode: "D", glq: "lanczos", sharpen: "0" }, label: "WebGL" },
  { id: "webgl-sharp", q: { mode: "D", glq: "lanczos", sharpen: "0.25" }, label: "WebGL +0,25" },
];

const rgb = (f) => {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", f, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
  return raw;
};
const W = 1920;
const H = 1080;

const lumaOf = (raw) => {
  const y = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 3;
    y[i] = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2];
  }
  return y;
};

const acutance = (y) => {
  let s = 0;
  let n = 0;
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      s += Math.abs(4 * y[k] - y[k - 1] - y[k + 1] - y[k - W] - y[k + W]);
      n++;
    }
  }
  return s / n;
};

/** % of pixels where `sharp` leaves the 3x3 range of `base`, and mean excess. */
const halo = (base, sharp) => {
  let count = 0;
  let excess = 0;
  let edgePixels = 0;
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      let mn = Infinity;
      let mx = -Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const v = base[k + dj * W + di];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      // Only edges can halo; flat areas cannot and would dilute the statistic.
      if (mx - mn < 6) continue;
      edgePixels++;
      const s = sharp[k];
      if (s > mx) { count++; excess += s - mx; }
      else if (s < mn) { count++; excess += mn - s; }
    }
  }
  return {
    edgePixels,
    overshootPct: +((count / edgePixels) * 100).toFixed(3),
    meanExcess: count ? +(excess / count).toFixed(3) : 0,
  };
};

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

  for (const r of RENDERERS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const p = new URLSearchParams({ fit: "cover", zoom: "1", ui: "0", frame: "8", vsrc: "tv", ...r.q });
    await page.goto(`${BASE}/quality-diagnostic?${p}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForSelector('body[data-qd-ready="1"]', { state: "attached", timeout: 60000 });
    mkdirSync(join(OUT, r.id), { recursive: true });
    for (const f of FRAMES) {
      await page.evaluate((n) => window.__qdSetFrame(n), f);
      await page.waitForFunction(() => document.body.dataset.qdReady === "1", null, { timeout: 30000 });
      await page.waitForTimeout(320);
      await page.screenshot({ path: join(OUT, r.id, `f${String(f).padStart(3, "0")}.png`) });
    }
    console.log(`  ${r.id.padEnd(14)} ${FRAMES.length} frames capturados`);
    await ctx.close();
  }
  await browser.close();

  console.log("\n=== SHIMMER — instabilidade temporal da acutância ===");
  console.log("(resíduo após média móvel de 3; menor = mais estável)\n");
  console.log("renderer          acutância média    desvio do resíduo    máx |resíduo|");
  console.log("-".repeat(72));
  const series = {};
  for (const r of RENDERERS) {
    const acs = FRAMES.map((f) => acutance(lumaOf(rgb(join(OUT, r.id, `f${String(f).padStart(3, "0")}.png`)))));
    series[r.id] = acs;
    const resid = acs.map((v, i) => {
      const a = acs[Math.max(0, i - 1)];
      const c = acs[Math.min(acs.length - 1, i + 1)];
      return v - (a + v + c) / 3;
    });
    const mean = acs.reduce((x, y) => x + y, 0) / acs.length;
    const rm = resid.reduce((x, y) => x + y, 0) / resid.length;
    const sd = Math.sqrt(resid.reduce((x, y) => x + (y - rm) ** 2, 0) / resid.length);
    console.log(
      `${r.label.padEnd(18)}${mean.toFixed(3).padStart(12)}${sd.toFixed(4).padStart(21)}${Math.max(...resid.map(Math.abs)).toFixed(4).padStart(17)}`,
    );
  }

  console.log("\n=== HALO — overshoot do sharpen 0,25 sobre o WebGL sem sharpen ===");
  console.log("frame   pixels de borda   % com overshoot   excesso médio (níveis)");
  console.log("-".repeat(70));
  for (const f of [8, 12, 16, 19]) {
    const n = `f${String(f).padStart(3, "0")}.png`;
    const base = lumaOf(rgb(join(OUT, "webgl", n)));
    const sharp = lumaOf(rgb(join(OUT, "webgl-sharp", n)));
    const h = halo(base, sharp);
    console.log(
      `${String(f).padStart(5)}${String(h.edgePixels).padStart(18)}${String(h.overshootPct).padStart(18)}%${String(h.meanExcess).padStart(20)}`,
    );
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
