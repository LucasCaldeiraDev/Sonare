#!/usr/bin/env node
/**
 * Does reverse48[frameCount - 1 - j] really show the same moment as normal48[j]?
 *
 * The controller reverses direction by switching to a different file and
 * addressing it through that one formula. If the formula is off by a single
 * frame the two representations show different moments, and every direction
 * change becomes a visible jump — subtle enough to survive casual testing and
 * impossible to debug from the player side.
 *
 * The reverse files here are interpolated from the 24 fps reverses rather than
 * produced by reversing the interpolated forwards (which would need 4,8 GB of
 * buffer), so they carry a deliberate one-frame shift that make-48fps.sh
 * compensates by prepending a cloned frame. This script is what proves the
 * compensation landed: it checks the mapping at every ORIGINAL frame, which is
 * the only place where an exact match is meaningful — synthesised frames are
 * estimated independently in each direction and are merely expected to be
 * similar, never identical.
 *
 *   node verify-48-mapping.mjs <forward.mp4> <reverse.mp4> [--factor 2]
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const FWD = process.argv[2];
const REV = process.argv[3];
const i = process.argv.indexOf("--factor");
const FACTOR = i > -1 ? Number(process.argv[i + 1]) : 2;
const TMP = process.env.TEMP ?? ".";
const AW = 968;
const AH = 534;

const dump = (file, out) => {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", file,
      "-vf", `scale=${AW}:${AH}:flags=lanczos,format=gray`, "-f", "rawvideo", out],
    { maxBuffer: 1 << 28 },
  );
  return statSync(out).size / (AW * AH);
};

const at = (b, k) => b.subarray(k * AW * AH, (k + 1) * AW * AH);
const psnr = (a, b) => {
  let se = 0;
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k];
    se += d * d;
  }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10(65025 / mse);
};

const f1 = join(TMP, "vm-fwd.gray");
const f2 = join(TMP, "vm-rev.gray");
const nF = dump(FWD, f1);
const nR = dump(REV, f2);
const fwd = readFileSync(f1);
const rev = readFileSync(f2);

if (nF !== nR) {
  console.log(`FALHA: contagens diferentes — normal ${nF}, reverso ${nR}`);
  process.exit(1);
}

/** Compare only the preserved originals; those are the ones that must be exact. */
const rows = [];
for (let j = 0; j < nF; j += FACTOR) {
  const m = nF - 1 - j;
  if (m < 0 || m >= nR) continue;
  rows.push({ j, m, db: psnr(at(fwd, j), at(rev, m)) });
}
// The two neighbouring offsets, to show the correct one wins by a wide margin
// rather than merely passing a threshold.
const offset = (o) => {
  const v = [];
  for (let j = 0; j < nF; j += FACTOR) {
    const m = nF - 1 - j + o;
    if (m < 0 || m >= nR) continue;
    v.push(psnr(at(fwd, j), at(rev, m)));
  }
  return v.reduce((a, b) => a + b, 0) / v.length;
};

const db = rows.map((r) => r.db).sort((a, b) => a - b);
const p = (q) => +db[Math.floor(q * (db.length - 1))].toFixed(2);
const worst = [...rows].sort((a, b) => a.db - b.db).slice(0, 4);

console.log(`${FWD.split(/[\\/]/).pop()}  <->  ${REV.split(/[\\/]/).pop()}`);
console.log(`  ${nF} frames em cada, ${rows.length} originais conferidos`);
console.log(`  PSNR normal[j] contra reverso[${nF - 1} - j]:  min ${p(0)}  p05 ${p(0.05)}  p50 ${p(0.5)}  max ${p(1)} dB`);
console.log(`  piores: ${worst.map((w) => `j${w.j}<->m${w.m}=${w.db.toFixed(1)}`).join("  ")}`);
console.log(`  media com deslocamento -1: ${offset(-1).toFixed(2)} dB`);
console.log(`  media com deslocamento  0: ${offset(0).toFixed(2)} dB   <- o mapeamento usado`);
console.log(`  media com deslocamento +1: ${offset(1).toFixed(2)} dB`);

const ok = p(0.05) >= 40 && offset(0) > offset(-1) + 6 && offset(0) > offset(1) + 6;
console.log(`  ${ok ? "PASSA" : "FALHA"} — mapeamento ${ok ? "exato" : "incorreto ou ambiguo"}`);
process.exit(ok ? 0 : 1);
