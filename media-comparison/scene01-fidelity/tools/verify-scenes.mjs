#!/usr/bin/env node
/**
 * Proves every remux is a container-only change.
 *
 * For each master/remux pair it reports the full stream description plus two
 * independent hashes:
 *
 *   elementary MD5  the raw H.264 Annex-B bytes. Identical => not re-encoded,
 *                   not re-quantised, not even re-packetised.
 *   framemd5        the DECODED frames. Identical => every pixel of every frame
 *                   comes out the same, which is the guarantee that actually
 *                   matters for the picture.
 *
 * Colour tags live in the container, so they change the second table without
 * touching either hash. That is the whole point of the operation.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { createHash } from "node:crypto";

// Masters live outside public/ since the archive pass — Vite copies publicDir
// wholesale into dist, and nothing on the site references them any more.
const ARCHIVE = "media-comparison/source-archive/masters";

const PAIRS = [
  [`${ARCHIVE}/001-Sonare-Cena 01 completa.mp4`, "public/media/web/scene-01-4k-bt709-full.mp4"],
  [`${ARCHIVE}/002-Sonare-Cena 02.mp4`, "public/media/web/scene-02-4k-bt709-full.mp4"],
  [`${ARCHIVE}/003-Sonare-Cena-03.mp4`, "public/media/web/scene-03-4k-bt709-full.mp4"],
  [`${ARCHIVE}/004-Sonare-Cena-04.mp4`, "public/media/web/scene-04-4k-bt709-full.mp4"],
  [`${ARCHIVE}/005-Sonare-Cena-05.mp4`, "public/media/web/scene-05-4k-bt709-full.mp4"],
];

const probe = (f) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries",
       "stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,duration,bit_rate,color_range,color_primaries,color_transfer,color_space",
       "-of", "json", f],
      { encoding: "utf8" },
    ),
  ).streams[0];

/** MD5 of the H.264 elementary stream, container stripped. */
const elementaryMd5 = (f) => {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", f, "-map", "0:v", "-c", "copy", "-f", "h264", "-"], {
    maxBuffer: 1 << 30,
  });
  return createHash("md5").update(buf).digest("hex");
};

/** MD5 over every per-frame checksum ffmpeg emits for the decoded output. */
const decodedMd5 = (f) => {
  const out = execFileSync("ffmpeg", ["-v", "error", "-i", f, "-map", "0:v", "-f", "framemd5", "-"], {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  const lines = out.split("\n").filter((l) => l && !l.startsWith("#"));
  return { md5: createHash("md5").update(lines.join("\n")).digest("hex"), frames: lines.length };
};

const rows = [];
let allIdentical = true;

for (const [master, remux] of PAIRS) {
  const a = probe(master);
  const b = probe(remux);
  const ea = elementaryMd5(master);
  const eb = elementaryMd5(remux);
  const da = decodedMd5(master);
  const db = decodedMd5(remux);
  const ok = ea === eb && da.md5 === db.md5 && da.frames === db.frames;
  if (!ok) allIdentical = false;

  rows.push({ master, remux, a, b, ea, eb, da, db, ok,
    sizeA: statSync(master).size, sizeB: statSync(remux).size });

  const n = master.split("/").pop();
  console.log(`\n${"=".repeat(78)}\n${n}\n  -> ${remux.split("/").pop()}`);
  console.log(`  size          ${a && statSync(master).size} -> ${statSync(remux).size}  (${statSync(remux).size - statSync(master).size >= 0 ? "+" : ""}${statSync(remux).size - statSync(master).size} bytes)`);
  console.log(`  resolution    ${a.width}x${a.height} -> ${b.width}x${b.height}`);
  console.log(`  duration      ${a.duration} -> ${b.duration}`);
  console.log(`  frames        ${a.nb_frames} -> ${b.nb_frames}   (framemd5 rows ${da.frames} -> ${db.frames})`);
  console.log(`  fps           ${a.r_frame_rate} -> ${b.r_frame_rate}   (avg ${a.avg_frame_rate} -> ${b.avg_frame_rate})`);
  console.log(`  codec         ${a.codec_name}/${a.profile}@L${a.level} ${a.pix_fmt} -> ${b.codec_name}/${b.profile}@L${b.level} ${b.pix_fmt}`);
  console.log(`  bitrate       ${a.bit_rate} -> ${b.bit_rate}`);
  console.log(`  color_range   ${a.color_range ?? "UNSET"} -> ${b.color_range ?? "UNSET"}`);
  console.log(`  primaries     ${a.color_primaries ?? "UNSET"} -> ${b.color_primaries ?? "UNSET"}`);
  console.log(`  transfer      ${a.color_transfer ?? "UNSET"} -> ${b.color_transfer ?? "UNSET"}`);
  console.log(`  matrix        ${a.color_space ?? "UNSET"} -> ${b.color_space ?? "UNSET"}`);
  console.log(`  elementary    ${ea}`);
  console.log(`                ${eb}   ${ea === eb ? "IDENTICAL" : "*** DIFFERENT ***"}`);
  console.log(`  framemd5      ${da.md5}`);
  console.log(`                ${db.md5}   ${da.md5 === db.md5 ? "IDENTICAL" : "*** DIFFERENT ***"}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log(allIdentical
  ? "ALL FIVE: elementary stream and decoded frames bit-identical. Container only."
  : "*** MISMATCH — at least one file changed its video content ***");
process.exit(allIdentical ? 0 : 1);
