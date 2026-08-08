#!/usr/bin/env node
/**
 * Is frame 0 of scene 01 actually softer than the frames right after it?
 *
 * Decodes the first 25 frames of the shipped tv file at the site's own crop and
 * measures acutance, luma and frame-to-frame motion. If frame 0 is genuinely
 * soft — first frame of a camera move, or the encoder's opening I-frame — the
 * scroll is not fixing anything, it is simply advancing to a sharper frame.
 */
import { spawn } from "node:child_process";

const FILE = process.argv[2] ?? "public/media/web/scene-01-4k-bt709-tv.mp4";
const VW = 1920;
const VH = 1080;
const N = 25;
const FRAME_BYTES = VW * VH * 3;

const luma = (buf) => {
  const y = new Float32Array(VW * VH);
  for (let i = 0; i < VW * VH; i++) {
    const o = i * 3;
    y[i] = 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2];
  }
  return y;
};

const acutance = (y) => {
  let s = 0;
  let n = 0;
  for (let j = 1; j < VH - 1; j++) {
    for (let i = 1; i < VW - 1; i++) {
      const k = j * VW + i;
      s += Math.abs(4 * y[k] - y[k - 1] - y[k + 1] - y[k - VW] - y[k + VW]);
      n++;
    }
  }
  return s / n;
};

const frames = await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", [
    "-v", "error", "-i", FILE,
    "-vf", `select=lt(n\\,${N}),crop=3798:2136:39:0,scale=${VW}:${VH}:flags=lanczos`,
    "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ]);
  const out = [];
  let pending = Buffer.alloc(0);
  ff.stdout.on("data", (c) => {
    pending = pending.length ? Buffer.concat([pending, c]) : c;
    while (pending.length >= FRAME_BYTES) {
      out.push(pending.subarray(0, FRAME_BYTES));
      pending = pending.subarray(FRAME_BYTES);
    }
  });
  let err = "";
  ff.stderr.on("data", (d) => (err += d));
  ff.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(err))));
});

console.log(`\nframes decodificados: ${frames.length}  (crop do site, 1920x1080)\n`);
console.log("frame    acutância   vs frame 0    luma média   movimento vs anterior");
console.log("-".repeat(74));

let prevY = null;
let base = 0;
const rows = [];
for (let i = 0; i < frames.length; i++) {
  const y = luma(frames[i]);
  const ac = acutance(y);
  if (i === 0) base = ac;
  let motion = null;
  if (prevY) {
    let d = 0;
    for (let k = 0; k < y.length; k++) d += Math.abs(y[k] - prevY[k]);
    motion = d / y.length;
  }
  let sum = 0;
  for (let k = 0; k < y.length; k++) sum += y[k];
  const rel = ((ac / base - 1) * 100).toFixed(1);
  rows.push({ i, ac, rel: +rel });
  console.log(
    `${String(i).padStart(4)}   ${ac.toFixed(3).padStart(9)}   ${(rel > 0 ? "+" : "") + rel + "%"}`.padEnd(42) +
      `${(sum / y.length).toFixed(2).padStart(9)}    ${motion == null ? "   —" : motion.toFixed(3).padStart(7)}`,
  );
  prevY = y;
}

const best = rows.reduce((a, b) => (b.ac > a.ac ? b : a));
console.log(`\n  frame 0 acutância ${base.toFixed(3)}`);
console.log(`  frame mais nítido dos ${frames.length}: ${best.i} (${best.ac.toFixed(3)}, ${best.rel > 0 ? "+" : ""}${best.rel}%)`);
const within2 = rows.filter((r) => Math.abs(r.rel) < 2).length;
console.log(`  frames dentro de ±2% do frame 0: ${within2} de ${rows.length}`);
