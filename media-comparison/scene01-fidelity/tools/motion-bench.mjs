#!/usr/bin/env node
/**
 * Motion bench: the four renderers driven by real playback of scene 01.
 *
 * Each run plays the same clip for the same wall-clock window through the same
 * loop, so the only variable is the renderer. What is collected:
 *
 *   presented / dropped   from the media pipeline itself
 *                         (requestVideoFrameCallback + getVideoPlaybackQuality)
 *   frame cadence         rAF deltas -> p50/p95/p99 and jank count
 *   draw cost             CPU time inside the draw call, per frame
 *   GPU                   real hardware nanoseconds for the WebGL modes via
 *                         EXT_disjoint_timer_query_webgl2; for native and
 *                         Canvas 2D there is no equivalent, so CDP main-thread
 *                         metrics stand in and the report says so
 *
 *   node motion-bench.mjs <baseUrl> [seconds]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const SECONDS = Number(process.argv[3] ?? 8);
const OUT = "media-comparison/scene01-fidelity/motion";

const RUNS = [
  { id: "A-nativo", q: { mode: "B", vsrc: "tv" }, label: "vídeo nativo <video>" },
  { id: "B-canvas2d", q: { mode: "C", vsrc: "tv", sq: "high" }, label: "Canvas 2D" },
  { id: "C-webgl", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0" }, label: "WebGL sem sharpen" },
  { id: "D-webgl-sharp", q: { mode: "D", vsrc: "tv", glq: "lanczos", sharpen: "0.25" }, label: "WebGL sharpen 0,25" },
];

const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f2 = (v) => (v == null ? "  —  " : v.toFixed(2));

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
    ],
  });

  const results = [];
  const errors = [];

  for (const r of RUNS) {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${r.id}] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[${r.id}] ${m.text()}`);
    });

    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");

    const p = new URLSearchParams({
      fit: "cover", zoom: "1", ui: "0", motion: "1", frame: "0", ...r.q,
    });
    await page.goto(`${BASE}/quality-diagnostic?${p}`, { waitUntil: "load", timeout: 90000 });

    // Let the decoder settle and playback reach steady state before sampling,
    // otherwise the first-load spike dominates the percentiles.
    await page.waitForFunction(
      () => {
        const m = window.__qdMotion;
        return m && m.rafDeltas.length > 30 && m.videoTime > 0.4;
      },
      null,
      { timeout: 60000 },
    );
    const before = await cdp.send("Performance.getMetrics");
    const mark = await page.evaluate(() => ({
      raf: window.__qdMotion.rafDeltas.length,
      draw: window.__qdMotion.drawMs.length,
      presented: window.__qdMotion.presentedFrames,
      total: window.__qdMotion.totalVideoFrames,
      dropped: window.__qdMotion.droppedVideoFrames,
      gpu: (window.__qdMotion.gpuMs || []).length,
    }));

    await page.waitForTimeout(SECONDS * 1000);

    const after = await cdp.send("Performance.getMetrics");
    const m = await page.evaluate(() => window.__qdMotion);

    const metric = (list, n) => list.metrics.find((x) => x.name === n)?.value ?? 0;
    const cpu = {
      taskDurationMs: (metric(after, "TaskDuration") - metric(before, "TaskDuration")) * 1000,
      scriptDurationMs: (metric(after, "ScriptDuration") - metric(before, "ScriptDuration")) * 1000,
      layoutDurationMs: (metric(after, "LayoutDuration") - metric(before, "LayoutDuration")) * 1000,
      jsHeapMB: metric(after, "JSHeapUsedSize") / 1048576,
    };

    // Only the steady-state window, discarding everything before the mark.
    const rafs = m.rafDeltas.slice(mark.raf);
    const draws = m.drawMs.slice(mark.draw);
    const gpus = (m.gpuMs || []).slice(mark.gpu);
    const presented = m.presentedFrames - mark.presented;
    const total = m.totalVideoFrames != null ? m.totalVideoFrames - mark.total : null;
    const dropped = m.droppedVideoFrames != null ? m.droppedVideoFrames - mark.dropped : null;

    // A frame is janky when it misses the next vsync at 60 Hz.
    const jank = rafs.filter((d) => d > 33.4).length;
    const severe = rafs.filter((d) => d > 50).length;

    results.push({
      ...r,
      windowSeconds: SECONDS,
      fps: rafs.length / SECONDS,
      raf: { p50: pct(rafs, 50), p95: pct(rafs, 95), p99: pct(rafs, 99), max: Math.max(...rafs), n: rafs.length },
      jank, severe,
      jankPct: (jank / rafs.length) * 100,
      draw: { mean: mean(draws), p95: pct(draws, 95), max: draws.length ? Math.max(...draws) : null },
      gpu: gpus.length ? { mean: mean(gpus), p95: pct(gpus, 95), max: Math.max(...gpus), n: gpus.length } : null,
      video: { presented, total, dropped, dropPct: total ? (dropped / total) * 100 : null },
      cpu,
      glRenderer: m.glRenderer,
    });

    console.log(`  ${r.id.padEnd(16)} ok   ${rafs.length} frames de rAF, ${presented} apresentados`);
    await cdp.detach().catch(() => {});
    await ctx.close();
  }

  await browser.close();
  writeFileSync(`${OUT}/telemetry.json`, JSON.stringify({ results, errors }, null, 2));

  console.log(`\njanela de medição: ${SECONDS}s em regime, 1920x1080 DPR 1\n`);
  console.log("renderer               fps   rAF p50   p95    p99    max   jank   draw µ   draw p95   GPU µ    GPU p95   apres.  desc.");
  console.log("-".repeat(126));
  for (const r of results) {
    console.log(
      `${r.label.padEnd(22)}${r.fps.toFixed(1).padStart(5)}` +
        `${f2(r.raf.p50).padStart(10)}${f2(r.raf.p95).padStart(7)}${f2(r.raf.p99).padStart(7)}${f2(r.raf.max).padStart(7)}` +
        `${String(r.jank).padStart(7)}` +
        `${f2(r.draw.mean).padStart(9)}${f2(r.draw.p95).padStart(11)}` +
        `${(r.gpu ? f2(r.gpu.mean) : "  n/d").padStart(9)}${(r.gpu ? f2(r.gpu.p95) : "  n/d").padStart(10)}` +
        `${String(r.video.presented).padStart(8)}${String(r.video.dropped ?? "—").padStart(7)}`,
    );
  }
  console.log("\nCPU (main thread, na janela de medição):");
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(22)} task ${r.cpu.taskDurationMs.toFixed(0).padStart(5)} ms   script ${r.cpu.scriptDurationMs.toFixed(0).padStart(4)} ms   layout ${r.cpu.layoutDurationMs.toFixed(1).padStart(5)} ms   heap ${r.cpu.jsHeapMB.toFixed(1)} MB`,
    );
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
