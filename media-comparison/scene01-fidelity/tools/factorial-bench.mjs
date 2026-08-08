#!/usr/bin/env node
/**
 * The 2x2 that was missing.
 *
 * Two suspects were only ever tested one at a time, and neither test is
 * conclusive alone: `?fixedRate=1` pins the rate but leaves the play/pause
 * logic, and `?continuousWhileMoving=1` removes the pauses but leaves the
 * proportional rate and RATE_MIN. An element can sit in state "playing" at
 * 0,08x and present 1,9 frames per second, so "not paused" proves nothing.
 *
 *   base   pause near-target ON    rate variable
 *   A      pause OFF while moving  rate variable
 *   B      pause ON                rate pinned to 1
 *   C      pause OFF while moving  rate pinned to 1     <- the decisive control
 *
 * Run inside scene 05, the longest, so no boundary, no direction change, no
 * handover and no track switch can contaminate the measurement; standby arming
 * is off in every mode so it stays constant across the factorial.
 *
 * Cadence is read from __cnVisible (unique drawn (track, media frame) pairs),
 * decisions from __cnPlayback, and the per-tick state — including the RATE
 * inside each gap — from __cnTick.
 *
 *   node factorial-bench.mjs <baseUrl> [--full] [--modes base,A,B,C]
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

/**
 * Scene 05 spans global frames 505..697. Every gesture below stays inside it.
 * The upward ones carry a `prime` phase so the direction flip, the track switch
 * and the handover all happen BEFORE the measured window opens.
 */
const CORE = [
  { id: "s05-desce-1x", label: "cena 05 desce ~1x", kf: [[0, 515], [6200, 664]] },
  { id: "s05-sobe-1x", label: "cena 05 sobe ~1x", prime: [[0, 690], [800, 672]], kf: [[0, 672], [6200, 523]] },
  { id: "s05-lento", label: "cena 05 lento 0,5x", kf: [[0, 530], [6200, 604]] },
  { id: "s05-rapido", label: "cena 05 rápido 2x", kf: [[0, 510], [3100, 660]] },
];
/** The full matrix, run only once a candidate policy exists. */
const FULL = [
  ...CORE,
  { id: "desce-lento", label: "desce lento", kf: [[0, 10], [6000, 70]] },
  { id: "desce-1x", label: "desce ~1x", kf: [[0, 20], [5000, 140]] },
  { id: "desce-rapido", label: "desce rápido", kf: [[0, 20], [1200, 300]] },
  { id: "sobe-lento", label: "sobe lento", prime: [[0, 80], [800, 70]], kf: [[0, 70], [6000, 10]] },
  { id: "sobe-1x", label: "sobe ~1x", prime: [[0, 155], [800, 140]], kf: [[0, 140], [5000, 20]] },
  { id: "sobe-rapido", label: "sobe rápido", prime: [[0, 315], [800, 300]], kf: [[0, 300], [1200, 20]] },
  { id: "para-retoma", label: "para e retoma", kf: [[0, 20], [1500, 90], [3000, 90], [4500, 160]] },
  { id: "alterna", label: "alternância down/up", kf: [[0, 40], [1200, 140], [2400, 40]] },
  { id: "zigzag", label: "zigzag", kf: [[0, 60], [900, 160], [1800, 60], [2700, 160]] },
  { id: "reversao-cena", label: "reversão na cena", kf: [[0, 60], [1600, 140], [3200, 60]] },
  { id: "reversao-fronteira", label: "reversão na fronteira", kf: [[0, 150], [1200, 182], [2400, 150]] },
  { id: "f-01-02", label: "fronteira 01↔02", kf: [[0, 140], [1200, 200], [2400, 140]] },
  { id: "f-02-03", label: "fronteira 02↔03", kf: [[0, 240], [1200, 300], [2400, 240]] },
  { id: "f-03-04", label: "fronteira 03↔04", kf: [[0, 360], [1200, 420], [2400, 360]] },
  { id: "f-04-05", label: "fronteira 04↔05", kf: [[0, 480], [1200, 540], [2400, 480]] },
];
const HOLD = 1500;

/**
 * standby=off in every cell, so the only things varying across the factorial
 * are the two factors under test.
 */
const MODES = {
  base: "?standby=off",
  A: "?standby=off&continuousWhileMoving=1",
  B: "?standby=off&fixedRate=1",
  C: "?standby=off&continuousWhileMoving=1&fixedRate=1",
  // Full architecture, for the confirmation pass after the controlled one.
  baseFull: "",
  // Same v1 controller, 48 fps motion-interpolated media. The rate the scroll
  // commands is unchanged; only the number of distinct pictures per second of
  // wall clock doubles.
  "48fps": "?temporalMedia=48",
};

const DRIVE = async ({ prime, kf, hold }) => {
  const lerp = (list) => (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const [t0, y0] = list[i - 1];
        const [t1, y1] = list[i];
        return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
      }
    }
    return list[list.length - 1][1];
  };
  const drive = (list, ms) =>
    new Promise((resolve) => {
      const at = lerp(list);
      const start = performance.now();
      const loop = (ts) => {
        const t = ts - start;
        window.scrollTo(0, Math.round(at(Math.min(t, list[list.length - 1][0]))));
        if (t < ms) requestAnimationFrame(loop);
        else resolve();
      };
      requestAnimationFrame(loop);
    });

  window.scrollTo(0, (prime ?? kf)[0][1]);
  await new Promise((r) => setTimeout(r, 1400));
  // The priming move flips direction and completes the handover before the
  // measured window opens, so an upward gesture is judged on its steady state
  // and not on the switch it had to make to get there.
  if (prime) await drive(prime, prime[prime.length - 1][0]);

  const v = window.__cnVisible;
  const p = window.__cnPlayback;
  const k = window.__cnTick;
  const h = window.__cnHandover;
  const b = {
    n: v.newFrameAt.length,
    draws: v.draws,
    redraws: v.redraws,
    switches: v.trackSwitches,
    rate: v.rateChanges(),
    seeks: v.syncSeeks(),
    lag: v.lagFrames.length,
    ev: p.events.length,
    plays: p.plays,
    pauses: p.pauses,
    cycles: p.cycles,
    moving: p.pausedWhileMoving,
    byReason: { ...p.byReason },
    tick: k.t.length,
    kev: k.events.length,
    waits: h.waits,
    forced: h.forced,
  };

  const t0 = performance.now();
  const end = kf[kf.length - 1][0];
  const longTasks = [];
  let po = null;
  try {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1));
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch { /* unsupported */ }

  await drive(kf, end);
  const gestureEnd = performance.now();
  await new Promise((r) => setTimeout(r, hold));
  if (po) po.disconnect();

  const slice = (a, from) => a.slice(from);
  const byReason = {};
  for (const key of Object.keys(p.byReason)) byReason[key] = p.byReason[key] - (b.byReason[key] ?? 0);

  const vids = Array.from(document.querySelectorAll("section video"));
  const q = vids.map((el, i) => {
    const g = el.getVideoPlaybackQuality ? el.getVideoPlaybackQuality() : null;
    return {
      i,
      paused: el.paused,
      rs: el.readyState,
      net: el.networkState,
      dropped: g ? g.droppedVideoFrames : null,
      total: g ? g.totalVideoFrames : null,
    };
  });

  return {
    t0,
    gestureEndMs: +(gestureEnd - t0).toFixed(1),
    durationMs: end + hold,
    times: slice(v.newFrameAt, b.n),
    lagFrames: slice(v.lagFrames, b.lag),
    events: slice(p.events, b.ev),
    mediaEvents: slice(k.events, b.kev),
    tick: {
      t: slice(k.t, b.tick),
      rate: slice(k.rate, b.tick),
      paused: slice(k.paused, b.tick),
      delta: slice(k.delta, b.tick),
      vel: slice(k.vel, b.tick),
      raw: slice(k.raw, b.tick),
      moving: slice(k.moving, b.tick),
      active: slice(k.active, b.tick),
      paint: slice(k.paint, b.tick),
      seek: slice(k.seek, b.tick),
      hand: slice(k.hand, b.tick),
      rs: slice(k.rs, b.tick),
      ended: slice(k.ended, b.tick),
    },
    longTasks,
    quality: q,
    stillPlaying: vids.filter((el) => !el.paused).length,
    draws: v.draws - b.draws,
    redraws: v.redraws - b.redraws,
    switches: v.trackSwitches - b.switches,
    rateChanges: v.rateChanges() - b.rate,
    seeks: v.syncSeeks() - b.seeks,
    plays: p.plays - b.plays,
    pauses: p.pauses - b.pauses,
    cycles: p.cycles - b.cycles,
    pausedWhileMoving: p.pausedWhileMoving - b.moving,
    byReason,
    waits: h.waits - b.waits,
    forced: h.forced - b.forced,
  };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};
const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null);

const BANDS = [
  ["0–0,10", 0, 0.1],
  ["0,10–0,25", 0.1, 0.25],
  ["0,25–0,50", 0.25, 0.5],
  ["0,50–0,90", 0.5, 0.9],
  ["0,90–1,10", 0.9, 1.1],
  ["1,10–2", 1.1, 2],
  ["2–3", 2, 3.001],
];

function analyse(r) {
  const T = r.tick;
  const rel = (t) => +(t - r.t0).toFixed(1);

  // Time in each rate band, counting only ticks where the element was PLAYING;
  // paused time is reported separately so the two are never conflated.
  const bandMs = BANDS.map(() => 0);
  let pausedMovingMs = 0;
  let playingMs = 0;
  for (let i = 1; i < T.t.length; i++) {
    const dt = T.t[i] - T.t[i - 1];
    if (dt <= 0 || dt > 200) continue;
    if (T.paused[i]) {
      if (T.moving[i]) pausedMovingMs += dt;
      continue;
    }
    playingMs += dt;
    const rate = T.rate[i];
    for (let b = 0; b < BANDS.length; b++) {
      if (rate >= BANDS[b][1] && rate < BANDS[b][2]) {
        bandMs[b] += dt;
        break;
      }
    }
  }
  const playingRates = T.rate.filter((_, i) => !T.paused[i]);

  const gaps = [];
  for (let i = 1; i < r.times.length; i++) {
    gaps.push({ a: r.times[i - 1], b: r.times[i], ms: r.times[i] - r.times[i - 1] });
  }
  const over = (n) => gaps.filter((g) => g.ms > n).length;

  // Per-gap correlation with the RATE, which is the point of this pass.
  const detail = [];
  let bigPaused = 0;
  let bigSlow = 0;
  let bigNominal = 0;
  for (const g of gaps.filter((x) => x.ms > 75)) {
    const idx = [];
    for (let i = 0; i < T.t.length; i++) if (T.t[i] >= g.a && T.t[i] <= g.b) idx.push(i);
    const rates = idx.filter((i) => !T.paused[i]).map((i) => T.rate[i]);
    const pausedFrac = idx.length ? idx.filter((i) => T.paused[i]).length / idx.length : 0;
    const cmdBefore = r.events.filter((e) => e.t <= g.a).pop() ?? null;
    const inside = r.events.filter((e) => e.t > g.a && e.t < g.b);
    const row = {
      start: rel(g.a),
      ms: +g.ms.toFixed(1),
      rate0: idx.length ? T.rate[idx[0]] : null,
      rateMin: rates.length ? +Math.min(...rates).toFixed(3) : null,
      rateMean: mean(rates),
      pausedFrac: +pausedFrac.toFixed(2),
      vel: idx.length ? T.vel[idx[0]] : null,
      raw: idx.length ? T.raw[idx[0]] : null,
      delta: idx.length ? T.delta[idx[0]] : null,
      moving: idx.length ? !!T.moving[idx[0]] : null,
      seek: idx.some((i) => T.seek[i]),
      hand: idx.some((i) => T.hand[i] > 0),
      track: idx.length ? T.paint[idx[0]] : null,
      cmd: cmdBefore ? `${cmdBefore.cmd}:${cmdBefore.reason}` : "—",
      inside: inside.map((e) => `${e.cmd}:${e.reason}`).join(" ") || "—",
    };
    detail.push(row);
    if (g.ms > 150) {
      if (row.pausedFrac >= 0.5) bigPaused += 1;
      else if (row.rateMean != null && row.rateMean < 0.25) bigSlow += 1;
      else if (row.rateMean != null && row.rateMean >= 0.9 && row.rateMean <= 1.1) bigNominal += 1;
    }
  }

  // Stabilisation: from the moment the scroll stopped to the last new frame.
  const afterEnd = r.times.filter((t) => t - r.t0 > r.gestureEndMs);
  const settleMs = afterEnd.length ? +(afterEnd[afterEnd.length - 1] - r.t0 - r.gestureEndMs).toFixed(0) : 0;

  const evTypes = {};
  for (const e of r.mediaEvents) evTypes[e.type] = (evTypes[e.type] ?? 0) + 1;

  return {
    unique: r.times.length,
    fps: +(r.times.length / (r.durationMs / 1000)).toFixed(1),
    p50: pct(gaps.map((g) => g.ms), 50),
    p95: pct(gaps.map((g) => g.ms), 95),
    p99: pct(gaps.map((g) => g.ms), 99),
    max: gaps.length ? +Math.max(...gaps.map((g) => g.ms)).toFixed(1) : null,
    over50: over(50), over75: over(75), over100: over(100), over150: over(150),
    plays: r.plays, pauses: r.pauses, cycles: r.cycles,
    nearTarget: (r.byReason["near-target"] ?? 0) + (r.byReason.overshoot ?? 0),
    pausedWhileMoving: r.pausedWhileMoving,
    pausedMovingMs: Math.round(pausedMovingMs),
    playingMs: Math.round(playingMs),
    rateMin: playingRates.length ? +Math.min(...playingRates).toFixed(3) : null,
    rateMean: mean(playingRates),
    rateMedian: pct(playingRates, 50),
    rateMax: playingRates.length ? +Math.max(...playingRates).toFixed(3) : null,
    bands: BANDS.map((b, i) => [b[0], Math.round(bandMs[i])]),
    seeks: r.seeks, switches: r.switches, waits: r.waits, forced: r.forced,
    rateChanges: r.rateChanges, redraws: r.redraws, draws: r.draws,
    lagP50: pct(r.lagFrames, 50), lagP95: pct(r.lagFrames, 95), lagP99: pct(r.lagFrames, 99),
    settleMs,
    stillPlaying: r.stillPlaying,
    longTasks: r.longTasks.length,
    mediaEvents: evTypes,
    dropped: r.quality.reduce((s, q) => s + (q.dropped ?? 0), 0),
    bigPaused, bigSlow, bigNominal,
    byReason: r.byReason,
    detail,
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : ["base", "A", "B", "C"];
  })();
  const GESTURES = process.argv.includes("--full") ? FULL : CORE;

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
  const bad = [];
  for (const mode of wanted) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${mode}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${mode}] ${c.text()}`); });
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`[${mode}] ${r.status()} ${r.url().replace(BASE, "")}`); });
    await page.goto(`${BASE}/${MODES[mode] ?? ""}`, { waitUntil: "load", timeout: 90000 });
    // The site sets `scroll-behavior: smooth` for its anchor links. Under that,
    // each window.scrollTo starts an animation and calling it once per frame
    // restarts it before it finishes, so the page crawls at about 200 px/s no
    // matter what is commanded. Measured: a gesture asking for 1,0x moved the
    // page at 0,19x. Without this override the bench measures its own driver.
    await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    out[mode] = {};
    for (const g of GESTURES) {
      out[mode][g.id] = analyse(
        await page.evaluate(DRIVE, {
          prime: g.prime ? g.prime.map(([t, f]) => [t, scrollFor(f)]) : null,
          kf: g.kf.map(([t, f]) => [t, scrollFor(f)]),
          hold: HOLD,
        }),
      );
      await page.waitForTimeout(500);
    }
    console.log(`  ${mode} concluído`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT, "factorial.json"), JSON.stringify({ out, errors, bad }, null, 2));

  const cell = (a) => a;
  for (const g of GESTURES) {
    console.log(`\n### ${g.label}   (fonte 24 fps ⇒ 41,7 ms entre frames a 1x)`);
    console.log("modo   únicos  fps    p50    p95    p99    máx   >50 >75 >100 >150   play pause near  ciclos  ms pausado/mov   seeks trocas hand  lag p50/p95/p99  estab");
    console.log("-".repeat(168));
    for (const mode of wanted) {
      const a = cell(out[mode][g.id]);
      console.log(
        `${mode.padEnd(7)}${String(a.unique).padStart(5)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.p99).padStart(7)}${String(a.max).padStart(7)}` +
          `${String(a.over50).padStart(5)}${String(a.over75).padStart(4)}${String(a.over100).padStart(5)}${String(a.over150).padStart(5)}` +
          `${String(a.plays).padStart(7)}${String(a.pauses).padStart(6)}${String(a.nearTarget).padStart(5)}${String(a.cycles).padStart(8)}` +
          `${String(a.pausedMovingMs).padStart(17)}${String(a.seeks).padStart(8)}${String(a.switches).padStart(7)}${String(a.waits + a.forced).padStart(5)}` +
          `${String(`${a.lagP50}/${a.lagP95}/${a.lagP99}`).padStart(18)}${String(a.settleMs).padStart(7)}`,
      );
    }
    console.log("       taxa (só enquanto tocando)  mín/mediana/média/máx      tempo por faixa, ms");
    for (const mode of wanted) {
      const a = cell(out[mode][g.id]);
      const bands = a.bands.filter(([, ms]) => ms > 0).map(([n, ms]) => `${n}:${ms}`).join("  ");
      console.log(
        `${mode.padEnd(7)}${String(`${a.rateMin}/${a.rateMedian}/${a.rateMean}/${a.rateMax}`).padStart(34)}      ${bands || "—"}`,
      );
    }
  }

  console.log("\n### gaps >150 ms por estado do elemento");
  console.log("gesto                   modo   >150   pausado   tocando <0,25x   tocando 0,90–1,10x   descartados   eventos de mídia");
  console.log("-".repeat(140));
  for (const g of GESTURES) {
    for (const mode of wanted) {
      const a = out[mode][g.id];
      const ev = Object.entries(a.mediaEvents).map(([k, n]) => `${k}=${n}`).join(" ") || "nenhum";
      console.log(
        `${g.label.padEnd(24)}${mode.padEnd(7)}${String(a.over150).padStart(5)}${String(a.bigPaused).padStart(10)}` +
          `${String(a.bigSlow).padStart(17)}${String(a.bigNominal).padStart(21)}${String(a.dropped).padStart(14)}   ${ev}`,
      );
    }
  }

  const focus = process.argv.includes("--full") ? "desce-1x" : "s05-desce-1x";
  for (const mode of wanted) {
    const a = out[mode]?.[focus];
    if (!a || !a.detail.length) continue;
    console.log(`\n### ${focus} / ${mode} — gaps >75 ms, gap a gap`);
    console.log("t(ms)   dur    rate0  rateMin rateMédia  %pausado  vel   delta    último comando        dentro");
    console.log("-".repeat(132));
    for (const d of a.detail.slice(0, 26)) {
      console.log(
        `${String(d.start).padStart(6)}${String(d.ms).padStart(8)}${String(d.rate0).padStart(8)}` +
          `${String(d.rateMin).padStart(8)}${String(d.rateMean).padStart(10)}${String(d.pausedFrac).padStart(10)}` +
          `${String(d.vel).padStart(7)}${String(d.delta).padStart(9)}   ${String(d.cmd).padEnd(22)}${d.inside}`,
      );
    }
  }

  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
  console.log(bad.length ? `4xx:\n  ${bad.join("\n  ")}` : "zero respostas 4xx");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
