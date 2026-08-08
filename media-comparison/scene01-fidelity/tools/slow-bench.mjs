#!/usr/bin/env node
/**
 * The slow-scroll trade-off, measured.
 *
 * At 0,3x the source can only yield 7,2 new frames per wall-second, so the
 * question is not how many frames but HOW THEY ARE SPACED. Two policies with
 * the same frame count feel completely different:
 *
 *   v1  stop every time the playhead lands within half a frame of the target
 *       and restart a moment later — an even budget turned into chatter.
 *   v2  floor the rate so the picture keeps moving, and pay for it with a
 *       bounded lead over the scroll, released in one clear hold.
 *
 * The floor sets the duty cycle (scrollSpeed / floor) and the leash sets the
 * period, so the sweep below is over both. What it reports is the thing the eye
 * actually judges: how long the same picture stays on screen, how much of the
 * gesture is spent holding, and what that costs in sync.
 *
 *   node slow-bench.mjs <baseUrl> [--modes v1,v2-050-10,...]
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
const FPS = 24;

const scrollFor = (frame) => {
  const total = GLOBAL_DURATION + SETTLE;
  const runway = Math.round(total * (SCROLL_VH_PER_SECOND / 100) * VH);
  return Math.round((((frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION) / total) * runway);
};

/** All inside scene 05 (global 505..697): no boundary, no direction change. */
const MS = 6200;
const GESTURES = [
  { id: "v013", label: "0,13x  (leitura)", from: 515, to: 534, ms: MS, x: 0.13 },
  { id: "v025", label: "0,25x  (bem lento)", from: 515, to: 552, ms: MS, x: 0.25 },
  { id: "v050", label: "0,50x  (lento)", from: 515, to: 589, ms: MS, x: 0.5 },
  { id: "v100", label: "1,00x  (normal)", from: 515, to: 664, ms: MS, x: 1.0 },
  { id: "v200", label: "2,00x  (rápido)", from: 510, to: 660, ms: 3100, x: 2.0 },
  { id: "u050", label: "0,50x  subindo", from: 620, to: 546, ms: MS, x: 0.5, up: true },
  { id: "u100", label: "1,00x  subindo", from: 664, to: 515, ms: MS, x: 1.0, up: true },
];

const MODES = {
  v1: "?policy=v1",
  "v2-r025-l10": "?rateMin=0.25&lead=10",
  "v2-r050-l10": "?rateMin=0.5&lead=10",
  "v2-r050-l24": "?rateMin=0.5&lead=24",
  "v2-r075-l24": "?rateMin=0.75&lead=24",
  "v2-r100-l36": "?rateMin=1&lead=36",
  // Isolates the state machine from the floor: v2 wiring, v1's floor, and a
  // leash set so far out it can only act as a backstop.
  "v2-r008-l120": "?rateMin=0.08&lead=120",
  "v2-r025-l120": "?rateMin=0.25&lead=120",
  // Same v1 controller, twice the frames in the file. At a given scroll speed
  // the rate is unchanged and the story advances identically; only the number
  // of distinct pictures per wall-second doubles.
  "48fps": "?temporalMedia=48",
};

const DRIVE = async ({ y0, y1, ms, prime, hold }) => {
  window.scrollTo(0, prime ?? y0);
  await new Promise((r) => setTimeout(r, 1500));
  if (prime != null) {
    // Establish direction and finish any handover before measuring.
    const t = performance.now();
    await new Promise((res) => {
      const l = (ts) => {
        const p = Math.min(1, (ts - t) / 700);
        window.scrollTo(0, Math.round(prime + (y0 - prime) * p));
        if (p < 1) requestAnimationFrame(l);
        else res();
      };
      requestAnimationFrame(l);
    });
  }

  const v = window.__cnVisible;
  const p = window.__cnPlayback;
  const k = window.__cnTick;
  const b = {
    n: v.newFrameAt.length, lag: v.lagFrames.length, draws: v.draws, redraws: v.redraws,
    plays: p.plays, pauses: p.pauses, byReason: { ...p.byReason }, tick: k.t.length, ev: k.events.length,
    // Seeks matter here: a policy that "fixes" cadence by seeking backwards
    // scores well on unique frames while the eye sees a rewind loop.
    seeks: v.syncSeeks(),
  };

  const t0 = performance.now();
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      window.scrollTo(0, Math.round(y0 + ((y1 - y0) * Math.min(t, ms)) / ms));
      if (t < ms) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  const endAt = performance.now();
  await new Promise((r) => setTimeout(r, hold));

  const byReason = {};
  for (const key of Object.keys(p.byReason)) byReason[key] = p.byReason[key] - (b.byReason[key] ?? 0);
  const n = k.t.length;
  return {
    t0,
    gestureMs: +(endAt - t0).toFixed(1),
    totalMs: +(performance.now() - t0).toFixed(1),
    times: v.newFrameAt.slice(b.n),
    lag: v.lagFrames.slice(b.lag),
    draws: v.draws - b.draws,
    redraws: v.redraws - b.redraws,
    plays: p.plays - b.plays,
    pauses: p.pauses - b.pauses,
    seeks: v.syncSeeks() - b.seeks,
    byReason,
    mediaEvents: k.events.slice(b.ev),
    tick: {
      t: k.t.slice(b.tick, n), rate: k.rate.slice(b.tick, n), paused: k.paused.slice(b.tick, n),
      moving: k.moving.slice(b.tick, n), delta: k.delta.slice(b.tick, n), vel: k.vel.slice(b.tick, n),
    },
    scrolled: window.scrollY,
  };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

function analyse(r) {
  const T = r.tick;
  // Hold times ARE the intervals between unique frames: how long one picture
  // stayed on screen. Restricted to the gesture, because the tail after it is
  // the settle, reported separately.
  const holds = [];
  const inGesture = r.times.filter((t) => t - r.t0 <= r.gestureMs);
  for (let i = 1; i < inGesture.length; i++) holds.push(inGesture[i] - inGesture[i - 1]);
  const over = (n) => holds.filter((h) => h > n).length;
  const heldMs = (n) => Math.round(holds.filter((h) => h > n).reduce((s, h) => s + h, 0));

  let playingMs = 0;
  let movingMs = 0;
  const movingRates = [];
  for (let i = 1; i < T.t.length; i++) {
    const dt = T.t[i] - T.t[i - 1];
    if (dt <= 0 || dt > 200) continue;
    if (T.moving[i] === 2) {
      movingMs += dt;
      if (!T.paused[i]) {
        playingMs += dt;
        movingRates.push(T.rate[i]);
      }
    }
  }
  // Positive lag = screen behind the scroll; negative = the floor pushed it ahead.
  const lagIn = r.lag;
  const last = r.times.length ? r.times[r.times.length - 1] : r.t0;
  return {
    unique: inGesture.length,
    fps: +(inGesture.length / (r.gestureMs / 1000)).toFixed(1),
    p50: pct(holds, 50), p95: pct(holds, 95), p99: pct(holds, 99),
    maxHold: holds.length ? +Math.max(...holds).toFixed(0) : null,
    over75: over(75), over150: over(150), over250: over(250),
    heldPct: r.gestureMs ? Math.round((100 * heldMs(100)) / r.gestureMs) : null,
    duty: movingMs ? Math.round((100 * playingMs) / movingMs) : null,
    rateP50: pct(movingRates, 50),
    lagP50: pct(lagIn, 50), lagP95: pct(lagIn, 95),
    leadMax: lagIn.length ? +Math.min(...lagIn).toFixed(1) : null,
    lagMax: lagIn.length ? +Math.max(...lagIn).toFixed(1) : null,
    plays: r.plays, pauses: r.pauses, seeks: r.seeks,
    settleMs: Math.round(Math.max(0, last - r.t0 - r.gestureMs)),
    redraws: r.redraws,
    byReason: r.byReason,
    mediaEvents: r.mediaEvents.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {}),
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : Object.keys(MODES);
  })();

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    ],
  });

  const out = {};
  const errors = [];
  for (const mode of wanted) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${mode}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${mode}] ${c.text()}`); });
    const q = MODES[mode] ?? "";
    await page.goto(`${BASE}/${q}${q ? "&" : "?"}standby=off`, { waitUntil: "load", timeout: 90000 });
    // scroll-behavior: smooth throttles a rAF-driven scrollTo to ~200 px/s.
    await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    out[mode] = {};
    for (const g of GESTURES) {
      out[mode][g.id] = analyse(
        await page.evaluate(DRIVE, {
          y0: scrollFor(g.from),
          y1: scrollFor(g.to),
          ms: g.ms,
          prime: g.up ? scrollFor(g.from + 18) : null,
          hold: 1800,
        }),
      );
      await page.waitForTimeout(400);
    }
    console.log(`  ${mode} concluído`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "slow.json"), JSON.stringify({ out, errors }, null, 2));

  for (const g of GESTURES) {
    const teto = g.x >= 1 ? 41.7 : +(41.7 / g.x).toFixed(0);
    console.log(`\n### ${g.label}   piso aritmético entre frames: ${teto} ms   (${(24 * Math.min(g.x, 1)).toFixed(1)} fps)`);
    console.log("modo            únicos  fps   p50    p95    p99   maior  >75 >150 >250  % parado  duty  taxa med   lag p50/p95  adiant.máx  atras.máx  pausas  seeks  estab");
    console.log("-".repeat(172));
    for (const mode of wanted) {
      const a = out[mode][g.id];
      console.log(
        `${mode.padEnd(15)}${String(a.unique).padStart(6)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.p99).padStart(7)}${String(a.maxHold).padStart(7)}` +
          `${String(a.over75).padStart(5)}${String(a.over150).padStart(5)}${String(a.over250).padStart(5)}` +
          `${String(a.heldPct + "%").padStart(10)}${String(a.duty + "%").padStart(6)}${String(a.rateP50).padStart(10)}` +
          `${String(`${a.lagP50}/${a.lagP95}`).padStart(14)}${String(a.leadMax).padStart(12)}${String(a.lagMax).padStart(11)}` +
          `${String(a.pauses).padStart(8)}${String(a.seeks).padStart(7)}${String(a.settleMs).padStart(7)}`,
      );
    }
  }

  console.log("\n### motivos de pausa por modo (soma de todos os gestos)");
  for (const mode of wanted) {
    const tot = {};
    for (const g of GESTURES) {
      for (const [k, n] of Object.entries(out[mode][g.id].byReason)) tot[k] = (tot[k] ?? 0) + n;
    }
    const ev = {};
    for (const g of GESTURES) {
      for (const [k, n] of Object.entries(out[mode][g.id].mediaEvents)) ev[k] = (ev[k] ?? 0) + n;
    }
    console.log(
      `  ${mode.padEnd(15)} ${Object.entries(tot).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join("  ") || "—"}` +
        `   | eventos: ${Object.entries(ev).map(([k, n]) => `${k}=${n}`).join(" ") || "nenhum"}`,
    );
  }

  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
