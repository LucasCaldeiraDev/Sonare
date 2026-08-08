#!/usr/bin/env node
/**
 * The control experiment: what does a 4K video do with NO controller at all?
 *
 * Everything measured so far went through the site — ScrollTrigger, the eased
 * playhead, the rate steering, the handover, the canvas. Every A/B changed one
 * of those and the ~233-250 ms holes survived all of them, including
 * `?surface=native`, which removes the canvas entirely.
 *
 * So this page has none of it. A bare <video>, play(), playbackRate 1, and
 * requestVideoFrameCallback. If the holes are here too, they belong to 4K
 * decode in this environment and no controller change can remove them; if the
 * cadence is clean, the fault is ours and the search continues upstream.
 *
 * Four conditions, because the site's decoders differ from a plain player in
 * exactly two ways — they are 1x1 and off-screen, and there are ten of them:
 *   composed    full size, visible;
 *   offscreen   1x1, opacity 0, at left:-9999, as the site has them;
 *   ten         composed, with nine other 4K decoders loaded alongside;
 *   rate1p07    composed, playbackRate 1.07 — the rate the site's controller
 *               actually commands near the target.
 *
 *   node native-floor.mjs <baseUrl>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/cadence";
const SRC = "/media/web/scene-01-4k-bt709-tv-gop6.mp4";
const OTHERS = [2, 3, 4, 5].map((n) => `/media/web/scene-0${n}-4k-bt709-tv-gop6.mp4`);
const SECONDS = 6.2;

const MEASURE = async ({ src, others, mode, seconds }) => {
  const mk = (url, visible) => {
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.style.cssText = visible
      ? "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:1"
      : "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0";
    document.body.appendChild(v);
    return v;
  };

  const visible = mode !== "offscreen";
  const v = mk(src, visible);
  const extra = mode === "ten" ? others.map((u) => mk(u, false)) : [];

  const ready = (el) =>
    new Promise((r) => {
      if (el.readyState >= 3) return r();
      el.addEventListener("canplaythrough", r, { once: true });
      setTimeout(r, 30000);
    });
  await ready(v);
  // The nine companions are LOADED but never played, exactly as the site keeps
  // its standby decoders — the question is whether their presence alone costs
  // the visible one its cadence.
  await Promise.all(extra.map(ready));

  v.playbackRate = mode === "rate1p07" ? 1.07 : 1;
  v.currentTime = 0.5;
  await new Promise((r) => v.addEventListener("seeked", r, { once: true }));

  const times = [];
  const mediaTimes = [];
  let stop = false;
  const cb = (_n, meta) => {
    if (stop) return;
    times.push(performance.now());
    mediaTimes.push(+meta.mediaTime.toFixed(4));
    v.requestVideoFrameCallback(cb);
  };
  v.requestVideoFrameCallback(cb);

  const longTasks = [];
  let po = null;
  try {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1));
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch { /* unsupported */ }

  await v.play();
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  stop = true;
  if (po) po.disconnect();
  v.pause();

  const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
  const out = {
    times: times.map((t) => +(t - t0).toFixed(1)),
    mediaTimes,
    longTasks,
    dropped: q ? q.droppedVideoFrames : null,
    totalDecoded: q ? q.totalVideoFrames : null,
    seconds,
  };
  v.remove();
  extra.forEach((e) => e.remove());
  return out;
};

const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !process.argv.includes("--headed"),
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/quality-diagnostic?ui=0`, { waitUntil: "load", timeout: 90000 });

  const MODES = ["composed", "offscreen", "ten", "rate1p07"];
  const res = {};
  for (const mode of MODES) {
    res[mode] = await page.evaluate(MEASURE, {
      src: BASE + SRC,
      others: OTHERS.map((u) => BASE + u),
      mode,
      seconds: SECONDS,
    });
    console.log(`  ${mode} medido`);
    await page.waitForTimeout(600);
  }
  await browser.close();
  writeFileSync(join(OUT, "native-floor.json"), JSON.stringify({ res, errors }, null, 2));

  console.log(`\n### <video> 4K sem controlador, ${SECONDS}s  (24 fps CFR ⇒ 41,7 ms entre frames)`);
  console.log("modo         frames   fps    p50    p95    p99    máx   >50 >75 >100 >150   descartados/decodificados  LT");
  console.log("-".repeat(118));
  for (const mode of MODES) {
    const r = res[mode];
    const gaps = [];
    for (let i = 1; i < r.times.length; i++) gaps.push(r.times[i] - r.times[i - 1]);
    const over = (n) => gaps.filter((g) => g > n).length;
    console.log(
      `${mode.padEnd(13)}${String(r.times.length).padStart(5)}` +
        `${String(+(r.times.length / r.seconds).toFixed(1)).padStart(7)}` +
        `${String(pct(gaps, 50)).padStart(7)}${String(pct(gaps, 95)).padStart(7)}` +
        `${String(pct(gaps, 99)).padStart(7)}${String(gaps.length ? +Math.max(...gaps).toFixed(1) : null).padStart(7)}` +
        `${String(over(50)).padStart(5)}${String(over(75)).padStart(4)}${String(over(100)).padStart(5)}${String(over(150)).padStart(5)}` +
        `${String(`${r.dropped}/${r.totalDecoded}`).padStart(24)}${String(r.longTasks.length).padStart(5)}`,
    );
  }

  // Media time tells whether the DECODER skipped frames or merely presented
  // them late — a hole with a matching media-time jump is dropped footage.
  console.log("\nsalto de mediaTime nos intervalos longos (>100 ms), em frames de 24 fps");
  for (const mode of MODES) {
    const r = res[mode];
    const jumps = [];
    for (let i = 1; i < r.times.length; i++) {
      if (r.times[i] - r.times[i - 1] > 100) {
        jumps.push(+((r.mediaTimes[i] - r.mediaTimes[i - 1]) * 24).toFixed(1));
      }
    }
    console.log(`  ${mode.padEnd(12)} ${jumps.length ? jumps.join(" ") : "nenhum intervalo >100 ms"}`);
  }
  console.log(errors.length ? `\nERROS: ${errors.join(" | ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
