#!/usr/bin/env node
/**
 * Boundary handover: with the confirmation gate vs without it.
 *
 * The hitch at a crossing is a WRONG FRAME briefly on screen Ã¢ÂÂ the incoming
 * element's cold position Ã¢ÂÂ followed by a correction. On a canvas that reads as
 * a luma discontinuity that immediately reverses, so the measurement samples
 * the canvas continuously and looks for exactly that shape:
 *
 *   jolt      the largest frame-to-frame luma jump inside the crossing window;
 *   reversals a jump one way followed by a comparable jump back Ã¢ÂÂ the
 *             signature of showing something wrong and then fixing it;
 *   black     any sample that goes to near-zero.
 *
 * Both runs drive the identical scroll script, so the only variable is
 * `?handover=off`.
 *
 *   node boundary-bench.mjs <baseUrl>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "media-comparison/scene01-fidelity/boundary";

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

/** Segment starts: [0, 166, 263, 384, 505]. 01Ã¢ÂÂ02 at 166, 02Ã¢ÂÂ03 at 263. */
const CASES = [
  { id: "01to02-lento", label: "01→02 descendo lento", boundary: 166, kf: [[0, 140], [2600, 195]] },
  { id: "01to02-rapido", label: "01→02 descendo rápido", boundary: 166, kf: [[0, 140], [500, 195]] },
  { id: "02to01-lento", label: "02→01 subindo lento", boundary: 166, kf: [[0, 195], [2600, 140]] },
  { id: "02to01-rapido", label: "02→01 subindo rápido", boundary: 166, kf: [[0, 195], [500, 140]] },
  { id: "02to03-lento", label: "02→03 descendo lento", boundary: 263, kf: [[0, 238], [2600, 292]] },
  { id: "02to03-rapido", label: "02→03 descendo rápido", boundary: 263, kf: [[0, 238], [500, 292]] },
  { id: "03to02-lento", label: "03→02 subindo lento", boundary: 263, kf: [[0, 292], [2600, 238]] },
  { id: "03to02-rapido", label: "03→02 subindo rápido", boundary: 263, kf: [[0, 292], [500, 238]] },
];
const HOLD = 2200;

const SAMPLER = () => {
  const w = window;
  w.__bs = { samples: [], on: false, rvfc: [] };
  // Presented frames per element. This is what shows the post-boundary sag: a
  // segment that enters at a crawl presents almost nothing for a beat.
  setInterval(() => {
    document.querySelectorAll("section video").forEach((v, i) => {
      if (v.__bsWired) return;
      v.__bsWired = true;
      if (typeof v.requestVideoFrameCallback !== "function") return;
      const cb = (_n, meta) => {
        if (w.__bs.on) w.__bs.rvfc.push({ i, t: +performance.now().toFixed(1), m: +meta.mediaTime.toFixed(4) });
        v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    });
  }, 8);
  const id = setInterval(() => {
    if (!w.__bs.on) return;
    const c = document.querySelector("section canvas");
    if (!c || !c.width) return;
    try {
      const ctx = c.getContext("2d");
      const d = ctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      w.__bs.samples.push({ t: +performance.now().toFixed(1), luma: +(sum / (d.length / 4)).toFixed(3) });
    } catch { /* ignore */ }
  }, 16);
  w.__bsStop = () => clearInterval(id);
};

const DRIVE = async ({ kf, hold }) => {
  const w = window;
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
  await new Promise((r) => setTimeout(r, 1400));
  w.__bs.samples.length = 0;
  w.__bs.rvfc.length = 0;
  w.__bs.on = true;
  const t0 = performance.now();
  w.__bs.t0 = t0;
  const duration = kf[kf.length - 1][0] + hold;
  await new Promise((resolve) => {
    const loop = (ts) => {
      const t = ts - t0;
      window.scrollTo(0, Math.round(at(Math.min(t, kf[kf.length - 1][0]))));
      if (t < duration) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  w.__bs.on = false;
  return { samples: w.__bs.samples.slice(), rvfc: w.__bs.rvfc.map((r) => ({ ...r, t: +(r.t - t0).toFixed(1) })) };
};

function analyse(samples) {
  const d = [];
  for (let i = 1; i < samples.length; i++) d.push(samples[i].luma - samples[i - 1].luma);
  const abs = d.map(Math.abs);
  // A reversal: a jump above threshold immediately answered by one back.
  const TH = 1.2;
  let reversals = 0;
  for (let i = 1; i < d.length; i++) {
    if (Math.abs(d[i - 1]) > TH && Math.abs(d[i]) > TH && Math.sign(d[i]) !== Math.sign(d[i - 1])) {
      reversals += 1;
    }
  }
  return {
    samples: samples.length,
    jolt: abs.length ? +Math.max(...abs).toFixed(3) : 0,
    joltP99: abs.length ? +[...abs].sort((a, b) => a - b)[Math.floor(abs.length * 0.99)].toFixed(3) : 0,
    reversals,
    black: samples.filter((s) => s.luma < 1).length,
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

  // --media swaps the comparison to long-GOP originals vs GOP-6 derivatives.
  const MODES = process.argv.includes("--media")
    ? [
        { id: "antes", url: `${BASE}/?media=original`, label: "GOP longo (antes)" },
        { id: "depois", url: `${BASE}/`, label: "GOP 6 (depois)" },
      ]
    : [
        { id: "antes", url: `${BASE}/?handover=off`, label: "sem confirmação (antes)" },
        { id: "depois", url: `${BASE}/`, label: "com confirmação (depois)" },
      ];
  const out = {};
  const errors = [];

  for (const m of MODES) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${m.id}] ${e.message}`));
    page.on("console", (c) => { if (c.type() === "error") errors.push(`[${m.id}] ${c.text()}`); });
    await page.addInitScript(SAMPLER);
    await page.goto(m.url, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    out[m.id] = {};
    for (const c of CASES) {
      const kf = c.kf.map(([t, f]) => [t, scrollFor(f)]);
      const r = await page.evaluate(DRIVE, { kf, hold: HOLD });
      out[m.id + "_hstats"] = await page.evaluate(() => ({ ...window.__cnHandover }));
      // The crossing happens where the scroll script passes the boundary frame.
      const [[, f0], [t1, f1]] = c.kf;
      const cross = c.boundary;
      const tCross = Math.round((t1 * (cross - f0)) / (f1 - f0));
      const win = r.rvfc.filter((x) => x.t >= tCross && x.t <= tCross + 800);
      out[m.id][c.id] = { ...analyse(r.samples), tCross, postBoundaryFrames: win.length };
      await page.waitForTimeout(400);
    }
    console.log(`  ${m.id} concluído`);
    await ctx.close();
  }

  await browser.close();
  writeFileSync(join(OUT, "boundary.json"), JSON.stringify({ out, errors }, null, 2));

  console.log("\ncaso                        ANTES: jolt / p99 / revers. / preto      DEPOIS: jolt / p99 / revers. / preto");
  console.log("-".repeat(112));
  for (const c of CASES) {
    const a = out.antes[c.id];
    const b = out.depois[c.id];
    console.log(
      `${c.label.padEnd(26)}${String(a.jolt).padStart(9)}${String(a.joltP99).padStart(8)}${String(a.reversals).padStart(9)}${String(a.black).padStart(8)}` +
        `${String(b.jolt).padStart(15)}${String(b.joltP99).padStart(8)}${String(b.reversals).padStart(9)}${String(b.black).padStart(8)}${String(a.postBoundaryFrames).padStart(11)}${String(b.postBoundaryFrames).padStart(8)}`,
    );
  }
  const sum = (o) => CASES.reduce((n, c) => n + o[c.id].reversals, 0);
  console.log(`\n  reversões totais — antes ${sum(out.antes)}   depois ${sum(out.depois)}`);
  for (const m of MODES) {
    const h = out[`${m.id}_hstats`];
    if (h) {
      console.log(
        `  ${m.label}: gate segurou ${h.waits} quadros, forçou ${h.forced}, maior hold ${Math.round(h.maxHoldMs)} ms`,
      );
    }
  }
  console.log(errors.length ? `\nERROS:\n  ${errors.join("\n  ")}` : "\nzero erros de console");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
