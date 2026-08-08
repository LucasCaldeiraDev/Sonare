#!/usr/bin/env node
/**
 * Pixel-truth analyser for the scene-01 fidelity audit.
 *
 * Decodes any image/video-frame to raw rgb24 through ffmpeg (no JS png decoder,
 * no dependency) and reports the numbers the audit actually needs: real
 * dimensions, per-channel range, Rec.709 luma statistics, shadow crush and
 * highlight clipping counts, and the luma percentile curve.
 *
 *   node analyze.mjs <file> [--json] [--regions <x,y,w,h,name> ...]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error("usage: node analyze.mjs <file> [--json] [--regions x,y,w,h,name ...]");
  process.exit(1);
}
const asJson = args.includes("--json");

/** Named rectangles sampled separately, e.g. sky / stone / vegetation. */
const regions = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--regions") {
    for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) {
      const [x, y, w, h, ...name] = args[j].split(",");
      regions.push({ x: +x, y: +y, w: +w, h: +h, name: name.join(",") || `r${regions.length}` });
    }
  }
}

function probe(f) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries",
     "stream=width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,nb_frames,r_frame_rate,codec_name,bit_rate",
     "-of", "json", f],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  return JSON.parse(out).streams[0];
}

const meta = probe(file);
const W = meta.width;
const H = meta.height;

// Raw rgb24. For stills this is exact; the PNG is already RGB so no colour
// conversion happens here and the numbers are the file's own pixels.
const raw = execFileSync(
  "ffmpeg",
  ["-v", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
  { maxBuffer: 1 << 30 },
);

const px = W * H;
if (raw.length < px * 3) {
  console.error(`short read: got ${raw.length}, expected ${px * 3}`);
  process.exit(1);
}

const lumaHist = new Uint32Array(256);
const chan = [
  { min: 255, max: 0, sum: 0 },
  { min: 255, max: 0, sum: 0 },
  { min: 255, max: 0, sum: 0 },
];
let blackPx = 0; // all three channels exactly 0 — unrecoverable crush
let nearBlackPx = 0; // luma <= 2
let clippedPx = 0; // any channel at 255
let lumaSum = 0;
let lumaMin = 255;
let lumaMax = 0;

for (let i = 0; i < px; i++) {
  const o = i * 3;
  const r = raw[o];
  const g = raw[o + 1];
  const b = raw[o + 2];
  if (r < chan[0].min) chan[0].min = r;
  if (r > chan[0].max) chan[0].max = r;
  if (g < chan[1].min) chan[1].min = g;
  if (g > chan[1].max) chan[1].max = g;
  if (b < chan[2].min) chan[2].min = b;
  if (b > chan[2].max) chan[2].max = b;
  chan[0].sum += r;
  chan[1].sum += g;
  chan[2].sum += b;
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
  lumaHist[y]++;
  lumaSum += y;
  if (y < lumaMin) lumaMin = y;
  if (y > lumaMax) lumaMax = y;
  if (r === 0 && g === 0 && b === 0) blackPx++;
  if (y <= 2) nearBlackPx++;
  if (r === 255 || g === 255 || b === 255) clippedPx++;
}

function percentile(p) {
  const want = px * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += lumaHist[v];
    if (acc >= want) return v;
  }
  return 255;
}

function regionStats(rg) {
  let sum = 0;
  let n = 0;
  const rgb = [0, 0, 0];
  for (let y = rg.y; y < Math.min(rg.y + rg.h, H); y++) {
    for (let x = rg.x; x < Math.min(rg.x + rg.w, W); x++) {
      const o = (y * W + x) * 3;
      rgb[0] += raw[o];
      rgb[1] += raw[o + 1];
      rgb[2] += raw[o + 2];
      sum += 0.2126 * raw[o] + 0.7152 * raw[o + 1] + 0.0722 * raw[o + 2];
      n++;
    }
  }
  return {
    name: rg.name,
    rect: [rg.x, rg.y, rg.w, rg.h],
    luma: +(sum / n).toFixed(2),
    rgb: rgb.map((v) => +(v / n).toFixed(1)),
  };
}

const report = {
  file,
  sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  container: {
    width: W,
    height: H,
    pix_fmt: meta.pix_fmt,
    codec: meta.codec_name,
    color_range: meta.color_range ?? null,
    color_space: meta.color_space ?? null,
    color_primaries: meta.color_primaries ?? null,
    color_transfer: meta.color_transfer ?? null,
  },
  luma: {
    min: lumaMin,
    max: lumaMax,
    mean: +(lumaSum / px).toFixed(3),
    p01: percentile(0.01),
    p05: percentile(0.05),
    p10: percentile(0.1),
    p50: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
  },
  channels: {
    r: { min: chan[0].min, max: chan[0].max, mean: +(chan[0].sum / px).toFixed(3) },
    g: { min: chan[1].min, max: chan[1].max, mean: +(chan[1].sum / px).toFixed(3) },
    b: { min: chan[2].min, max: chan[2].max, mean: +(chan[2].sum / px).toFixed(3) },
  },
  crush: {
    absoluteBlackPx: blackPx,
    absoluteBlackPct: +((blackPx / px) * 100).toFixed(4),
    lumaLE2Px: nearBlackPx,
    lumaLE2Pct: +((nearBlackPx / px) * 100).toFixed(4),
    clippedPx,
    clippedPct: +((clippedPx / px) * 100).toFixed(4),
  },
  // Coarse 16-bucket shape, enough to see a curve shift without a chart.
  histogram16: Array.from({ length: 16 }, (_, b) => {
    let s = 0;
    for (let v = b * 16; v < b * 16 + 16; v++) s += lumaHist[v];
    return +((s / px) * 100).toFixed(3);
  }),
  regions: regions.map(regionStats),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const c = report.container;
  console.log(`\n${file}`);
  console.log(`  ${W}x${H}  ${c.codec}/${c.pix_fmt}  range=${c.color_range ?? "UNSET"} prim=${c.color_primaries ?? "UNSET"} trc=${c.color_transfer ?? "UNSET"} mtx=${c.color_space ?? "UNSET"}`);
  console.log(`  sha256 ${report.sha256.slice(0, 32)}…`);
  const l = report.luma;
  console.log(`  luma   min=${l.min} p01=${l.p01} p05=${l.p05} p10=${l.p10} p50=${l.p50} p90=${l.p90} p99=${l.p99} max=${l.max} mean=${l.mean}`);
  const ch = report.channels;
  console.log(`  R ${ch.r.min}-${ch.r.max} µ${ch.r.mean}   G ${ch.g.min}-${ch.g.max} µ${ch.g.mean}   B ${ch.b.min}-${ch.b.max} µ${ch.b.mean}`);
  const cr = report.crush;
  console.log(`  crush  pure-black ${cr.absoluteBlackPct}%  luma<=2 ${cr.lumaLE2Pct}%  clipped ${cr.clippedPct}%`);
  console.log(`  hist16 ${report.histogram16.join(" ")}`);
  for (const r of report.regions) {
    console.log(`  region ${r.name.padEnd(14)} luma=${String(r.luma).padStart(7)}  rgb=${r.rgb.join("/")}`);
  }
}
