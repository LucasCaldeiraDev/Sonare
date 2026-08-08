#!/usr/bin/env node
/**
 * Why does the feed-forward read 0,18 during a 1,0x gesture?
 *
 * The factorial showed the controller commanding playbackRate 0,25 while the
 * scroll advanced the story at exactly 24 global frames per second. rate is
 * targetVelocity + delta/RATE_TAU, and the trace pins targetVelocity at ~0,18 —
 * five and a half times too small. At 0,5x the same variable reads ~0,55, which
 * is right, so the error is not a constant factor.
 *
 * This probe reads the raw per-tick series behind that number:
 *   raw   the instantaneous estimate, in global frames per second;
 *   vel   the smoothed value the rate actually uses;
 *   dt    the tick interval;
 * plus how many ticks saw NO change in the target at all, which is the thing an
 * exponential average cannot recover from.
 *
 *   node velocity-probe.mjs <baseUrl>
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

/** Same scene-05 window, at four different story speeds. */
const GESTURES = [
  { id: "0,25x", from: 515, to: 552, ms: 6200 },
  { id: "0,5x", from: 515, to: 589, ms: 6200 },
  { id: "1,0x", from: 515, to: 664, ms: 6200 },
  { id: "2,0x", from: 510, to: 660, ms: 3100 },
];

const PROBE = async ({ y0, y1, ms }) => {
  window.scrollTo(0, y0);
  await new Promise((r) => setTimeout(r, 1400));

  const k = window.__cnTick;
  const base = k.t.length;
  // The scroll positions this loop actually commanded, so the true story speed
  // can be recomputed from the page rather than assumed from the keyframes.
  const commanded = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      const y = Math.round(y0 + ((y1 - y0) * Math.min(t, ms)) / ms);
      window.scrollTo(0, y);
      // Commanded AND achieved. If the page refuses to go where it was told —
      // a pinned section, a clamp at the end of the document — then the
      // controller's low velocity estimate is correct and the bench is wrong.
      commanded.push([+t.toFixed(1), y, Math.round(window.scrollY)]);
      if (t < ms) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });

  const n = k.t.length;
  return {
    t: k.t.slice(base, n),
    raw: k.raw.slice(base, n),
    vel: k.vel.slice(base, n),
    rate: k.rate.slice(base, n),
    paused: k.paused.slice(base, n),
    moving: k.moving.slice(base, n),
    delta: k.delta.slice(base, n),
    commanded,
    scrollHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
  };
};

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(3);
};
const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null);

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
  const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?standby=off`, { waitUntil: "load", timeout: 90000 });
  // The site sets `scroll-behavior: smooth` for its anchor links. Under that,
  // every window.scrollTo starts an animation, and calling it once per frame
  // restarts the animation before it can finish — the page then crawls at a
  // ceiling of roughly 200 px/s no matter what is commanded. Without this
  // override the bench measures its own driver, not the product.
  await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
  await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  const res = {};
  for (const g of GESTURES) {
    res[g.id] = {
      expected: +(((g.to - g.from) / (g.ms / 1000)) / 24).toFixed(3),
      ...(await page.evaluate(PROBE, { y0: scrollFor(g.from), y1: scrollFor(g.to), ms: g.ms })),
    };
    console.log(`  ${g.id} medido`);
    await page.waitForTimeout(500);
  }
  await browser.close();
  writeFileSync(join(OUT, "velocity.json"), JSON.stringify({ res, errors }, null, 2));

  console.log("\n### estimativa de velocidade por tick, dentro da cena 05");
  console.log("gesto   esperado  ticks  dt p50   raw=0   raw p50  raw p95  raw média  vel p50  vel média  rate p50  ticks moving");
  console.log("-".repeat(126));
  for (const g of GESTURES) {
    const r = res[g.id];
    const dts = [];
    for (let i = 1; i < r.t.length; i++) dts.push(+(r.t[i] - r.t[i - 1]).toFixed(2));
    // raw is in global frames per second; the controller's unit is footage
    // seconds per wall second, so divide by 24 to compare with `expected`.
    const rawX = r.raw.map((v) => +(Math.abs(v) / 24).toFixed(3));
    const zeros = r.raw.filter((v) => Math.abs(v) < 0.001).length;
    console.log(
      `${g.id.padEnd(9)}${String(r.expected).padStart(7)}${String(r.t.length).padStart(7)}` +
        `${String(pct(dts, 50)).padStart(8)}${String(`${zeros} (${Math.round((100 * zeros) / r.t.length)}%)`).padStart(11)}` +
        `${String(pct(rawX, 50)).padStart(9)}${String(pct(rawX, 95)).padStart(9)}${String(mean(rawX)).padStart(11)}` +
        `${String(pct(r.vel, 50)).padStart(9)}${String(mean(r.vel)).padStart(11)}` +
        `${String(pct(r.rate, 50)).padStart(10)}${String(r.moving.filter(Boolean).length).padStart(14)}`,
    );
  }

  console.log("\n### os 40 primeiros ticks do gesto de 1,0x");
  console.log("  #   t(ms)   dt     raw(frames/s)   raw(x)   vel     rate   pausado  delta");
  const r = res["1,0x"];
  for (let i = 1; i < Math.min(41, r.t.length); i++) {
    console.log(
      `${String(i).padStart(3)}${String(+(r.t[i] - r.t[0]).toFixed(1)).padStart(8)}` +
        `${String(+(r.t[i] - r.t[i - 1]).toFixed(1)).padStart(7)}` +
        `${String(r.raw[i]).padStart(14)}${String(+(Math.abs(r.raw[i]) / 24).toFixed(3)).padStart(9)}` +
        `${String(r.vel[i]).padStart(8)}${String(r.rate[i]).padStart(8)}${String(r.paused[i]).padStart(8)}` +
        `${String(r.delta[i]).padStart(9)}`,
    );
  }

  // What the page actually scrolled, independent of what the controller thought.
  console.log("\n### comandado ao window.scrollTo  vs  window.scrollY alcançado");
  const runway = Math.round((GLOBAL_DURATION + SETTLE) * (SCROLL_VH_PER_SECOND / 100) * VH);
  const toX = (px, secs) =>
    ((px / runway) * ((GLOBAL_DURATION + SETTLE) / GLOBAL_DURATION) * (GLOBAL_FRAMES - 1)) / secs / 24;
  for (const g of GESTURES) {
    const c = res[g.id].commanded;
    const secs = c[c.length - 1][0] / 1000;
    const cmdPx = c[c.length - 1][1] - c[0][1];
    const gotPx = c[c.length - 1][2] - c[0][2];
    console.log(
      `  ${g.id.padEnd(7)} comandado ${String(cmdPx).padStart(5)} px ⇒ ${toX(cmdPx, secs).toFixed(3)}x` +
        `   |  alcançado ${String(gotPx).padStart(5)} px ⇒ ${toX(gotPx, secs).toFixed(3)}x` +
        `   |  o controlador leu ${mean(res[g.id].vel)}x`,
    );
  }
  console.log(`\n  runway do pin: ${runway} px   altura do documento: ${res["1,0x"].scrollHeight} px`);
  console.log(errors.length ? `\nERROS: ${errors.join(" | ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
