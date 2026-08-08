#!/usr/bin/env node
/**
 * Scores each candidate capture against the ffmpeg Lanczos reference.
 *
 * Three numbers, because one is not enough to separate the two failure modes:
 *
 *   RMSE / PSNR   how far the pixels are from the reference overall. Catches
 *                 the colour/range error, which dominates everything else.
 *   sharpness     mean |Laplacian| of luma. A soft resample loses high-frequency
 *                 energy, so a value BELOW the reference means "blurrier" and
 *                 meaningfully above it means "sharpened / ringing".
 *   luma mean     catches a brightness shift that RMSE alone would blur into
 *                 the total.
 *
 *   node compare.mjs <referencePng> <candidate...>
 */
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

function decode(file) {
  const meta = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file],
      { encoding: "utf8" },
    ),
  ).streams[0];
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
  return { w: meta.width, h: meta.height, raw };
}

function lumaPlane({ w, h, raw }) {
  const y = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    y[i] = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2];
  }
  return y;
}

/** Mean absolute 4-neighbour Laplacian: high-frequency energy, i.e. acutance. */
function sharpness(y, w, h) {
  let sum = 0;
  let n = 0;
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i;
      sum += Math.abs(4 * y[k] - y[k - 1] - y[k + 1] - y[k - w] - y[k + w]);
      n++;
    }
  }
  return sum / n;
}

const refFile = process.argv[2];
const candidates = process.argv.slice(3);
if (!refFile || !candidates.length) {
  console.error("usage: node compare.mjs <referencePng> <candidate...>");
  process.exit(1);
}

const ref = decode(refFile);
const refY = lumaPlane(ref);
const refSharp = sharpness(refY, ref.w, ref.h);
let refLuma = 0;
for (let i = 0; i < refY.length; i++) refLuma += refY[i];
refLuma /= refY.length;

console.log(`\nreference  ${basename(refFile)}  ${ref.w}x${ref.h}`);
console.log(`           sharpness ${refSharp.toFixed(3)}   luma mean ${refLuma.toFixed(3)}\n`);
console.log(
  "candidate                      size        RMSE    PSNR dB   sharpness   vs ref    luma     Δluma",
);
console.log("-".repeat(104));

const rows = [];
for (const file of candidates) {
  let cand;
  try {
    cand = decode(file);
  } catch {
    console.log(`${basename(file).padEnd(30)} DECODE FAILED`);
    continue;
  }
  const name = basename(file, ".png");
  if (cand.w !== ref.w || cand.h !== ref.h) {
    console.log(`${name.padEnd(30)} ${`${cand.w}x${cand.h}`.padEnd(11)} SIZE MISMATCH — not comparable`);
    continue;
  }
  let se = 0;
  for (let i = 0; i < ref.raw.length; i++) {
    const d = ref.raw[i] - cand.raw[i];
    se += d * d;
  }
  const rmse = Math.sqrt(se / ref.raw.length);
  const psnr = rmse === 0 ? Infinity : 20 * Math.log10(255 / rmse);
  const cy = lumaPlane(cand);
  const cs = sharpness(cy, cand.w, cand.h);
  let cl = 0;
  for (let i = 0; i < cy.length; i++) cl += cy[i];
  cl /= cy.length;

  const rel = ((cs / refSharp - 1) * 100).toFixed(1);
  rows.push({ name, rmse, psnr, cs, rel: +rel, cl, dl: cl - refLuma });
  console.log(
    `${name.padEnd(30)} ${`${cand.w}x${cand.h}`.padEnd(11)} ${rmse.toFixed(3).padStart(7)} ${
      (psnr === Infinity ? "∞" : psnr.toFixed(2)).padStart(9)
    }   ${cs.toFixed(3).padStart(9)} ${`${rel > 0 ? "+" : ""}${rel}%`.padStart(8)} ${cl
      .toFixed(2)
      .padStart(7)} ${(cl - refLuma >= 0 ? "+" : "") + (cl - refLuma).toFixed(2)}`,
  );
}

const best = rows.filter((r) => Number.isFinite(r.psnr)).sort((a, b) => b.psnr - a.psnr);
if (best.length) {
  console.log("\nclosest to reference by PSNR:");
  for (const r of best.slice(0, 5)) {
    console.log(`  ${r.psnr.toFixed(2)} dB  ${r.name}   (sharpness ${r.rel > 0 ? "+" : ""}${r.rel}%)`);
  }
}
