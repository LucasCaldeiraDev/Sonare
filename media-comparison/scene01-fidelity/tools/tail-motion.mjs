#!/usr/bin/env node
/**
 * Is the pause at the end of a scene recorded in the footage?
 *
 * The controller measures clean at the 01->02 crossing — the last picture of
 * scene 01 is replaced within 17 to 33 ms, cold or warm, going down or up. Yet
 * the hitch is felt, and only downwards. That combination points away from
 * timing and towards content: if the camera decelerates to a stop in the last
 * frames of scene 01, the picture LOOKS frozen while the pipeline is behaving
 * perfectly, and the frame counter has nothing to report.
 *
 * It would also explain the asymmetry for free. Coming back up, the reverse
 * file is entered at its frame 1 and immediately moves AWAY from that static
 * tail, so the same frames pass in the opposite order — accelerating out of
 * stillness rather than decelerating into it, which reads as intent instead of
 * as a stall.
 *
 * So this measures inter-frame motion frame by frame across the junction:
 * the tail of the outgoing scene and the head of the incoming one, in the same
 * units, against each scene's own average.
 *
 *   node tail-motion.mjs [--n 14]
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const i = process.argv.indexOf("--n");
const N = i > -1 ? Number(process.argv[i + 1]) : 14;
const TMP = process.env.TEMP ?? ".";
const AW = 484;
const AH = 267;

const dump = (file, out) => {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", file,
      "-vf", `scale=${AW}:${AH}:flags=bilinear,format=gray`, "-f", "rawvideo", out],
    { maxBuffer: 1 << 28 },
  );
  return statSync(out).size / (AW * AH);
};
const at = (b, k) => b.subarray(k * AW * AH, (k + 1) * AW * AH);
/** Mean absolute difference between consecutive frames, in luma levels. */
const motion = (a, b) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]);
  return +(s / a.length).toFixed(3);
};

const series = (file) => {
  const raw = join(TMP, "tail.gray");
  const n = dump(file, raw);
  const buf = readFileSync(raw);
  const m = [];
  for (let k = 1; k < n; k++) m.push(motion(at(buf, k - 1), at(buf, k)));
  return { n, m };
};

const SCENES = ["01", "02", "03", "04", "05"];
const SETS = [
  { tag: "24 fps origem", path: (s, r) => `public/media/web/scene-${s}-4k-bt709-tv-gop6${r}.mp4` },
  { tag: "48 fps 1440p", path: (s, r) => `media-comparison/interp/out/scene-${s}-1440p-48fps${r}.mp4` },
];

for (const set of SETS) {
  console.log(`\n########## ${set.tag} ##########`);
  for (const s of SCENES) {
    const f = series(set.path(s, ""));
    const avg = f.m.reduce((a, b) => a + b, 0) / f.m.length;
    const tail = f.m.slice(-N);
    const head = f.m.slice(0, N);
    const tailAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
    const headAvg = head.reduce((a, b) => a + b, 0) / head.length;
    console.log(
      `\ncena ${s}  ${f.n} frames  movimento médio ${avg.toFixed(2)}` +
        `   cauda ${tailAvg.toFixed(2)} (${((100 * tailAvg) / avg - 100).toFixed(0)}%)` +
        `   início ${headAvg.toFixed(2)} (${((100 * headAvg) / avg - 100).toFixed(0)}%)`,
    );
    console.log(`  últimos ${N}: ${tail.map((x) => x.toFixed(2)).join(" ")}`);
    console.log(`  primeiros ${N}: ${head.map((x) => x.toFixed(2)).join(" ")}`);
    // A run of frames whose motion is under a tenth of the scene average reads
    // as a hold no matter how promptly the canvas swaps them.
    const still = (arr) => {
      let run = 0;
      for (let k = arr.length - 1; k >= 0; k--) {
        if (arr[k] < avg * 0.1) run += 1;
        else break;
      }
      return run;
    };
    const tailStill = still(tail);
    if (tailStill) {
      console.log(
        `  >>> ${tailStill} frames finais abaixo de 10% do movimento médio` +
          ` = ${(tailStill * (set.tag.includes("48") ? 1000 / 48 : 1000 / 24)).toFixed(0)} ms de imagem parada`,
      );
    }
  }
}
