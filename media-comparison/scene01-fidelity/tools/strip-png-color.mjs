#!/usr/bin/env node
/**
 * Removes colour-management chunks from a PNG.
 *
 * ffmpeg stamps cICP=1,1,0,1 (BT.709 *transfer*) and gAMA=0.45455 onto anything
 * it writes from a frame tagged bt709. Chrome honours cICP and converts BT.709
 * transfer to the display space, which darkens shadows hard on a night scene —
 * measured at -10.9 luma on frame 0. The video path does not get that treatment,
 * so a tagged still and the video would never match.
 *
 * Stripping leaves the PNG untagged, which every browser reads as sRGB: the same
 * space the decoded video ends up in. Chunk CRCs are per-chunk, so dropping whole
 * chunks needs no recompute.
 *
 *   node strip-png-color.mjs <file...>
 */
import { readFileSync, writeFileSync } from "node:fs";

const DROP = new Set(["cICP", "gAMA", "cHRM", "iCCP", "sRGB"]);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let changed = 0;
for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) {
    console.error(`  ${file}: not a PNG, skipped`);
    continue;
  }
  const keep = [SIG];
  const dropped = [];
  let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const end = o + 12 + len;
    if (DROP.has(type)) dropped.push(type);
    else keep.push(buf.subarray(o, end));
    o = end;
    if (type === "IEND") break;
  }
  if (!dropped.length) continue;
  writeFileSync(file, Buffer.concat(keep));
  changed++;
  console.log(`  ${file.split(/[\\/]/).pop()}  dropped ${dropped.join(", ")}`);
}
console.log(`${changed} file(s) stripped`);
