#!/usr/bin/env node
/**
 * Does the controller stop the picture on purpose?
 *
 * The cadence bench established that the visible frame rate has a recurring
 * ~250 ms hole and that media, GOP, standby seeks and playbackRate modulation
 * do not explain it. What none of those A/Bs touched is the controller's own
 * play()/pause() decisions: `?fixedRate=1` pins the rate but leaves the
 * stop/start logic exactly as it was.
 *
 * So this bench reads two streams and lines them up:
 *   __cnVisible.newFrameAt   when a genuinely new frame reached the canvas;
 *   __cnPlayback.events      every play/pause the controller commanded, with
 *                            its reason, taken at the decision site rather than
 *                            from the native events.
 *
 * For every gap above 75 ms it reports the command that preceded it and the
 * commands inside it. If the long gaps sit on top of pauses taken while the
 * gesture was still running, the cause is the controller, not the pipeline.
 *
 *   node pause-bench.mjs <baseUrl> [--modes base,continuous] [--full]
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

/** The reproducible 6,2 s gesture first, then the full matrix under --full. */
const CORE = [
  { id: "desce-1x", label: "desce ~1x", kf: [[0, 20], [5000, 140]] },
  { id: "sobe-1x", label: "sobe ~1x", kf: [[0, 140], [5000, 20]] },
  { id: "reversao-cena", label: "reversão na cena", kf: [[0, 60], [1600, 140], [3200, 60]] },
];
const FULL = [
  { id: "desce-lento", label: "desce lento", kf: [[0, 10], [6000, 70]] },
  { id: "desce-1x", label: "desce ~1x", kf: [[0, 20], [5000, 140]] },
  { id: "desce-rapido", label: "desce rápido", kf: [[0, 20], [1200, 300]] },
  { id: "sobe-lento", label: "sobe lento", kf: [[0, 70], [6000, 10]] },
  { id: "sobe-1x", label: "sobe ~1x", kf: [[0, 140], [5000, 20]] },
  { id: "sobe-rapido", label: "sobe rápido", kf: [[0, 300], [1200, 20]] },
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
const HOLD = 1200;

const MODES = {
  base: "",
  continuous: "?continuousWhileMoving=1",
  native: "?surface=native",
  nativeCont: "?surface=native&continuousWhileMoving=1",
  dpr1: "?dpr=1",
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
  const p = window.__cnPlayback;
  const b = {
    n: v.newFrameAt.length,
    draws: v.draws,
    redraws: v.redraws,
    switches: v.trackSwitches,
    rate: v.rateChanges(),
    seeks: v.syncSeeks(),
    drawMs: v.drawMs.length,
    lag: v.lagFrames.length,
    ev: p.events.length,
    plays: p.plays,
    pauses: p.pauses,
    cycles: p.cycles,
    moving: p.pausedWhileMoving,
    spans: p.pauseSpans.length,
    byReason: { ...p.byReason },
  };

  const t0 = performance.now();
  const end = kf[kf.length - 1][0];
  const duration = end + hold;
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
      window.scrollTo(0, Math.round(at(Math.min(t, end))));
      if (t < duration) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  if (po) po.disconnect();

  // Did anything keep playing after the gesture really stopped? Read at the very
  // end of the hold, which is well past SETTLE_MS.
  const stillPlaying = Array.from(document.querySelectorAll("section video")).filter(
    (el) => !el.paused,
  ).length;

  const byReason = {};
  for (const k of Object.keys(p.byReason)) byReason[k] = p.byReason[k] - (b.byReason[k] ?? 0);

  return {
    durationMs: duration,
    gestureEndMs: end,
    times: v.newFrameAt.slice(b.n),
    drawMs: v.drawMs.slice(b.drawMs),
    lagFrames: v.lagFrames.slice(b.lag),
    events: p.events.slice(b.ev),
    longTasks,
    t0,
    stillPlaying,
    draws: v.draws - b.draws,
    redraws: v.redraws - b.redraws,
    switches: v.trackSwitches - b.switches,
    rateChanges: v.rateChanges() - b.rate,
    seeks: v.syncSeeks() - b.seeks,
    plays: p.plays - b.plays,
    pauses: p.pauses - b.pauses,
    cycles: p.cycles - b.cycles,
    pausedWhileMoving: p.pausedWhileMoving - b.moving,
    pauseSpans: p.pauseSpans.slice(b.spans),
    byReason,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

function analyse(r) {
  const gaps = [];
  for (let i = 1; i < r.times.length; i++) {
    gaps.push({ start: r.times[i - 1], end: r.times[i], ms: r.times[i] - r.times[i - 1] });
  }
  const over = (n) => gaps.filter((g) => g.ms > n).length;

  // Correlation. A gap is "explained by a pause" when the controller was in a
  // commanded pause for part of it: either the last command before the gap was
  // a pause, or a pause was issued inside it.
  const detail = [];
  let pauseLinked = 0;
  let nearTargetLinked = 0;
  for (const g of gaps.filter((x) => x.ms > 75)) {
    const before = r.events.filter((e) => e.t <= g.start).pop() ?? null;
    const inside = r.events.filter((e) => e.t > g.start && e.t < g.end);
    const pauses = [
      ...(before && before.cmd === "pause" ? [before] : []),
      ...inside.filter((e) => e.cmd === "pause"),
    ];
    const near = pauses.filter((e) => e.reason === "near-target" || e.reason === "overshoot");
    if (pauses.length) pauseLinked += 1;
    if (near.length) nearTargetLinked += 1;
    detail.push({
      start: +(g.start - r.t0).toFixed(0),
      ms: +g.ms.toFixed(1),
      before: before ? `${before.cmd}:${before.reason}` : "—",
      inside: inside.map((e) => `${e.cmd}:${e.reason}`).join(" ") || "—",
      seek: inside.some((e) => e.seeking) || (before?.seeking ?? false),
      track: before ? before.track : null,
    });
  }
  const big = gaps.filter((x) => x.ms > 150);
  let bigNear = 0;
  for (const g of big) {
    const before = r.events.filter((e) => e.t <= g.start).pop() ?? null;
    const inside = r.events.filter((e) => e.t > g.start && e.t < g.end);
    const pauses = [
      ...(before && before.cmd === "pause" ? [before] : []),
      ...inside.filter((e) => e.cmd === "pause"),
    ];
    if (pauses.some((e) => e.reason === "near-target" || e.reason === "overshoot")) bigNear += 1;
  }

  return {
    unique: r.times.length,
    fps: +(r.times.length / (r.durationMs / 1000)).toFixed(1),
    p50: pct(gaps.map((g) => g.ms), 50),
    p95: pct(gaps.map((g) => g.ms), 95),
    p99: pct(gaps.map((g) => g.ms), 99),
    max: gaps.length ? +Math.max(...gaps.map((g) => g.ms)).toFixed(1) : null,
    over50: over(50),
    over75: over(75),
    over100: over(100),
    over150: over(150),
    gapsOver75: detail.length,
    pauseLinked,
    nearTargetLinked,
    bigNear,
    plays: r.plays,
    pauses: r.pauses,
    cycles: r.cycles,
    pausedWhileMoving: r.pausedWhileMoving,
    byReason: r.byReason,
    pauseSpanP50: pct(r.pauseSpans, 50),
    pauseSpanP95: pct(r.pauseSpans, 95),
    lagP50: pct(r.lagFrames, 50),
    lagP95: pct(r.lagFrames, 95),
    stillPlaying: r.stillPlaying,
    draws: r.draws,
    redraws: r.redraws,
    switches: r.switches,
    rateChanges: r.rateChanges,
    seeks: r.seeks,
    drawMsP95: pct(r.drawMs, 95),
    longTasks: r.longTasks.length,
    heapMB: r.heapMB,
    detail,
  };
}

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = (() => {
    const i = process.argv.indexOf("--modes");
    return i > -1 ? process.argv[i + 1].split(",") : ["base", "continuous"];
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
  writeFileSync(join(OUT, "pause.json"), JSON.stringify({ out, errors, bad }, null, 2));

  for (const mode of wanted) {
    console.log(`\n### modo: ${mode}   (teto 41,7 ms a 1x numa fonte de 24 fps)`);
    console.log("gesto                  únicos  fps   p50    p95    p99    máx   >50 >75 >100 >150   play pause ciclos  pausas c/ mov   lag p50/p95");
    console.log("-".repeat(146));
    for (const g of GESTURES) {
      const a = out[mode][g.id];
      console.log(
        `${g.label.padEnd(22)}${String(a.unique).padStart(6)}${String(a.fps).padStart(6)}` +
          `${String(a.p50).padStart(7)}${String(a.p95).padStart(7)}${String(a.p99).padStart(7)}${String(a.max).padStart(7)}` +
          `${String(a.over50).padStart(5)}${String(a.over75).padStart(4)}${String(a.over100).padStart(5)}${String(a.over150).padStart(5)}` +
          `${String(a.plays).padStart(7)}${String(a.pauses).padStart(6)}${String(a.cycles).padStart(7)}` +
          `${String(a.pausedWhileMoving).padStart(16)}${String(`${a.lagP50}/${a.lagP95}`).padStart(14)}`,
      );
    }
    console.log("\ncorrelação gap↔comando");
    console.log("gesto                  gaps>75  c/ pausa  c/ pausa near-target/overshoot   gaps>150  destes c/ near-target   motivos");
    console.log("-".repeat(146));
    for (const g of GESTURES) {
      const a = out[mode][g.id];
      const reasons = Object.entries(a.byReason)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(" ");
      console.log(
        `${g.label.padEnd(22)}${String(a.gapsOver75).padStart(8)}${String(a.pauseLinked).padStart(10)}` +
          `${String(a.nearTargetLinked).padStart(30)}${String(a.over150).padStart(11)}${String(a.bigNear).padStart(24)}   ${reasons}`,
      );
    }
  }

  // The first gesture, gap by gap — the evidence, not the summary.
  const m0 = wanted[0];
  const g0 = GESTURES.find((g) => g.id === "desce-1x") ?? GESTURES[0];
  console.log(`\n### ${g0.label} em "${m0}", gap a gap (>75 ms)`);
  console.log("t(ms)   dur     último comando antes        comandos dentro do gap        track");
  console.log("-".repeat(110));
  for (const d of out[m0][g0.id].detail) {
    console.log(
      `${String(d.start).padStart(6)}${String(d.ms).padStart(8)}   ${String(d.before).padEnd(28)}${String(d.inside).padEnd(30)}${String(d.track)}`,
    );
  }

  const ref = wanted[0];
  const nt = (x) => (x.byReason["near-target"] ?? 0) + (x.byReason.overshoot ?? 0);
  for (const mode of wanted.slice(1)) {
    console.log(`\n### ${ref}  vs  ${mode}`);
    console.log("gesto                  únicos      p95         p99        >150     pausas near-target    lag p95    parou no fim?");
    console.log("-".repeat(130));
    for (const g of GESTURES) {
      const a = out[ref][g.id];
      const b = out[mode][g.id];
      console.log(
        `${g.label.padEnd(22)}${String(`${a.unique}→${b.unique}`).padStart(9)}` +
          `${String(`${a.p95}→${b.p95}`).padStart(13)}${String(`${a.p99}→${b.p99}`).padStart(12)}` +
          `${String(`${a.over150}→${b.over150}`).padStart(10)}${String(`${nt(a)}→${nt(b)}`).padStart(22)}` +
          `${String(`${a.lagP95}→${b.lagP95}`).padStart(12)}` +
          `${String(`${a.stillPlaying === 0 ? "sim" : "NÃO"}→${b.stillPlaying === 0 ? "sim" : "NÃO"}`).padStart(16)}`,
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
