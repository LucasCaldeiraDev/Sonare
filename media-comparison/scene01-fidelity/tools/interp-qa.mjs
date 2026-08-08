#!/usr/bin/env node
/**
 * Does the interpolated media actually contain new motion, and at what cost?
 *
 * Two questions, and they need different tests.
 *
 * 1. ALIGNMENT. Doubling the frame rate must not move the original frames. In a
 *    24 -> 48 conversion, output frame 2k has to be source frame k, pixel for
 *    pixel or very close. If that drifts, every frame index in the controller is
 *    wrong and the editorial timing goes with it. Measured as PSNR of output
 *    2k against source k; anything under ~40 dB means the originals were
 *    resampled rather than preserved.
 *
 * 2. WHETHER THE SYNTHESISED FRAMES ARE REAL. An odd output frame can be one of
 *    three things:
 *      a duplicate      identical to a neighbour — no new motion at all;
 *      a blend          the average of its neighbours — ghosting, two images at
 *                       once, which reads as smear rather than movement;
 *      motion-compensated  pixels moved along estimated flow — the only one
 *                       that adds information.
 *    They are separated by comparing each synthesised frame against both its
 *    neighbours and against their average, plus acutance. A blend is always
 *    softer than both neighbours and nearly identical to their mean; a genuine
 *    interpolation keeps acutance and differs from the mean.
 *
 * PSNR/SSIM against the master cannot judge the synthesised frames — there is
 * no ground truth for a moment that was never shot. So the numbers here are
 * relational, and the script also writes crops of the worst frames, because
 * warping on a straight line is something only an eye can call.
 *
 *   node interp-qa.mjs <source.mp4> <interpolated.mp4> [--factor 2] [--out dir]
 */
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SRC = process.argv[2];
const INT = process.argv[3];
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const FACTOR = Number(arg("--factor", "2"));
const OUT = arg("--out", "media-comparison/interp/qa");
const TMP = process.env.TEMP ?? ".";

/** Analysis runs on quarter-resolution luma: 517 KB a frame instead of 8,3 MB. */
const AW = 968;
const AH = 534;

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 1 << 28 });
const probe = (f, entries) =>
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "default=nw=1", f])
    .toString()
    .trim();

const dumpLuma = (file, out) => {
  ff(["-y", "-i", file, "-vf", `scale=${AW}:${AH}:flags=lanczos,format=gray`, "-f", "rawvideo", out]);
  const n = statSync(out).size / (AW * AH);
  if (!Number.isInteger(n)) throw new Error(`${file}: tamanho de plano inesperado`);
  return n;
};

const frameAt = (buf, i) => buf.subarray(i * AW * AH, (i + 1) * AW * AH);

const psnr = (a, b) => {
  let se = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    se += d * d;
  }
  const mse = se / a.length;
  return mse === 0 ? Infinity : +(10 * Math.log10(65025 / mse)).toFixed(2);
};

/** Mean absolute 4-neighbour Laplacian: how much fine detail survives. */
const acutance = (f) => {
  let s = 0;
  let n = 0;
  for (let y = 1; y < AH - 1; y++) {
    for (let x = 1; x < AW - 1; x++) {
      const i = y * AW + x;
      s += Math.abs(4 * f[i] - f[i - 1] - f[i + 1] - f[i - AW] - f[i + AW]);
      n += 1;
    }
  }
  return +(s / n).toFixed(3);
};

const psnrToBlend = (mid, a, b) => {
  let se = 0;
  for (let i = 0; i < mid.length; i++) {
    const d = mid[i] - ((a[i] + b[i]) >> 1);
    se += d * d;
  }
  const mse = se / mid.length;
  return mse === 0 ? Infinity : +(10 * Math.log10(65025 / mse)).toFixed(2);
};

const stats = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const f = (v) => (Number.isFinite(v) ? +v.toFixed(2) : v);
  return {
    min: f(s[0]),
    p05: f(s[Math.floor(0.05 * s.length)]),
    p50: f(s[Math.floor(0.5 * s.length)]),
    p95: f(s[Math.floor(0.95 * s.length)]),
    max: f(s[s.length - 1]),
    mean: f(a.reduce((x, y) => x + y, 0) / a.length),
  };
};

const run = () => {
  mkdirSync(OUT, { recursive: true });
  console.log(`fonte        ${SRC}`);
  console.log(`interpolado  ${INT}\n`);

  for (const [label, file] of [["fonte", SRC], ["interpolado", INT]]) {
    const p = probe(
      file,
      "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,pix_fmt,profile,level,color_range,color_space,color_transfer,color_primaries,time_base,start_pts,duration",
    );
    const size = statSync(file).size;
    console.log(`### ${label}  (${(size / 1048576).toFixed(1)} MB)`);
    console.log(p.split("\n").map((l) => `  ${l}`).join("\n"));
    console.log();
  }

  const sf = join(TMP, "iqa-src.gray");
  const nf = join(TMP, "iqa-int.gray");
  console.log("extraindo luma...");
  const nSrc = dumpLuma(SRC, sf);
  const nInt = dumpLuma(INT, nf);
  const src = readFileSync(sf);
  const int = readFileSync(nf);
  console.log(`  fonte ${nSrc} frames, interpolado ${nInt} frames  (esperado ~${nSrc * FACTOR})\n`);

  // 1 — alignment of the preserved frames
  const align = [];
  const alignWorst = [];
  const pairs = Math.min(nSrc, Math.floor(nInt / FACTOR));
  for (let k = 0; k < pairs; k++) {
    const v = psnr(frameAt(src, k), frameAt(int, k * FACTOR));
    align.push(Number.isFinite(v) ? v : 99);
    alignWorst.push({ k, v });
  }
  alignWorst.sort((a, b) => a.v - b.v);

  // 2 — nature of the synthesised frames
  const toPrev = [];
  const toNext = [];
  const toBlend = [];
  const acuOrig = [];
  const acuSynth = [];
  const worst = [];
  for (let j = 1; j < nInt - 1; j++) {
    if (j % FACTOR === 0) {
      acuOrig.push(acutance(frameAt(int, j)));
      continue;
    }
    const mid = frameAt(int, j);
    const a = frameAt(int, j - 1);
    const b = frameAt(int, j + 1);
    const pa = psnr(mid, a);
    const pb = psnr(mid, b);
    const pblend = psnrToBlend(mid, a, b);
    const acu = acutance(mid);
    toPrev.push(Number.isFinite(pa) ? pa : 99);
    toNext.push(Number.isFinite(pb) ? pb : 99);
    toBlend.push(Number.isFinite(pblend) ? pblend : 99);
    acuSynth.push(acu);
    worst.push({ j, pa, pb, pblend, acu });
  }

  const aO = acuOrig.reduce((x, y) => x + y, 0) / (acuOrig.length || 1);
  const aS = acuSynth.reduce((x, y) => x + y, 0) / (acuSynth.length || 1);

  console.log("### 1. os frames originais sobreviveram?");
  console.log(`  PSNR de saida[k*${FACTOR}] contra fonte[k], ${pairs} pares`);
  console.log(`  ${JSON.stringify(stats(align))}`);
  console.log(`  piores: ${alignWorst.slice(0, 5).map((x) => `f${x.k}=${x.v}dB`).join("  ")}`);
  console.log(
    `  veredito: ${stats(align).p05 >= 40 ? "PASSA — originais preservados" : "FALHA — os frames originais foram alterados"}\n`,
  );

  console.log("### 2. os frames sintetizados sao reais?");
  console.log(`  PSNR contra o vizinho anterior   ${JSON.stringify(stats(toPrev))}`);
  console.log(`  PSNR contra o vizinho seguinte   ${JSON.stringify(stats(toNext))}`);
  console.log(`  PSNR contra a media dos dois     ${JSON.stringify(stats(toBlend))}`);
  console.log(`  acutancia dos originais          ${aO.toFixed(3)}`);
  console.log(`  acutancia dos sintetizados       ${aS.toFixed(3)}   (${(100 * (aS / aO - 1)).toFixed(1)}%)`);
  const dup = toPrev.filter((v) => v > 45).length + toNext.filter((v) => v > 45).length;
  const blendy = toBlend.filter((v) => v > 38).length;
  console.log(`  quadros praticamente duplicados (>45 dB de um vizinho): ${dup}`);
  console.log(`  quadros praticamente iguais a media (>38 dB): ${blendy} de ${toBlend.length}`);

  /**
   * A near-duplicate is only a defect if it appears where the picture WAS
   * moving. Where nothing moves, an interpolated frame legitimately equals its
   * neighbours and a raw count of high-PSNR frames condemns correct output.
   *
   * So each flagged frame is checked against the motion in its own
   * neighbourhood — the PSNR between the two surrounding ORIGINAL frames. High
   * there means the scene was static and the duplicate is expected; low means
   * the picture was moving and the interpolator failed to follow it.
   */
  const STATIC_DB = 34;
  const flagged = worst.filter((w) => Math.max(w.pa, w.pb) > 45);
  let inStatic = 0;
  const suspicious = [];
  for (const w of flagged) {
    const a = frameAt(int, w.j - 1);
    const b = frameAt(int, w.j + 1);
    const localMotion = psnr(a, b);
    if (localMotion > STATIC_DB) inStatic += 1;
    else suspicious.push({ j: w.j, localMotion: +localMotion.toFixed(1), pa: w.pa, pb: w.pb });
  }
  console.log(
    `  destes, em trecho estatico (vizinhos originais a >${STATIC_DB} dB entre si): ${inStatic} de ${flagged.length}`,
  );
  if (suspicious.length) {
    console.log(
      `  SUSPEITOS (duplicata onde havia movimento): ${suspicious
        .slice(0, 8)
        .map((s) => `f${s.j} mov=${s.localMotion}dB`)
        .join("  ")}`,
    );
  } else {
    console.log("  nenhuma duplicata em trecho com movimento");
  }
  console.log(
    `  veredito: ${
      suspicious.length > toPrev.length * 0.02
        ? "FALHA — duplicacao em trechos com movimento"
        : blendy > toBlend.length * 0.5
          ? "FALHA — e majoritariamente blend, nao compensacao de movimento"
          : aS / aO < 0.9
            ? "ATENCAO — sintetizados perdem mais de 10% de acutancia"
            : "PASSA — movimento compensado, nitidez preservada"
    }\n`,
  );

  // 3 — crops of the frames most likely to show warping, for the eye
  worst.sort((a, b) => a.acu - b.acu);
  const picks = [...new Set(worst.slice(0, 4).map((w) => w.j))];
  console.log("### 3. recortes para inspecao visual (100% de resolucao)");
  const W = probe(SRC, "stream=width").split("=")[1];
  const H = probe(SRC, "stream=height").split("=")[1];
  // Upper band: skyline and window mullions — straight lines are where motion
  // interpolation fails visibly, and averages never show it.
  const cx = Math.round(Number(W) / 2 - 640);
  const cy = Math.round(Number(H) * 0.18);
  for (const j of picks) {
    const t = (j / (24 * FACTOR)).toFixed(4);
    for (const [tag, file] of [["interp", INT]]) {
      const out = join(OUT, `f${String(j).padStart(4, "0")}-${tag}.png`);
      ff(["-y", "-ss", t, "-i", file, "-vf", `crop=1280:720:${cx}:${cy}`, "-frames:v", "1", out]);
    }
    const kPrev = Math.floor(j / FACTOR);
    ff([
      "-y", "-ss", (kPrev / 24).toFixed(4), "-i", SRC,
      "-vf", `crop=1280:720:${cx}:${cy}`, "-frames:v", "1",
      join(OUT, `f${String(j).padStart(4, "0")}-fonte-anterior.png`),
    ]);
    console.log(`  f${j}  acutancia ${worst.find((w) => w.j === j).acu}  -> ${OUT}`);
  }

  writeFileSync(
    join(OUT, "interp-qa.json"),
    JSON.stringify({ align: stats(align), toPrev: stats(toPrev), toNext: stats(toNext), toBlend: stats(toBlend), acuOrig: aO, acuSynth: aS, picks }, null, 2),
  );
};

run();
