#!/usr/bin/env node
/**
 * Luma at every junction, read off the tv files.
 *
 * The point is not that the two sides match in brightness — they are different
 * shots and they should not. The point is that both sides show the SAME
 * interpretation: limited-range decoding puts min at 0 and max near 254 on
 * every scene. A scene still on the full tag would stand out immediately with
 * min ~12 and max ~236 and zero clipping.
 */
import { execFileSync } from "node:child_process";

const W = "public/media/web";
const SCENES = [
  { n: "01", frames: 169, w: 3876, h: 2136 },
  { n: "02", frames: 97, w: 3876, h: 2136 },
  { n: "03", frames: 121, w: 3856, h: 2148 },
  { n: "04", frames: 121, w: 3876, h: 2136 },
  { n: "05", frames: 193, w: 3876, h: 2136 },
];

function stats(scene, frame, w, h) {
  const sw = Math.round((h * 16) / 9);
  const sx = Math.round((w - sw) / 2);
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", `${W}/scene-${scene}-4k-bt709-tv.mp4`,
     "-vf", `select=eq(n\\,${frame}),crop=${sw}:${h}:${sx}:0,scale=1920:1080:flags=lanczos`,
     "-fps_mode", "passthrough", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
  const px = raw.length / 3;
  let sum = 0, mn = 255, mx = 0, blk = 0, clp = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 3;
    const y = 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2];
    sum += y;
    if (y < mn) mn = y;
    if (y > mx) mx = y;
    if (raw[o] === 0 && raw[o + 1] === 0 && raw[o + 2] === 0) blk++;
    if (raw[o] === 255 || raw[o + 1] === 255 || raw[o + 2] === 255) clp++;
  }
  return {
    mean: +(sum / px).toFixed(2),
    mn: mn | 0,
    mx: mx | 0,
    blk: +((blk / px) * 100).toFixed(3),
    clp: +((clp / px) * 100).toFixed(3),
  };
}

const row = (label, s) =>
  `    ${label.padEnd(30)} luma ${String(s.mean).padStart(7)}   min ${String(s.mn).padStart(3)}   max ${String(s.mx).padStart(3)}   preto ${String(s.blk).padStart(6)}%   estourado ${String(s.clp).padStart(6)}%`;

let allLimited = true;
for (let i = 0; i < 4; i++) {
  const a = SCENES[i];
  const b = SCENES[i + 1];
  const last = stats(a.n, a.frames - 1, a.w, a.h);
  const first = stats(b.n, 0, b.w, b.h);
  console.log(`\n  junção ${a.n} -> ${b.n}`);
  console.log(row(`último frame cena ${a.n} (f${a.frames - 1})`, last));
  console.log(row(`primeiro frame cena ${b.n} (f0)`, first));
  // A scene left on the full tag cannot reach 0 or 254 and clips nothing.
  for (const s of [last, first]) if (s.mn > 4 || s.mx < 248) allLimited = false;
}

console.log(
  allLimited
    ? "\n  Os oito frames das quatro junções decodificam como limited (min 0, max ~254).\n  Nenhuma cena ficou para trás na interpretação full."
    : "\n  *** algum lado de junção não parece limited ***",
);
process.exit(allLimited ? 0 : 1);
