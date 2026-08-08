#!/usr/bin/env node
/**
 * What each candidate costs the decoder, measured without the site.
 *
 * The resolution question is a decode-capacity question, so putting it through
 * the controller would only add noise: the controller's own rate policy, its
 * seeks and its handovers all move when the media changes. Here each file is a
 * bare <video>, composited full size, driven directly.
 *
 * Three things decide it:
 *
 *   SEEK LATENCY  time from setting currentTime to a frame AT THAT POSITION
 *                 being presented — via requestVideoFrameCallback, never
 *                 `seeked`, which fires long before the picture exists. This is
 *                 what the 10x and 20x gestures are actually waiting on.
 *   RATE HEADROOM dropped over decoded at playbackRate 1 / 1,5 / 2 / 3. The
 *                 controller's ceiling is DECODE_BUDGET_FPS / MEDIA_FPS, so the
 *                 honest question is where each candidate stops keeping up.
 *   FIRST MOTION  time from src assignment to the first presented frame, cold.
 *
 *   node decode-bench.mjs <baseUrl> [--reps 2]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { statSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/interp";
const r = process.argv.indexOf("--reps");
const REPS = r > -1 ? Number(process.argv[r + 1]) : 2;

const CANDIDATES = [
  { id: "4K48-gop12", path: "/media-comparison/interp/out/scene-05-4k-bt709-tv-48fps.mp4", file: "media-comparison/interp/out/scene-05-4k-bt709-tv-48fps.mp4" },
  { id: "1440p48-gop12", path: "/media-comparison/interp/cand/scene-05-1440p-48fps-gop12.mp4", file: "media-comparison/interp/cand/scene-05-1440p-48fps-gop12.mp4" },
  { id: "1440p48-gop6", path: "/media-comparison/interp/cand/scene-05-1440p-48fps-gop6.mp4", file: "media-comparison/interp/cand/scene-05-1440p-48fps-gop6.mp4" },
  { id: "1080p48-gop12", path: "/media-comparison/interp/cand/scene-05-1080p-48fps-gop12.mp4", file: "media-comparison/interp/cand/scene-05-1080p-48fps-gop12.mp4" },
  { id: "1080p48-gop6", path: "/media-comparison/interp/cand/scene-05-1080p-48fps-gop6.mp4", file: "media-comparison/interp/cand/scene-05-1080p-48fps-gop6.mp4" },
  // The shipped 24 fps set, as the floor everything is measured against.
  { id: "4K24-gop6", path: "/media/web/scene-05-4k-bt709-tv-gop6.mp4", file: "public/media/web/scene-05-4k-bt709-tv-gop6.mp4" },
];

const RATES = [1, 1.5, 2, 3];

const MEASURE = async ({ url, rates, fps }) => {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:1";
  document.body.appendChild(v);

  const events = [];
  for (const t of ["waiting", "stalled", "suspend", "error"]) {
    v.addEventListener(t, () => events.push(t));
  }

  // Presented-frame stream, running for the whole measurement.
  let presented = -1;
  let count = 0;
  const times = [];
  const cb = (_n, meta) => {
    presented = Math.floor(meta.mediaTime * fps + 1e-4);
    count += 1;
    times.push(performance.now());
    v.requestVideoFrameCallback(cb);
  };

  const t0 = performance.now();
  v.src = url;
  await new Promise((res) => {
    v.addEventListener("loadedmetadata", res, { once: true });
    setTimeout(res, 20000);
  });
  const tMeta = performance.now() - t0;
  v.requestVideoFrameCallback(cb);
  await new Promise((res) => {
    const wait = () => (count > 0 ? res() : setTimeout(wait, 8));
    wait();
    setTimeout(res, 20000);
  });
  const tFirst = performance.now() - t0;
  await new Promise((res) => {
    if (v.readyState >= 4) return res();
    v.addEventListener("canplaythrough", res, { once: true });
    setTimeout(res, 30000);
  });

  const dur = v.duration;
  const total = Math.floor(dur * fps);

  // Seek latency. Positions are deterministic (a fixed low-discrepancy walk),
  // so every candidate is asked for exactly the same work.
  const seekLat = [];
  let cursor = 0.137;
  for (let i = 0; i < 24; i++) {
    cursor = (cursor + 0.6180339887) % 1;
    const frame = Math.max(1, Math.min(total - 2, Math.floor(cursor * total)));
    const want = (frame + 0.5) / fps;
    const at = performance.now();
    v.currentTime = want;
    // eslint-disable-next-line no-await-in-loop
    const ms = await new Promise((res) => {
      const deadline = performance.now() + 3000;
      const poll = () => {
        if (Math.abs(presented - frame) <= 1) return res(performance.now() - at);
        if (performance.now() > deadline) return res(-1);
        requestAnimationFrame(poll);
      };
      poll();
    });
    if (ms >= 0) seekLat.push(+ms.toFixed(1));
  }

  // Rate headroom. droppedVideoFrames is cumulative, so each step is a delta.
  const rateRows = [];
  v.currentTime = 0.5;
  await new Promise((res) => v.addEventListener("seeked", res, { once: true }));
  for (const rate of rates) {
    const q0 = v.getVideoPlaybackQuality();
    const n0 = count;
    const e0 = events.length;
    v.playbackRate = rate;
    // eslint-disable-next-line no-await-in-loop
    await v.play();
    const start = performance.now();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 2200));
    v.pause();
    const secs = (performance.now() - start) / 1000;
    const q1 = v.getVideoPlaybackQuality();
    const dropped = q1.droppedVideoFrames - q0.droppedVideoFrames;
    const decoded = q1.totalVideoFrames - q0.totalVideoFrames;
    rateRows.push({
      rate,
      demand: +(rate * fps).toFixed(0),
      presented: +((count - n0) / secs).toFixed(1),
      decoded: +(decoded / secs).toFixed(1),
      dropped,
      dropPct: decoded ? +((100 * dropped) / decoded).toFixed(1) : 0,
      events: events.length - e0,
    });
    v.currentTime = 0.5;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => {
      v.addEventListener("seeked", res, { once: true });
      setTimeout(res, 2000);
    });
  }

  const out = {
    tMeta: +tMeta.toFixed(0),
    tFirst: +tFirst.toFixed(0),
    w: v.videoWidth,
    h: v.videoHeight,
    seekLat,
    rateRows,
    events: events.length,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
  v.remove();
  return out;
};

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
    ],
  });

  const res = {};
  for (const c of CANDIDATES) {
    const runs = [];
    for (let i = 0; i < REPS; i++) {
      // A fresh context each rep: cold HTTP cache, so tFirst means something.
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/quality-diagnostic?ui=0`, { waitUntil: "load", timeout: 90000 });
      runs.push(await page.evaluate(MEASURE, { url: BASE + c.path, rates: RATES, fps: c.id.includes("24") ? 24 : 48 }));
      await ctx.close();
    }
    // Report the median run, so one unlucky disk read does not decide anything.
    const pick = runs.sort((a, b) => pct(a.seekLat, 50) - pct(b.seekLat, 50))[Math.floor(runs.length / 2)];
    res[c.id] = { ...pick, sizeMB: +(statSync(c.file).size / 1048576).toFixed(1) };
    console.log(`  ${c.id} medido`);
  }
  await browser.close();
  writeFileSync(join(OUT, "decode.json"), JSON.stringify(res, null, 2));

  console.log("\n### custo de decode por candidato — cena 05");
  console.log("candidato        resolução    MB    metadata  1º frame   seek p50   p95    máx    espera");
  console.log("-".repeat(104));
  for (const c of CANDIDATES) {
    const a = res[c.id];
    console.log(
      `${c.id.padEnd(17)}${String(`${a.w}x${a.h}`).padEnd(13)}${String(a.sizeMB).padStart(5)}` +
        `${String(a.tMeta + " ms").padStart(10)}${String(a.tFirst + " ms").padStart(10)}` +
        `${String(pct(a.seekLat, 50)).padStart(11)}${String(pct(a.seekLat, 95)).padStart(7)}` +
        `${String(Math.max(...a.seekLat).toFixed(0)).padStart(7)}${String(a.events).padStart(10)}`,
    );
  }

  console.log("\n### margem de taxa: quantos frames/s o decoder aguenta");
  console.log("candidato        taxa  demanda  apresentados  decodificados  descartados        %  eventos");
  console.log("-".repeat(104));
  for (const c of CANDIDATES) {
    for (const r of res[c.id].rateRows) {
      console.log(
        `${c.id.padEnd(17)}${String(r.rate).padStart(4)}${String(r.demand).padStart(9)}` +
          `${String(r.presented).padStart(14)}${String(r.decoded).padStart(15)}${String(r.dropped).padStart(13)}` +
          `${String(r.dropPct + "%").padStart(9)}${String(r.events).padStart(9)}`,
      );
    }
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
