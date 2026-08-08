#!/usr/bin/env node
/**
 * Cadence under REAL input events, not window.scrollTo.
 *
 * The previous harness drove the page with scrollTo inside a rAF loop, which
 * collides with the site's `scroll-behavior: smooth` and silently throttled the
 * page to ~200 px/s. Forcing `scroll-behavior: auto` fixed the measurement, but
 * it also means every number so far describes a perfectly linear ramp — which is
 * nothing like a mouse wheel.
 *
 * A Windows wheel detent is a discrete ~100 px jump arriving every 30-150 ms.
 * Between two detents the target can sit still long enough for the controller to
 * declare the gesture over (SETTLE_MS = 140 ms), zero its velocity estimate and
 * pause the decoder — once per detent. A linear ramp can never produce that.
 *
 * So this bench dispatches genuine wheel events through CDP and leaves
 * `scroll-behavior` alone, because smooth scrolling does not apply to user input
 * — which is itself worth confirming rather than assuming.
 *
 *   node wheel-bench.mjs <baseUrl> [--dpr 2] [--modes base,A]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/cadence";
const VH = 1080;

const GLOBAL_DURATION = 29.083335;
const SCROLL_VH_PER_SECOND = 62;
const SETTLE = 2.0;
const GLOBAL_FRAMES = 698;
const RUNWAY = Math.round((GLOBAL_DURATION + SETTLE) * (SCROLL_VH_PER_SECOND / 100) * VH);
const scrollFor = (frame) =>
  Math.round((((frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION) / (GLOBAL_DURATION + SETTLE)) * RUNWAY);

/**
 * Each pattern is a list of [deltaY, gapMsAfter]. 100 px is one Windows detent;
 * a precision trackpad sends much smaller deltas at frame rate.
 */
const PATTERNS = [
  { id: "roda-lenta", label: "roda lenta (1 clique/200 ms)", step: [100, 200], n: 30 },
  { id: "roda-media", label: "roda média (1 clique/100 ms)", step: [100, 100], n: 55 },
  { id: "roda-rapida", label: "roda rápida (1 clique/50 ms)", step: [100, 50], n: 90 },
  { id: "roda-rajada", label: "roda em rajada (3 cliques + 300 ms)", burst: true, n: 16 },
  { id: "trackpad", label: "trackpad contínuo (12 px/16 ms)", step: [12, 16], n: 380 },
  { id: "trackpad-lento", label: "trackpad lento (4 px/16 ms)", step: [4, 16], n: 380 },
  { id: "roda-cima", label: "roda para cima (1 clique/100 ms)", step: [-100, 100], n: 55, up: true },
];

const MODES = {
  base: "",
  A: "?continuousWhileMoving=1",
};

const snapshot = () => {
  const v = window.__cnVisible;
  const p = window.__cnPlayback;
  const k = window.__cnTick;
  return {
    n: v.newFrameAt.length,
    draws: v.draws,
    redraws: v.redraws,
    lag: v.lagFrames.length,
    plays: p.plays,
    pauses: p.pauses,
    cycles: p.cycles,
    movingPauses: p.pausedWhileMoving,
    byReason: { ...p.byReason },
    tick: k.t.length,
    ev: k.events.length,
    y: window.scrollY,
  };
};

const collect = (b) => {
  const v = window.__cnVisible;
  const p = window.__cnPlayback;
  const k = window.__cnTick;
  const byReason = {};
  for (const key of Object.keys(p.byReason)) byReason[key] = p.byReason[key] - (b.byReason[key] ?? 0);
  const n = k.t.length;
  return {
    times: v.newFrameAt.slice(b.n),
    lagFrames: v.lagFrames.slice(b.lag),
    draws: v.draws - b.draws,
    redraws: v.redraws - b.redraws,
    plays: p.plays - b.plays,
    pauses: p.pauses - b.pauses,
    cycles: p.cycles - b.cycles,
    movingPauses: p.pausedWhileMoving - b.movingPauses,
    byReason,
    mediaEvents: k.events.slice(b.ev),
    tick: {
      t: k.t.slice(b.tick, n),
      rate: k.rate.slice(b.tick, n),
      paused: k.paused.slice(b.tick, n),
      moving: k.moving.slice(b.tick, n),
      vel: k.vel.slice(b.tick, n),
    },
    scrolled: window.scrollY - b.y,
  };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};
const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null);

function analyse(r, wallMs) {
  const gaps = [];
  for (let i = 1; i < r.times.length; i++) gaps.push(r.times[i] - r.times[i - 1]);
  const over = (n) => gaps.filter((g) => g > n).length;
  const T = r.tick;
  let pausedMovingMs = 0;
  let settledTicks = 0;
  for (let i = 1; i < T.t.length; i++) {
    const dt = T.t[i] - T.t[i - 1];
    if (dt <= 0 || dt > 200) continue;
    if (!T.moving[i]) settledTicks += 1;
    if (T.paused[i] && T.moving[i]) pausedMovingMs += dt;
  }
  const playRates = T.rate.filter((_, i) => !T.paused[i]);
  return {
    unique: r.times.length,
    fps: +(r.times.length / (wallMs / 1000)).toFixed(1),
    p50: pct(gaps, 50), p95: pct(gaps, 95), p99: pct(gaps, 99),
    max: gaps.length ? +Math.max(...gaps).toFixed(1) : null,
    over50: over(50), over75: over(75), over100: over(100), over150: over(150), over250: over(250),
    plays: r.plays, pauses: r.pauses, cycles: r.cycles, movingPauses: r.movingPauses,
    settledPct: T.t.length ? Math.round((100 * settledTicks) / T.t.length) : null,
    pausedMovingMs: Math.round(pausedMovingMs),
    rateMedian: pct(playRates, 50), rateMean: mean(playRates),
    velMedian: pct(T.vel, 50),
    lagP50: pct(r.lagFrames, 50), lagP95: pct(r.lagFrames, 95),
    redraws: r.redraws, draws: r.draws,
    scrolled: r.scrolled,
    byReason: r.byReason,
    mediaEvents: r.mediaEvents.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {}),
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const dpr = (() => {
    const i = process.argv.indexOf("--dpr");
    return i > -1 ? Number(process.argv[i + 1]) : 1;
  })();
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : ["base", "A"];
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
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: VH },
      deviceScaleFactor: dpr,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${mode}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${mode}] ${c.text()}`); });
    // No scroll-behavior override here, deliberately: `smooth` applies to
    // programmatic scrolling, not to wheel input, and this bench exists to
    // exercise the path a real user takes.
    await page.goto(`${BASE}/${MODES[mode] ?? ""}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.mouse.move(960, 540);

    out[mode] = {};
    for (const pat of PATTERNS) {
      // Park inside scene 05 so no boundary or handover can contaminate it, at
      // the top of the range for downward patterns and the bottom for upward.
      const start = pat.up ? 660 : 515;
      await page.evaluate(
        ({ y }) => {
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo(0, y);
          document.documentElement.style.scrollBehavior = "";
        },
        { y: scrollFor(start) },
      );
      await page.waitForTimeout(1500);

      const base = await page.evaluate(snapshot);
      const t0 = Date.now();
      if (pat.burst) {
        for (let i = 0; i < pat.n; i++) {
          for (let j = 0; j < 3; j++) {
            await page.mouse.wheel(0, 100);
            await page.waitForTimeout(30);
          }
          await page.waitForTimeout(300);
        }
      } else {
        const [d, gap] = pat.step;
        for (let i = 0; i < pat.n; i++) {
          await page.mouse.wheel(0, d);
          if (gap > 0) await page.waitForTimeout(gap);
        }
      }
      const wall = Date.now() - t0;
      await page.waitForTimeout(1200);
      out[mode][pat.id] = analyse(await page.evaluate(collect, base), wall + 1200);
      await page.waitForTimeout(400);
    }
    console.log(`  ${mode} concluído`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, `wheel-dpr${dpr}.json`), JSON.stringify({ out, errors }, null, 2));

  for (const mode of wanted) {
    console.log(`\n### entrada real por roda/trackpad — modo ${mode}, DPR ${dpr}`);
    console.log("padrão                             únicos  fps   p50    p95    p99    máx    >75 >150 >250   pausas  near  ms pausado  %settled  taxa med  lag p95  px");
    console.log("-".repeat(166));
    for (const pat of PATTERNS) {
      const a = out[mode][pat.id];
      const near = (a.byReason["near-target"] ?? 0) + (a.byReason["scroll-settled"] ?? 0);
      console.log(
        `${pat.label.padEnd(35)}${String(a.unique).padStart(6)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.p99).padStart(7)}${String(a.max).padStart(7)}` +
          `${String(a.over75).padStart(6)}${String(a.over150).padStart(5)}${String(a.over250).padStart(5)}` +
          `${String(a.pauses).padStart(9)}${String(near).padStart(6)}${String(a.pausedMovingMs).padStart(12)}` +
          `${String(a.settledPct + "%").padStart(10)}${String(a.rateMedian).padStart(10)}${String(a.lagP95).padStart(9)}${String(a.scrolled).padStart(7)}`,
      );
    }
  }

  if (wanted.length > 1) {
    console.log(`\n### ${wanted[0]} vs ${wanted[1]}`);
    console.log("padrão                             únicos        p95          >150       pausas       lag p95");
    console.log("-".repeat(112));
    for (const pat of PATTERNS) {
      const a = out[wanted[0]][pat.id];
      const b = out[wanted[1]][pat.id];
      console.log(
        `${pat.label.padEnd(35)}${String(`${a.unique}→${b.unique}`).padStart(10)}` +
          `${String(`${a.p95}→${b.p95}`).padStart(14)}${String(`${a.over150}→${b.over150}`).padStart(12)}` +
          `${String(`${a.pauses}→${b.pauses}`).padStart(12)}${String(`${a.lagP95}→${b.lagP95}`).padStart(14)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
