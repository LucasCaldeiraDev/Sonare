#!/usr/bin/env node
/**
 * Motion inspection of scene 02 — the scene the tv tag costs the most.
 *
 * Two questions a single frame cannot answer:
 *   1. do the black areas PUMP as the shot moves? Clipping that grows and
 *      shrinks frame to frame is far more visible than a constant amount.
 *   2. is the shadow detail FLATTENED, or only the deepest points clipped?
 *      Standard deviation inside a dark region answers that: if tv drops to
 *      near zero where full still has spread, the gradation is gone.
 *
 * Streams every one of the 97 frames at the site's own crop, tv and full.
 * Read-only — records, changes nothing.
 */
import { spawn } from "node:child_process";

const W = "public/media/web";
const FULL = "media-comparison/source-archive/remux-full/scene-02-4k-bt709-full.mp4";
const TV = `${W}/scene-02-4k-bt709-tv.mp4`;
const VW = 1920;
const VH = 1080;
const FRAME_BYTES = VW * VH * 3;

/** x, y, w, h, label — measured on the 1920x1080 cover crop. */
const REGIONS = [
  [30, 500, 220, 120, "telao-sombra-profunda"],
  [350, 215, 240, 80, "telao-ceu-escuro"],
  [205, 655, 180, 85, "bw-esquerda"],
  [720, 600, 90, 200, "bw-torre"],
  [640, 855, 170, 75, "mobiliario-sombra"],
  [245, 750, 110, 55, "suporte-preto"],
];

function decodeAll(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v", "error", "-i", file,
      "-vf", `crop=3798:2136:39:0,scale=${VW}:${VH}:flags=lanczos`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]);
    const frames = [];
    let pending = Buffer.alloc(0);
    ff.stdout.on("data", (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= FRAME_BYTES) {
        frames.push(analyse(pending.subarray(0, FRAME_BYTES)));
        pending = pending.subarray(FRAME_BYTES);
      }
    });
    let err = "";
    ff.stderr.on("data", (d) => (err += d));
    ff.on("close", (code) => (code === 0 ? resolve(frames) : reject(new Error(err))));
  });
}

function analyse(buf) {
  let blk = 0;
  let clp = 0;
  let sum = 0;
  const px = VW * VH;
  for (let i = 0; i < px; i++) {
    const o = i * 3;
    const r = buf[o], g = buf[o + 1], b = buf[o + 2];
    if (r === 0 && g === 0 && b === 0) blk++;
    if (r === 255 || g === 255 || b === 255) clp++;
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const regions = REGIONS.map(([x, y, w, h, name]) => {
    let s = 0, s2 = 0, n = 0, rb = 0;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const o = (j * VW + i) * 3;
        const l = 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2];
        s += l;
        s2 += l * l;
        n++;
        if (buf[o] === 0 && buf[o + 1] === 0 && buf[o + 2] === 0) rb++;
      }
    }
    const mean = s / n;
    return { name, mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), blackPct: (rb / n) * 100 };
  });
  return { blackPct: (blk / px) * 100, clipPct: (clp / px) * 100, luma: sum / px, regions };
}

const [tv, full] = await Promise.all([decodeAll(TV), decodeAll(FULL)]);
console.log(`frames analisados: tv ${tv.length}, full ${full.length}\n`);

// ── 1. pumping over the shot ────────────────────────────────────────────────
const pct = (a) => a.map((f) => f.blackPct);
const tvB = pct(tv);
const fullB = pct(full);
const stat = (a) => ({
  min: Math.min(...a),
  max: Math.max(...a),
  mean: a.reduce((x, y) => x + y, 0) / a.length,
});
const s = stat(tvB);
console.log("=== 1. AS ÁREAS DE PRETO PULSAM AO LONGO DO PLANO? ===");
console.log(`  tv    preto puro por frame: min ${s.min.toFixed(3)}%  max ${s.max.toFixed(3)}%  média ${s.mean.toFixed(3)}%  amplitude ${(s.max - s.min).toFixed(3)} pp`);
const sf = stat(fullB);
console.log(`  full  preto puro por frame: min ${sf.min.toFixed(3)}%  max ${sf.max.toFixed(3)}%  média ${sf.mean.toFixed(3)}%`);
let maxJump = 0;
let jumpAt = 0;
for (let i = 1; i < tvB.length; i++) {
  const d = Math.abs(tvB[i] - tvB[i - 1]);
  if (d > maxJump) { maxJump = d; jumpAt = i; }
}
console.log(`  maior variação entre frames consecutivos: ${maxJump.toFixed(4)} pp (frame ${jumpAt})`);
console.log("  curva a cada 8 frames:");
console.log("   " + tvB.filter((_, i) => i % 8 === 0).map((v) => v.toFixed(2)).join("  "));

// ── 2. flattening inside the dark regions ───────────────────────────────────
console.log("\n=== 2. O DETALHE NAS SOMBRAS FOI ACHATADO? ===");
console.log("  (sd = desvio padrão dentro da região; se cai a ~0 no tv, a gradação sumiu)\n");
console.log("  região                     frame        full luma/sd        tv luma/sd     tv preto");
console.log("  " + "-".repeat(88));
for (const [, , , , name] of REGIONS) {
  for (const f of [0, 24, 48, 72, 96]) {
    const a = full[f]?.regions.find((r) => r.name === name);
    const b = tv[f]?.regions.find((r) => r.name === name);
    if (!a || !b) continue;
    console.log(
      `  ${name.padEnd(24)} ${String(f).padStart(4)}   ${a.mean.toFixed(2).padStart(7)} / ${a.sd.toFixed(2).padStart(6)}   ${b.mean.toFixed(2).padStart(7)} / ${b.sd.toFixed(2).padStart(6)}   ${b.blackPct.toFixed(2).padStart(6)}%`,
    );
  }
  console.log("");
}

// ── 3. worst frame ──────────────────────────────────────────────────────────
const worst = tvB.indexOf(Math.max(...tvB));
console.log("=== 3. PIOR FRAME DO PLANO (mais preto ceifado) ===");
console.log(`  frame ${worst}: preto puro ${tv[worst].blackPct.toFixed(3)}%  estourado ${tv[worst].clipPct.toFixed(3)}%  luma ${tv[worst].luma.toFixed(2)}`);
console.log(`  mesmo frame no full: preto ${full[worst].blackPct.toFixed(3)}%  estourado ${full[worst].clipPct.toFixed(3)}%  luma ${full[worst].luma.toFixed(2)}`);
console.log(`\nWORST_FRAME=${worst}`);
