#!/usr/bin/env node
/**
 * Contact sheets at the hardest moment of each scene.
 *
 * Averages hide interpolation failures: a clip can score well on acutance and
 * still tear one railing for two frames. So this finds the moment where the
 * picture actually moves the most — the largest frame-to-frame difference in
 * the source — and lays out source[k] / synthesised[2k+1] / source[k+1] at
 * native resolution, which is the only arrangement where a wrong intermediate
 * is obvious: the middle row must sit between the other two, not beside them.
 *
 *   node interp-contact.mjs [--out dir]
 */
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const i = process.argv.indexOf("--out");
const OUT = i > -1 ? process.argv[i + 1] : "media-comparison/interp/contact";
const TMP = process.env.TEMP ?? ".";
const AW = 484;
const AH = 267;

const SCENES = [
  // Crop chosen per scene for structure — straight lines and hard edges, which
  // is where motion interpolation fails visibly. Centre-weighted, native pixels.
  { id: "01", crop: "1280:720:1300:700" },
  { id: "02", crop: "1280:720:1300:700" },
  { id: "03", crop: "1280:720:1290:714" },
  { id: "04", crop: "1280:720:1300:700" },
  { id: "05", crop: "1280:620:1300:1000" },
];

const ff = (a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...a], { maxBuffer: 1 << 28 });

const busiestPair = (src) => {
  const raw = join(TMP, "contact.gray");
  ff(["-y", "-i", src, "-vf", `scale=${AW}:${AH}:flags=bilinear,format=gray`, "-f", "rawvideo", raw]);
  const b = readFileSync(raw);
  const n = statSync(raw).size / (AW * AH);
  let best = 1;
  let bestD = -1;
  for (let k = 1; k < n - 1; k++) {
    const a = b.subarray((k - 1) * AW * AH, k * AW * AH);
    const c = b.subarray(k * AW * AH, (k + 1) * AW * AH);
    let s = 0;
    for (let p = 0; p < a.length; p += 3) s += Math.abs(a[p] - c[p]);
    if (s > bestD) {
      bestD = s;
      best = k - 1;
    }
  }
  return { k: best, n };
};

mkdirSync(OUT, { recursive: true });
for (const s of SCENES) {
  const src = `public/media/web/scene-${s.id}-4k-bt709-tv-gop6.mp4`;
  const int = `media-comparison/interp/out/scene-${s.id}-4k-bt709-tv-48fps.mp4`;
  const { k, n } = busiestPair(src);
  const grab = (file, idx, out) =>
    ff(["-y", "-i", file, "-vf", `select='eq(n\\,${idx})',crop=${s.crop}`, "-fps_mode", "passthrough", "-frames:v", "1", out]);
  const a = join(TMP, `c-${s.id}-a.png`);
  const m = join(TMP, `c-${s.id}-m.png`);
  const c = join(TMP, `c-${s.id}-c.png`);
  grab(src, k, a);
  grab(int, 2 * k + 1, m);
  grab(src, k + 1, c);
  const out = join(OUT, `cena-${s.id}-triptico.png`);
  ff(["-y", "-i", a, "-i", m, "-i", c, "-filter_complex", "[0][1][2]vstack=inputs=3", "-frames:v", "1", out]);
  console.log(
    `cena ${s.id}: maior movimento entre os frames ${k} e ${k + 1} de ${n};` +
      ` sintetizado ${2 * k + 1} -> ${out}`,
  );
}
