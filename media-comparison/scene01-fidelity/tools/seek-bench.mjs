#!/usr/bin/env node
/**
 * Seek latency in a real browser, per file.
 *
 * Two clocks, and the second is the one that matters:
 *   seeked   the element says it arrived;
 *   painted  requestVideoFrameCallback presents the frame — when the picture
 *            actually changes on screen.
 *
 * Two patterns, because they stress the GOP differently:
 *   random   arbitrary positions, the worst case for a long GOP;
 *   reverse  walking backwards in small steps, which is what a scroll up does.
 *
 * A bare page with one <video> and nothing else, so the numbers are the media
 * pipeline and not the site.
 *
 *   node seek-bench.mjs <baseUrl>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/gop";
const GOPDIR = "/media-comparison/scene01-fidelity/gop";

const FILES = [
  { id: "original", url: "/media/web/scene-02-4k-bt709-tv.mp4", label: "atual (1 keyframe)" },
  { id: "gop6", url: `${GOPDIR}/scene-02-4k-bt709-tv-gop6.mp4`, label: "GOP 6 crf16" },
  { id: "gop12", url: `${GOPDIR}/scene-02-4k-bt709-tv-gop12.mp4`, label: "GOP 12 crf16" },
  { id: "gop6c20", url: `${GOPDIR}/scene-02-4k-bt709-tv-gop6-crf20.mp4`, label: "GOP 6 crf20" },
];

const FPS = 24;
const FRAMES = 97;

const MEASURE = async ({ url, fps, frames }) => {
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.style.cssText = "position:fixed;left:0;top:0;width:640px;height:360px";
  document.body.appendChild(v);
  await new Promise((r) => {
    if (v.readyState >= 2) return r();
    v.addEventListener("loadeddata", r, { once: true });
    setTimeout(r, 30000);
  });

  const seekOnce = (frame) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      let seekedAt = null;
      const onSeeked = () => {
        seekedAt = performance.now() - t0;
      };
      v.addEventListener("seeked", onSeeked, { once: true });
      const done = (painted) => {
        v.removeEventListener("seeked", onSeeked);
        resolve({ frame, seeked: seekedAt, painted });
      };
      if (typeof v.requestVideoFrameCallback === "function") {
        const h = v.requestVideoFrameCallback((_n, meta) => {
          if (Math.floor(meta.mediaTime * fps + 1e-4) === frame) done(performance.now() - t0);
          else {
            // Not our frame yet — keep waiting on the same clock.
            v.requestVideoFrameCallback(function again(_n2, m2) {
              if (Math.floor(m2.mediaTime * fps + 1e-4) === frame) done(performance.now() - t0);
              else v.requestVideoFrameCallback(again);
            });
          }
          void h;
        });
      } else {
        v.addEventListener("seeked", () => done(performance.now() - t0), { once: true });
      }
      setTimeout(() => done(null), 4000);
      v.currentTime = (frame + 0.5) / fps;
    });

  // Deterministic pseudo-random positions, same list for every file.
  const rnd = [];
  let s = 12345;
  for (let i = 0; i < 20; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    rnd.push(2 + (s % (frames - 4)));
  }
  const random = [];
  for (const f of rnd) random.push(await seekOnce(f));

  // Reverse walk, the scroll-up pattern.
  const reverse = [];
  for (let f = frames - 2; f >= 2; f -= 4) reverse.push(await seekOnce(f));

  v.remove();
  return { random, reverse };
};

const pct = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};
const mx = (a) => {
  const s = a.filter((x) => x != null);
  return s.length ? +Math.max(...s).toFixed(1) : null;
};

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/quality-diagnostic?ui=0`, { waitUntil: "load", timeout: 60000 });

  const results = {};
  for (const f of FILES) {
    const r = await page.evaluate(MEASURE, { url: BASE + f.url, fps: FPS, frames: FRAMES });
    results[f.id] = { label: f.label, ...r };
    console.log(`  ${f.id} medido`);
  }
  await browser.close();
  writeFileSync(join(OUT, "seek.json"), JSON.stringify(results, null, 2));

  for (const kind of ["random", "reverse"]) {
    console.log(`\n### seeks ${kind === "random" ? "aleatórios" : "reversos (padrão do scroll p/ cima)"}`);
    console.log("arquivo                 n    até 'seeked' p50/p95/máx      até PINTAR p50/p95/máx");
    console.log("-".repeat(88));
    for (const f of FILES) {
      const a = results[f.id][kind];
      const sk = a.map((x) => x.seeked);
      const pa = a.map((x) => x.painted);
      console.log(
        `${f.label.padEnd(22)}${String(a.length).padStart(3)}` +
          `${String(pct(sk, 50)).padStart(11)}${String(pct(sk, 95)).padStart(7)}${String(mx(sk)).padStart(7)}` +
          `${String(pct(pa, 50)).padStart(17)}${String(pct(pa, 95)).padStart(7)}${String(mx(pa)).padStart(7)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS: ${errors.join(" | ")}` : "\nzero erros");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
