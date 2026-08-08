#!/usr/bin/env node
/**
 * Bidirectional scrub bench — the test that continuous playback cannot do.
 *
 * A scripted gesture drives the playhead exactly the way the site does: the
 * scroll writes a target frame, the render frame eases toward it with the same
 * damping (1 - e^-9dt), and the video is seeked to the frame centre with a
 * single seek in flight. The same script runs against all four renderers, so
 * the only difference between runs is how the frame gets painted.
 *
 * What is recorded is what is actually SEEN: requestVideoFrameCallback reports
 * the media time of every frame the compositor presented. Everything else —
 * repeated frames, skipped frames, target-to-screen distance, latency, settle
 * time — is derived from that, not from rAF.
 *
 *   node scrub-bench.mjs <baseUrl> [--video]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const RECORD = process.argv.includes("--video");
const OUT = "media-comparison/scene01-fidelity/scrub";

const RENDERERS = [
  { id: "A-nativo", q: { mode: "B" }, label: "vídeo nativo" },
  { id: "B-canvas2d", q: { mode: "C", sq: "high" }, label: "Canvas 2D" },
  { id: "C-webgl", q: { mode: "D", glq: "lanczos", sharpen: "0" }, label: "WebGL" },
  { id: "D-webgl-sharp", q: { mode: "D", glq: "lanczos", sharpen: "0.25" }, label: "WebGL +0,25" },
];

/**
 * Gestures as piecewise-linear keyframes over media frames of scene 01
 * (usable range 3..168). `play` is the only one that does not seek.
 */
const GESTURES = [
  { id: "1-play", label: "reprodução contínua", play: true, ms: 6000 },
  { id: "2-desce-lento", label: "scroll lento p/ baixo", kf: [[0, 3], [6000, 80]] },
  { id: "3-desce-rapido", label: "scroll rápido p/ baixo", kf: [[0, 3], [900, 165]], hold: 1500 },
  { id: "4-sobe-lento", label: "scroll lento p/ cima", kf: [[0, 165], [6000, 80]] },
  { id: "5-sobe-rapido", label: "scroll rápido p/ cima", kf: [[0, 165], [900, 3]], hold: 1500 },
  {
    id: "6-zigzag",
    label: "alternância baixo/cima",
    kf: [[0, 40], [600, 140], [1200, 40], [1800, 140], [2400, 40], [3000, 140]],
    hold: 1200,
  },
  {
    id: "7-oscilacao",
    label: "pequenas oscilações",
    kf: [[0, 80], [300, 84], [600, 76], [900, 84], [1200, 76], [1500, 84], [1800, 76], [2100, 80]],
    hold: 1200,
  },
  { id: "9-parada-abrupta", label: "pausa abrupta", kf: [[0, 3], [800, 150]], hold: 3500 },
  {
    id: "10-retomada",
    label: "retomada após pausa",
    kf: [[0, 3], [800, 150], [2300, 150], [3100, 168]],
    hold: 2000,
  },
];

/** Runs one gesture inside the page and returns the raw records. */
const DRIVER = async ({ kf, play, ms, hold }) => {
  const FPS = 24;
  const R = window.__qdRefs;
  const v = R.video();
  const canvas2d = R.canvas2d();
  const glCanvas = R.glCanvas();
  const gl = R.gl();
  const ctx = canvas2d ? canvas2d.getContext("2d") : null;
  const bw = (canvas2d || glCanvas || { width: 1920 }).width || 1920;
  const bh = (canvas2d || glCanvas || { height: 1080 }).height || 1080;

  const rvfc = [];
  const raf = [];
  const seeks = [];
  const longTasks = [];
  let po = null;
  try {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push({ t: +e.startTime.toFixed(1), d: +e.duration.toFixed(1) });
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch { /* not supported */ }

  const duration = play ? ms : kf[kf.length - 1][0] + (hold || 0);
  const targetAt = (t) => {
    if (play) return null;
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) {
      if (t <= kf[i][0]) {
        const [t0, f0] = kf[i - 1];
        const [t1, f1] = kf[i];
        return f0 + ((f1 - f0) * (t - t0)) / (t1 - t0);
      }
    }
    return kf[kf.length - 1][1];
  };

  // Park the playhead at the gesture's first frame before timing starts.
  if (!play) {
    v.pause();
    v.currentTime = (Math.round(targetAt(0)) + 0.5) / FPS;
    await new Promise((r) => {
      const done = () => { v.removeEventListener("seeked", done); r(); };
      v.addEventListener("seeked", done);
      setTimeout(r, 1500);
    });
  }

  const t0 = performance.now();
  let seeking = false;
  let seekStart = 0;
  let render = play ? 0 : targetAt(0);
  let last = 0;
  let blackFrames = 0;
  let probeTick = 0;

  const onSeeked = () => {
    if (seeking) seeks.push({ t: +(performance.now() - t0).toFixed(1), ms: +(performance.now() - seekStart).toFixed(1) });
    seeking = false;
  };
  v.addEventListener("seeked", onSeeked);

  let handle = 0;
  const onFrame = (_n, meta) => {
    rvfc.push({
      t: +(performance.now() - t0).toFixed(1),
      mediaTime: +meta.mediaTime.toFixed(5),
      presented: meta.presentedFrames,
      target: play ? null : +targetAt(performance.now() - t0).toFixed(2),
    });
    handle = v.requestVideoFrameCallback(onFrame);
  };
  handle = v.requestVideoFrameCallback(onFrame);

  if (play) {
    v.currentTime = 0;
    await v.play().catch(() => {});
  }

  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      if (last) raf.push(+(ts - last).toFixed(2));
      last = ts;

      if (!play) {
        const target = targetAt(t);
        const dt = Math.min(0.05, (raf[raf.length - 1] || 16.7) / 1000);
        render += (target - render) * (1 - Math.exp(-9 * dt));
        const gf = Math.max(3, Math.min(168, Math.round(render)));
        const want = (gf + 0.5) / FPS;
        if (!seeking && Math.abs(v.currentTime - want) >= 0.5 / FPS) {
          seeking = true;
          seekStart = performance.now();
          try { v.currentTime = want; } catch { seeking = false; }
        }
      }

      if (v.videoWidth) {
        const geo = R.geometry(v.videoWidth, v.videoHeight, bw, bh);
        if (ctx) ctx.drawImage(v, geo.sx, geo.sy, geo.sw, geo.sh, geo.dx, geo.dy, geo.dw, geo.dh);
        else if (gl) gl.draw(v, geo, window.__qd.glQuality, window.__qd.sharpen || 0);
      }
      // Black-screen probe, sampled sparsely on purpose: getImageData forces a
      // GPU readback and costs ~100 ms on a 1920x1080 canvas. Running it every
      // frame does not measure the renderer, it measures the probe — an earlier
      // pass wrongly showed Canvas 2D at rAF p99 116 ms for exactly that reason.
      probeTick += 1;
      if (ctx && probeTick % 20 === 0) {
        try {
          const d = ctx.getImageData(bw >> 1, bh >> 1, 1, 1).data;
          if (d[0] + d[1] + d[2] < 6) blackFrames += 1;
        } catch { /* ignore */ }
      }

      if (t < duration) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });

  v.removeEventListener("seeked", onSeeked);
  if (handle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
  if (po) po.disconnect();
  if (play) v.pause();

  const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
  return {
    rvfc, raf, seeks, longTasks, blackFrames, duration,
    totalVideoFrames: q ? q.totalVideoFrames : null,
    droppedVideoFrames: q ? q.droppedVideoFrames : null,
    heroPosterBack: document.body.dataset.heroSource === "poster",
  };
};

// ── analysis ────────────────────────────────────────────────────────────────
const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

function analyse(rec, gesture) {
  const FPS = 24;
  const shown = rec.rvfc.map((r) => ({ ...r, frame: Math.floor(r.mediaTime * FPS + 1e-4) }));

  let repeated = 0;
  let skipped = 0;
  for (let i = 1; i < shown.length; i++) {
    const d = shown[i].frame - shown[i - 1].frame;
    if (d === 0) repeated += 1;
    else if (Math.abs(d) > 1) skipped += Math.abs(d) - 1;
  }

  const dist = gesture.play ? [] : shown.filter((s) => s.target != null).map((s) => Math.abs(s.target - s.frame));

  // Settle: from the last keyframe until the shown frame stops changing.
  let settleMs = null;
  if (!gesture.play && gesture.hold) {
    const endOfMotion = gesture.kf[gesture.kf.length - 1][0];
    const after = shown.filter((s) => s.t >= endOfMotion);
    if (after.length) {
      const finalFrame = after[after.length - 1].frame;
      const firstAtFinal = after.find((s) => s.frame === finalFrame);
      settleMs = firstAtFinal ? +(firstAtFinal.t - endOfMotion).toFixed(1) : null;
    }
  }

  return {
    presented: shown.length,
    uniqueFrames: new Set(shown.map((s) => s.frame)).size,
    repeated,
    skipped,
    fpsPresented: +(shown.length / (rec.duration / 1000)).toFixed(1),
    distP50: dist.length ? +pct(dist, 50).toFixed(2) : null,
    distP95: dist.length ? +pct(dist, 95).toFixed(2) : null,
    distP99: dist.length ? +pct(dist, 99).toFixed(2) : null,
    distMax: dist.length ? +Math.max(...dist).toFixed(2) : null,
    seeks: rec.seeks.length,
    seekP50: rec.seeks.length ? +pct(rec.seeks.map((s) => s.ms), 50).toFixed(1) : null,
    seekP95: rec.seeks.length ? +pct(rec.seeks.map((s) => s.ms), 95).toFixed(1) : null,
    seekMax: rec.seeks.length ? +Math.max(...rec.seeks.map((s) => s.ms)).toFixed(1) : null,
    rafP50: +pct(rec.raf, 50).toFixed(2),
    rafP95: +pct(rec.raf, 95).toFixed(2),
    rafP99: +pct(rec.raf, 99).toFixed(2),
    longTasks: rec.longTasks.length,
    longTaskMax: rec.longTasks.length ? Math.max(...rec.longTasks.map((l) => l.d)) : 0,
    dropped: rec.droppedVideoFrames,
    black: rec.blackFrames,
    posterBack: rec.heroPosterBack,
    settleMs,
  };
}

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

  const results = {};
  const errors = [];

  for (const r of RENDERERS) {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      ...(RECORD ? { recordVideo: { dir: join(OUT, "video", r.id), size: { width: 960, height: 540 } } } : {}),
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${r.id}] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${r.id}] ${m.text()}`); });

    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");

    const p = new URLSearchParams({ fit: "cover", zoom: "1", ui: "0", frame: "3", vsrc: "tv", ...r.q });
    await page.goto(`${BASE}/quality-diagnostic?${p}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForSelector('body[data-qd-ready="1"]', { state: "attached", timeout: 60000 });
    await page.waitForTimeout(1200);

    results[r.id] = { label: r.label, gestures: {} };
    for (const g of GESTURES) {
      const before = await cdp.send("Performance.getMetrics");
      const rec = await page.evaluate(DRIVER, { kf: g.kf, play: g.play, ms: g.ms, hold: g.hold });
      const after = await cdp.send("Performance.getMetrics");
      const m = (l, n) => l.metrics.find((x) => x.name === n)?.value ?? 0;
      const a = analyse(rec, g);
      a.cpuTaskMs = +((m(after, "TaskDuration") - m(before, "TaskDuration")) * 1000).toFixed(0);
      a.heapMB = +(m(after, "JSHeapUsedSize") / 1048576).toFixed(1);
      results[r.id].gestures[g.id] = a;
      console.log(`  ${r.id.padEnd(15)} ${g.id.padEnd(18)} apresentados ${String(a.presented).padStart(4)}  repetidos ${String(a.repeated).padStart(4)}  |alvo-tela| p95 ${String(a.distP95 ?? "—").padStart(6)}`);
      await page.waitForTimeout(400);
    }

    await cdp.detach().catch(() => {});
    await ctx.close();
  }

  await browser.close();
  writeFileSync(join(OUT, "scrub.json"), JSON.stringify({ results, errors }, null, 2));

  for (const g of GESTURES) {
    console.log(`\n### ${g.id} — ${g.label}`);
    console.log("renderer        apres.  únicos  repet.  pulados  |alvo−tela| p50/p95/p99/max   seeks  seek p95  rAF p99  longtask  desc.  preto  estab.");
    console.log("-".repeat(140));
    for (const r of RENDERERS) {
      const a = results[r.id].gestures[g.id];
      console.log(
        `${r.label.padEnd(15)}${String(a.presented).padStart(6)}${String(a.uniqueFrames).padStart(8)}` +
          `${String(a.repeated).padStart(8)}${String(a.skipped).padStart(9)}` +
          `${String(a.distP50 ?? "—").padStart(9)}${String(a.distP95 ?? "—").padStart(7)}${String(a.distP99 ?? "—").padStart(7)}${String(a.distMax ?? "—").padStart(7)}` +
          `${String(a.seeks).padStart(8)}${String(a.seekP95 ?? "—").padStart(10)}${String(a.rafP99).padStart(9)}` +
          `${String(a.longTasks).padStart(10)}${String(a.dropped ?? "—").padStart(7)}${String(a.black).padStart(7)}${String(a.settleMs ?? "—").padStart(8)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
