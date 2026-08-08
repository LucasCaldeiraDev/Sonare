#!/usr/bin/env node
/**
 * Why fast scroll still jumps.
 *
 * Slow scroll is solved: 48 fps media doubled the visible cadence everywhere.
 * Fast scroll did not improve and in one gesture got worse â€” 70 unique frames
 * became 62, with a 231 ms hold. The suspicion this bench exists to settle is
 * decode saturation, and the arithmetic is stark:
 *
 *   a "fast" gesture moves ~233 global frames per second, i.e. 9,7x story speed
 *   RATE_MAX caps playbackRate at 3
 *   on 24 fps media that asks the decoder for  3 x 24 =  72 frames/s of 4K
 *   on 48 fps media it asks for                3 x 48 = 144 frames/s of 4K
 *
 * 144 fps of 3876x2136 is not something a decoder delivers. If that is what is
 * happening, dropped frames climb, `waiting` events appear, and the picture
 * holds â€” which is exactly the reported symptom, and it would also explain why
 * doubling the frame rate made this one gesture worse rather than better.
 *
 * The alternative explanation is the seek path: a fast gesture outruns
 * playback, the controller falls behind, and every recovery seek costs decode
 * time during which nothing new reaches the screen. Both are measured here:
 * dropped/decoded frames per gesture, and the true seek latency â€” from setting
 * currentTime to a frame at that position actually being presented, not to
 * `seeked`, which fires far earlier.
 *
 *   node fast-bench.mjs <baseUrl> [--modes 24fps,48fps]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/interp";

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

/** Story speed in x, for the header â€” global frames per second over 24. */
const GESTURES = [
  { id: "r2", label: "2x  dentro da cena", from: 510, to: 660, ms: 3100 },
  { id: "r4", label: "4x  dentro da cena", from: 505, to: 690, ms: 1900 },
  { id: "r10", label: "10x cruzando cenas", from: 20, to: 300, ms: 1200 },
  { id: "r20", label: "20x varredura total", from: 10, to: 690, ms: 1400 },
  { id: "r10up", label: "10x subindo", from: 300, to: 20, ms: 1200, up: true },
  { id: "parada", label: "rÃ¡pido e parada seca", from: 20, to: 300, ms: 1000 },
];

const MODES = { "24fps": "", "48fps": "?temporalMedia=48&mediaVariant=4k", "1440p": "?temporalMedia=48&mediaVariant=1440p" };

const DRIVE = async ({ y0, y1, ms, prime, hold }) => {
  window.scrollTo(0, prime ?? y0);
  await new Promise((r) => setTimeout(r, 1600));
  if (prime != null) {
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
    await new Promise((r) => setTimeout(r, 600));
  }

  const v = window.__cnVisible;
  const p = window.__cnPlayback;
  const k = window.__cnTick;
  const s = window.__cnSeek;
  const q0 = s.quality();
  const b = {
    n: v.newFrameAt.length, lag: v.lagFrames.length, draws: v.draws,
    plays: p.plays, pauses: p.pauses, tick: k.t.length, ev: k.events.length,
    started: s.started, superseded: s.superseded, redundant: s.redundant, lat: s.latency.length,
    seeks: v.syncSeeks(), switches: v.trackSwitches,
  };

  const longTasks = [];
  let po = null;
  try {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1));
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch { /* unsupported */ }

  // Scroll requests issued per screen frame, to see whether the controller is
  // being asked for more than one target per rAF.
  let requests = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      window.scrollTo(0, Math.round(y0 + ((y1 - y0) * Math.min(t, ms)) / ms));
      requests += 1;
      if (t < ms) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  const endAt = performance.now();
  await new Promise((r) => setTimeout(r, hold));
  if (po) po.disconnect();

  const q1 = s.quality();
  const dropped = q1.reduce((a, x, i) => a + (x.dropped - (q0[i]?.dropped ?? 0)), 0);
  const decoded = q1.reduce((a, x, i) => a + (x.total - (q0[i]?.total ?? 0)), 0);
  const n = k.t.length;

  return {
    t0,
    gestureMs: +(endAt - t0).toFixed(1),
    totalMs: +(performance.now() - t0).toFixed(1),
    requests,
    times: v.newFrameAt.slice(b.n),
    lag: v.lagFrames.slice(b.lag),
    draws: v.draws - b.draws,
    plays: p.plays - b.plays,
    pauses: p.pauses - b.pauses,
    seeks: v.syncSeeks() - b.seeks,
    switches: v.trackSwitches - b.switches,
    started: s.started - b.started,
    superseded: s.superseded - b.superseded,
    redundant: s.redundant - b.redundant,
    latency: s.latency.slice(b.lat),
    mediaEvents: k.events.slice(b.ev),
    rate: k.rate.slice(b.tick, n),
    paused: k.paused.slice(b.tick, n),
    tickT: k.t.slice(b.tick, n),
    dropped,
    decoded,
    longTasks,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

function analyse(r) {
  const holds = [];
  const inG = r.times.filter((t) => t - r.t0 <= r.gestureMs);
  for (let i = 1; i < inG.length; i++) holds.push(inG[i] - inG[i - 1]);
  const over = (n) => holds.filter((h) => h > n).length;
  // Decode demand actually commanded: rate x media fps, integrated over time.
  let demand = 0;
  let secs = 0;
  for (let i = 1; i < r.tickT.length; i++) {
    const dt = (r.tickT[i] - r.tickT[i - 1]) / 1000;
    if (dt <= 0 || dt > 0.2 || r.paused[i]) continue;
    demand += r.rate[i] * dt;
    secs += dt;
  }
  const ev = r.mediaEvents.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
  return {
    unique: inG.length,
    fps: +(inG.length / (r.gestureMs / 1000)).toFixed(1),
    p50: pct(holds, 50), p95: pct(holds, 95), p99: pct(holds, 99),
    max: holds.length ? +Math.max(...holds).toFixed(0) : null,
    over75: over(75), over100: over(100), over150: over(150), over250: over(250),
    lagP50: pct(r.lag, 50), lagP95: pct(r.lag, 95),
    lagMax: r.lag.length ? +Math.max(...r.lag.map(Math.abs)).toFixed(1) : null,
    seeks: r.seeks, started: r.started, superseded: r.superseded, redundant: r.redundant,
    seekLatP50: pct(r.latency, 50), seekLatP95: pct(r.latency, 95),
    seekResolved: r.latency.length,
    switches: r.switches,
    dropped: r.dropped, decoded: r.decoded,
    dropPct: r.decoded ? +((100 * r.dropped) / r.decoded).toFixed(1) : null,
    meanRate: secs ? +(demand / secs).toFixed(2) : null,
    requests: r.requests,
    longTasks: r.longTasks.length,
    heapMB: r.heapMB,
    waiting: ev.waiting ?? 0,
    stalled: ev.stalled ?? 0,
    ev,
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : ["24fps", "48fps"];
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
    await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(2000);

    out[mode] = {};
    for (const g of GESTURES) {
      out[mode][g.id] = analyse(
        await page.evaluate(DRIVE, {
          y0: scrollFor(g.from), y1: scrollFor(g.to), ms: g.ms,
          prime: g.up ? scrollFor(g.from + 25) : null,
          hold: 2000,
        }),
      );
      await page.waitForTimeout(600);
    }
    console.log(`  ${mode} concluÃ­do`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "fast.json"), JSON.stringify({ out, errors }, null, 2));

  for (const g of GESTURES) {
    const x = (Math.abs(g.to - g.from) / (g.ms / 1000) / 24).toFixed(1);
    console.log(`\n### ${g.label}   (${x}x da velocidade da histÃ³ria)`);
    console.log("modo    Ãºnicos  fps   p50    p95    mÃ¡x   >100 >250   taxa mÃ©d  descartados/decod   seeks ini/supersed/redund  latÃªncia seek p50/p95  espera  LT  lag p95/mÃ¡x");
    console.log("-".repeat(178));
    for (const m of wanted) {
      const a = out[m][g.id];
      console.log(
        `${m.padEnd(8)}${String(a.unique).padStart(5)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.max).padStart(7)}` +
          `${String(a.over100).padStart(5)}${String(a.over250).padStart(5)}` +
          `${String(a.meanRate).padStart(11)}` +
          `${String(`${a.dropped}/${a.decoded} (${a.dropPct}%)`).padStart(20)}` +
          `${String(`${a.started}/${a.superseded}/${a.redundant}`).padStart(27)}` +
          `${String(`${a.seekLatP50}/${a.seekLatP95}`).padStart(23)}` +
          `${String(a.waiting + a.stalled).padStart(8)}${String(a.longTasks).padStart(4)}` +
          `${String(`${a.lagP95}/${a.lagMax}`).padStart(13)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

