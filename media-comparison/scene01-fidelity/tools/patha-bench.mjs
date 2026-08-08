#!/usr/bin/env node
/**
 * Path A vs the old model, on the REAL site.
 *
 * Same gestures, same scroll runway, same page — the only difference is
 * `?playhead=seek`, which restores seek-per-frame. Because this runs on the
 * site and not the diagnostic route, it can finally cross the segment
 * boundaries in both directions.
 *
 * The headline number is frames PRESENTED per second: how much moving picture
 * the viewer actually receives while the gesture is happening.
 *
 *   node patha-bench.mjs <baseUrl>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/patha";

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

/** Gestures in GLOBAL frames. The last two cross segment boundaries. */
const GESTURES = [
  { id: "desce-lento", label: "scroll lento p/ baixo", kf: [[0, 0], [6000, 80]], hold: 800 },
  { id: "desce-rapido", label: "scroll rápido p/ baixo", kf: [[0, 0], [900, 160]], hold: 2000 },
  { id: "sobe-rapido", label: "scroll rápido p/ cima", kf: [[0, 160], [900, 3]], hold: 2000 },
  { id: "zigzag", label: "alternância baixo/cima", kf: [[0, 40], [700, 140], [1400, 40], [2100, 140], [2800, 40]], hold: 1500 },
  { id: "fronteira-1-2", label: "fronteira 01↔02 ida e volta", kf: [[0, 150], [900, 190], [1800, 190], [2700, 150]], hold: 1500 },
  { id: "fronteira-3-4", label: "fronteira 03↔04 ida e volta", kf: [[0, 370], [900, 400], [1800, 400], [2700, 370]], hold: 1500 },
];

const RECORDER = () => {
  const w = window;
  w.__pa = { rvfc: [], seeks: [], raf: [], t0: 0 };
  const wire = (v, i) => {
    if (v.__paWired) return;
    v.__paWired = true;
    v.addEventListener("seeking", () => w.__pa.seeks.push({ i, t: performance.now() - w.__pa.t0 }));
    if (typeof v.requestVideoFrameCallback === "function") {
      const cb = (_n, meta) => {
        w.__pa.rvfc.push({ i, t: +(performance.now() - w.__pa.t0).toFixed(1), mediaTime: +meta.mediaTime.toFixed(4) });
        v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    }
  };
  setInterval(() => {
    document.querySelectorAll("section video").forEach(wire);
  }, 8);
};

const DRIVE = async ({ kf, hold }) => {
  const w = window;
  w.__pa.rvfc.length = 0;
  w.__pa.seeks.length = 0;
  w.__pa.raf.length = 0;
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
  const duration = kf[kf.length - 1][0] + (hold || 0);
  window.scrollTo(0, at(0));
  await new Promise((r) => setTimeout(r, 900));
  w.__pa.t0 = performance.now();
  w.__pa.rvfc.length = 0;
  w.__pa.seeks.length = 0;
  let last = 0;
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - w.__pa.t0;
      if (last) w.__pa.raf.push(+(ts - last).toFixed(2));
      last = ts;
      window.scrollTo(0, Math.round(at(Math.min(t, kf[kf.length - 1][0]))));
      if (t < duration) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  return { rvfc: w.__pa.rvfc.slice(), seeks: w.__pa.seeks.slice(), raf: w.__pa.raf.slice(), duration };
};

const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
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

  // --media compares the media instead of the playhead model: single-keyframe
  // originals against the GOP-6 derivatives, both on the shipped controller.
  const MODES = process.argv.includes("--reverse")
    ? [
        { id: "antigo", url: `${BASE}/?reverseMedia=off`, label: "sem mídia reversa" },
        { id: "pathA", url: `${BASE}/`, label: "com mídia reversa" },
      ]
    : process.argv.includes("--media")
    ? [
        { id: "antigo", url: `${BASE}/?media=original`, label: "GOP longo (1 keyframe)" },
        { id: "pathA", url: `${BASE}/`, label: "GOP 6" },
      ]
    : [
        { id: "antigo", url: `${BASE}/?playhead=seek`, label: "seek por frame (antigo)" },
        { id: "pathA", url: `${BASE}/`, label: "Caminho A (rate-steered)" },
      ];

  const out = {};
  const errors = [];

  for (const m of MODES) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${m.id}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${m.id}] ${c.text()}`); });
    await page.addInitScript(RECORDER);
    await page.goto(m.url, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    out[m.id] = { label: m.label, g: {} };
    for (const g of GESTURES) {
      const gestureKf = g.kf.map(([t, f]) => [t, scrollFor(f)]);
      const rec = await page.evaluate(DRIVE, { kf: gestureKf, hold: g.hold });
      const secs = rec.duration / 1000;
      out[m.id].g[g.id] = {
        presented: rec.rvfc.length,
        fps: +(rec.rvfc.length / secs).toFixed(1),
        seeks: rec.seeks.length,
        rafP99: +pct(rec.raf, 99).toFixed(1),
        secs: +secs.toFixed(2),
      };
      console.log(`  ${m.id.padEnd(7)} ${g.id.padEnd(16)} apresentados ${String(rec.rvfc.length).padStart(4)}  (${(rec.rvfc.length / secs).toFixed(1)} fps)  seeks ${rec.seeks.length}`);
      await page.waitForTimeout(500);
    }
    await ctx.close();
  }

  await browser.close();
  writeFileSync(join(OUT, "patha.json"), JSON.stringify({ out, errors }, null, 2));

  console.log("\ngesto                          antigo: apres./fps/seeks     Caminho A: apres./fps/seeks     ganho fps");
  console.log("-".repeat(108));
  for (const g of GESTURES) {
    const a = out.antigo.g[g.id];
    const b = out.pathA.g[g.id];
    const gain = a.fps > 0 ? `${(b.fps / a.fps).toFixed(1)}x` : "—";
    console.log(
      `${g.label.padEnd(30)}${String(a.presented).padStart(7)} /${String(a.fps).padStart(6)} /${String(a.seeks).padStart(5)}` +
        `${String(b.presented).padStart(16)} /${String(b.fps).padStart(6)} /${String(b.seeks).padStart(5)}` +
        `${gain.padStart(13)}`,
    );
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
