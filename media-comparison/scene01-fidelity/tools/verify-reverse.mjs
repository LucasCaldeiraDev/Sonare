#!/usr/bin/env node
/**
 * Frame-for-frame proof that the reverse file really is the forward file
 * backwards, with no one-frame displacement.
 *
 * Both files are first-generation encodes of the same parent, so a correct
 * mapping leaves only encode noise between the pair — tens of dB. A mapping
 * that is off by a single frame collapses PSNR into the twenties on a moving
 * shot, which is why this test can tell the two apart at a glance.
 *
 * Each side is also compared against the shared parent, which separates "the
 * mapping is wrong" from "this particular encode is soft".
 *
 *   node verify-reverse.mjs <scene> [frames...]
 */
import { execFileSync } from "node:child_process";

const scene = process.argv[2] ?? "02";
const PARENT = `media-comparison/source-archive/remux-tv/scene-${scene}-4k-bt709-tv.mp4`;
const FWD = `public/media/web/scene-${scene}-4k-bt709-tv-gop6.mp4`;
const REV = `public/media/web/scene-${scene}-4k-bt709-tv-gop6-reverse.mp4`;

const count = Number(
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=nb_frames", "-of", "csv=p=0", FWD], { encoding: "utf8" }).trim(),
);

/** The one mapping, in integer frames. Never derived from durations. */
const toReverse = (frame, frameCount) => frameCount - 1 - frame;

const grab = (file, frame) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", file,
    "-vf", `select=eq(n\\,${frame})`, "-fps_mode", "passthrough", "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });

function compare(a, b) {
  if (a.length !== b.length) return null;
  let se = 0;
  let mx = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > mx) mx = d;
    sum += d;
    se += d * d;
  }
  const rmse = Math.sqrt(se / a.length);
  return {
    psnr: rmse === 0 ? Infinity : 20 * Math.log10(255 / rmse),
    max: mx,
    mean: sum / a.length,
  };
}

const explicit = process.argv.slice(3).map(Number).filter((n) => Number.isInteger(n));
const last = count - 1;
const probes = explicit.length
  ? explicit
  : [0, 1, 2, 5, 6, 7, Math.floor(count / 2), last - 6, last - 1, last];

console.log(`\ncena ${scene}: ${count} frames`);
console.log(`mapeamento: reverseFrame = ${count} - 1 - forwardFrame\n`);
console.log("fwd   -> rev    rev vs fwd (PSNR/máx/média)      rev vs pai            fwd vs pai");
console.log("-".repeat(94));

let worst = Infinity;
let shifted = false;
for (const f of probes) {
  const r = toReverse(f, count);
  const fwd = grab(FWD, f);
  const rev = grab(REV, r);
  const par = grab(PARENT, f);
  const rf = compare(rev, fwd);
  const rp = compare(rev, par);
  const fp = compare(fwd, par);
  if (rf.psnr < worst) worst = rf.psnr;
  if (rf.psnr < 30) shifted = true;
  console.log(
    `${String(f).padStart(3)} -> ${String(r).padStart(3)}   ` +
      `${rf.psnr.toFixed(2).padStart(6)} dB  ${String(rf.max).padStart(3)}  ${rf.mean.toFixed(3).padStart(6)}   ` +
      `${rp.psnr.toFixed(2).padStart(6)} dB  ${String(rp.max).padStart(3)}     ` +
      `${fp.psnr.toFixed(2).padStart(6)} dB  ${String(fp.max).padStart(3)}`,
  );
}

// The four the brief calls out by name.
const named = [[0, last], [1, last - 1], [48, count - 49], [last, 0]];
console.log("\npares exigidos no briefing:");
for (const [f, expect] of named) {
  const got = toReverse(f, count);
  console.log(`  normal ${String(f).padStart(3)} <-> reverso ${String(expect).padStart(3)}   ${got === expect ? "OK" : `*** deu ${got} ***`}`);
}

console.log(
  shifted
    ? "\n*** PSNR abaixo de 30 dB em algum par — há deslocamento de quadro ***"
    : `\nsem deslocamento: pior par ${worst.toFixed(2)} dB (um shift de 1 quadro daria ~20 dB).`,
);
process.exit(shifted ? 1 : 0);
