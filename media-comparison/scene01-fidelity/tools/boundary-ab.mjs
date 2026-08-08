#!/usr/bin/env node
/**
 * The 01->02 hitch, and why it is only felt going down.
 *
 * Reported by hand, never caught by a bench — which is itself a clue. Every
 * cadence metric so far aggregates a whole gesture, and a single 150 ms hold at
 * a crossing disappears into a p95 taken over six seconds. So this bench does
 * the opposite: it drives ONE crossing at a time and looks only at the frames
 * either side of it.
 *
 * The number that matters is `heldMs` from __cnVisible.boundaries: how long the
 * last picture of the outgoing scene stayed on screen before the first picture
 * of the incoming one replaced it. Not readyState, not `seeked`, not even rVFC
 * on the incoming element — all three can be satisfied while the viewer is
 * still looking at the old scene.
 *
 * Every crossing is driven in both directions at three speeds, from a settled
 * start well clear of the boundary, so the approach is identical each time and
 * the only variable is direction.
 *
 *   node boundary-ab.mjs <baseUrl> [--variant 1440p] [--reps 3]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/interp";
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const VARIANT = argOf("--variant", "1440p");
const REPS = Number(argOf("--reps", "3"));

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

/** Global frame of each junction, from SEGMENT_START_FRAME. */
const JUNCTIONS = [
  { id: "01-02", at: 166 },
  { id: "02-03", at: 263 },
  { id: "03-04", at: 384 },
  { id: "04-05", at: 505 },
];
/** Story frames per second of wall clock. 24 is 1,0x. */
const SPEEDS = [
  { id: "lento", fps: 12 },
  { id: "medio", fps: 24 },
  { id: "rapido", fps: 72 },
];
/** How far either side of the junction the gesture runs. */
const SPAN = 40;

const CROSS = async ({ from, to, ms, hold, settleMs }) => {
  window.scrollTo(0, from);
  await new Promise((r) => setTimeout(r, settleMs));

  const v = window.__cnVisible;
  const s = window.__cnSeek;
  const k = window.__cnTick;
  const base = {
    b: v.boundaries.length,
    n: v.newFrameAt.length,
    seeks: v.syncSeeks(),
    started: s.started,
    ev: k.events.length,
  };

  const t0 = performance.now();
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      window.scrollTo(0, Math.round(from + ((to - from) * Math.min(t, ms)) / ms));
      if (t < ms) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  await new Promise((r) => setTimeout(r, hold));

  const times = v.newFrameAt.slice(base.n);
  const crossings = v.boundaries.slice(base.b);
  // Gaps carry WHERE they happened relative to the crossing, because a 200 ms
  // hole 900 ms before the junction and one exactly on it are different bugs.
  const cross0 = crossings.length ? crossings[0].t : null;
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push({
      ms: +(times[i] - times[i - 1]).toFixed(1),
      rel: cross0 == null ? null : +(times[i] - cross0).toFixed(0),
    });
  }
  const ev = k.events.slice(base.ev).reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
  return {
    crossings,
    unique: times.length,
    gaps,
    seeks: v.syncSeeks() - base.seeks,
    started: s.started - base.started,
    events: ev,
  };
};

/** Wheel mode snapshots and reads the same counters CROSS does, out of band. */
const WHEEL_ARM = () => {
  const v = window.__cnVisible;
  const s = window.__cnSeek;
  const k = window.__cnTick;
  window.__wb = { b: v.boundaries.length, n: v.newFrameAt.length, seeks: v.syncSeeks(), started: s.started, ev: k.events.length };
  return true;
};
const WHEEL_READ = () => {
  const v = window.__cnVisible;
  const s = window.__cnSeek;
  const k = window.__cnTick;
  const b = window.__wb;
  const times = v.newFrameAt.slice(b.n);
  const crossings = v.boundaries.slice(b.b);
  const cross0 = crossings.length ? crossings[0].t : null;
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push({
      ms: +(times[i] - times[i - 1]).toFixed(1),
      rel: cross0 == null ? null : +(times[i] - cross0).toFixed(0),
    });
  }
  return {
    crossings,
    unique: times.length,
    gaps,
    seeks: v.syncSeeks() - b.seeks,
    started: s.started - b.started,
    events: k.events.slice(b.ev).reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {}),
  };
};

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};
const med = (a) => (a.length ? pct(a, 50) : null);

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
  const errors = [];
  const COLD = process.argv.includes("--cold");
  const WHEEL = process.argv.includes("--wheel");
  const ONLY = argOf("--only", null);

  /**
   * A page whose decoders have never been touched.
   *
   * The first version of this bench ran every junction in one session and
   * reported warm leads of 15 to 250 SECONDS — by the time it reached a
   * crossing, every track had been resident for minutes. A visitor reaches
   * 01->02 within seconds of load, with scene 02 cold, which is a completely
   * different question and the only one that matches the report.
   */
  let shared = null;
  const fresh = async () => {
    if (!COLD && shared) return shared;
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: VH },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (c) => { if (c.type() === "error") errors.push(c.text()); });
    await page.goto(`${BASE}/?temporalMedia=48&mediaVariant=${VARIANT}`, { waitUntil: "load", timeout: 90000 });
    await page.addStyleTag({ content: "html,body{scroll-behavior:auto !important}" });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(600);
    if (!COLD) shared = { ctx, page };
    return { ctx, page };
  };

  const rows = [];
  for (const j of JUNCTIONS) {
    if (ONLY && j.id !== ONLY) continue;
    for (const sp of SPEEDS) {
      for (const dir of ["desce", "sobe"]) {
        const a = dir === "desce" ? j.at - SPAN : j.at + SPAN;
        const b = dir === "desce" ? j.at + SPAN : j.at - SPAN;
        const ms = Math.round((SPAN * 2 * 1000) / sp.fps);
        const held = [];
        const warmLead = [];
        const armLead = [];
        const gapsAll = [];
        let switches = 0;
        let waiting = 0;
        for (let r = 0; r < REPS; r++) {
          // eslint-disable-next-line no-await-in-loop
          const { ctx, page } = await fresh();
          // eslint-disable-next-line no-await-in-loop
          let res;
          if (WHEEL) {
            /**
             * Real wheel events, which is how the report was produced.
             * scroll-behavior: smooth does not apply to user input, so no
             * override is needed — and a detent is a discrete ~100 px jump,
             * nothing like the linear ramp every other bench drives.
             */
            // eslint-disable-next-line no-await-in-loop
            await page.evaluate((y) => {
              document.documentElement.style.scrollBehavior = "auto";
              window.scrollTo(0, y);
              document.documentElement.style.scrollBehavior = "";
            }, scrollFor(a));
            // eslint-disable-next-line no-await-in-loop
            await page.waitForTimeout(COLD ? 500 : 1500);
            // eslint-disable-next-line no-await-in-loop
            await page.mouse.move(960, 540);
            // eslint-disable-next-line no-await-in-loop
            const arm = await page.evaluate(WHEEL_ARM);
            void arm;
            const px = Math.abs(scrollFor(b) - scrollFor(a));
            const steps = Math.max(1, Math.round(px / 100));
            const gap = Math.max(0, Math.round(ms / steps));
            const sign = scrollFor(b) > scrollFor(a) ? 1 : -1;
            for (let n = 0; n < steps; n++) {
              // eslint-disable-next-line no-await-in-loop
              await page.mouse.wheel(0, sign * 100);
              // eslint-disable-next-line no-await-in-loop
              if (gap) await page.waitForTimeout(gap);
            }
            // eslint-disable-next-line no-await-in-loop
            await page.waitForTimeout(1400);
            // eslint-disable-next-line no-await-in-loop
            res = await page.evaluate(WHEEL_READ);
          } else {
            // eslint-disable-next-line no-await-in-loop
            res = await page.evaluate(CROSS, {
              from: scrollFor(a), to: scrollFor(b), ms, hold: 1400,
              // Cold runs get just enough time to place the scroll; a long
              // settle would warm the very decoders under test.
              settleMs: COLD ? 500 : 1800,
            });
          }
          // Only the crossing of THIS junction, in THIS direction.
          const wanted = res.crossings.filter((c) => c.dir === dir);
          for (const c of wanted) {
            held.push(c.heldMs);
            if (c.warmLeadMs != null) warmLead.push(c.warmLeadMs);
            if (c.armLeadMs != null) armLead.push(c.armLeadMs);
          }
          switches += wanted.length;
          waiting += (res.events.waiting ?? 0) + (res.events.stalled ?? 0);
          gapsAll.push(...res.gaps);
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(300);
          if (COLD) await ctx.close();
        }
        rows.push({
          junction: j.id, speed: sp.id, dir,
          n: switches,
          heldMed: med(held), heldMax: held.length ? Math.max(...held) : null,
          held,
          warmLead: med(warmLead), armLead: med(armLead),
          gapP95: pct(gapsAll.map((g) => g.ms), 95),
          gapMax: gapsAll.length ? +Math.max(...gapsAll.map((g) => g.ms)).toFixed(0) : null,
          // Where the worst hole sat relative to the crossing: negative is
          // before it, positive after, null when no crossing was recorded.
          gapMaxRel: (() => {
            const w = gapsAll.reduce((m, g) => (m == null || g.ms > m.ms ? g : m), null);
            return w ? w.rel : null;
          })(),
          nearCross: gapsAll.filter((g) => g.rel != null && Math.abs(g.rel) < 300 && g.ms > 80).length,
          waiting,
        });
        process.stdout.write(".");
      }
    }
  }
  await browser.close();
  writeFileSync(join(OUT, `boundary-${VARIANT}.json`), JSON.stringify({ rows, errors }, null, 2));

  console.log(`\n\n### retenção do último quadro na travessia — ${VARIANT}, ${REPS} repetições`);
  console.log("fronteira  velocidade  sentido  trocas  retenção med  máx   gap p95  gap máx  quando   >80ms perto  antecip.warm  antecip.arm  espera");
  console.log("-".repeat(134));
  for (const r of rows) {
    console.log(
      `${r.junction.padEnd(11)}${r.speed.padEnd(12)}${r.dir.padEnd(9)}${String(r.n).padStart(5)}` +
        `${String(r.heldMed).padStart(14)}${String(r.heldMax).padStart(7)}` +
        `${String(r.gapP95).padStart(9)}${String(r.gapMax).padStart(9)}` +
        `${String(r.gapMaxRel == null ? "—" : `${r.gapMaxRel > 0 ? "+" : ""}${r.gapMaxRel}`).padStart(8)}` +
        `${String(r.nearCross).padStart(13)}` +
        `${String(r.warmLead).padStart(14)}${String(r.armLead).padStart(13)}${String(r.waiting).padStart(8)}`,
    );
  }

  console.log("\n### assimetria por fronteira (retenção mediana, descendo menos subindo)");
  console.log("fronteira  velocidade   desce    sobe   diferença");
  console.log("-".repeat(56));
  for (const j of JUNCTIONS) {
    for (const sp of SPEEDS) {
      const d = rows.find((r) => r.junction === j.id && r.speed === sp.id && r.dir === "desce");
      const u = rows.find((r) => r.junction === j.id && r.speed === sp.id && r.dir === "sobe");
      if (!d || !u || d.heldMed == null || u.heldMed == null) continue;
      const diff = +(d.heldMed - u.heldMed).toFixed(1);
      console.log(
        `${j.id.padEnd(11)}${sp.id.padEnd(12)}${String(d.heldMed).padStart(7)}${String(u.heldMed).padStart(8)}` +
          `${String(diff > 0 ? `+${diff}` : diff).padStart(12)}`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
