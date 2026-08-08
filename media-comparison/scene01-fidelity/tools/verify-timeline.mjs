/**
 * Validates the shipped timeline against the media on disk.
 * Parses the literals out of timeline.ts (no bundler needed) and checks the
 * invariants the scrub controller depends on.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FFPROBE = process.env.FFPROBE || "ffprobe";
const src = readFileSync("src/content/timeline.ts", "utf8");
const fail = [];
const ok = [];

const segBlocks = [...src.matchAll(/\{\s*id: "([a-z0-9]+)",\s*index: (\d+)[\s\S]*?\n  \}/g)];
const segs = segBlocks.map((m) => {
  const b = m[0];
  const num = (k) => {
    const r = new RegExp(`${k}: ([0-9.]+)`).exec(b);
    return r ? Number(r[1]) : null;
  };
  return {
    id: m[1],
    index: Number(m[2]),
    duration: num("duration"),
    frames: num("frames"),
    mediaFrames: num("mediaFrames"),
    offsetFrames: num("offsetFrames") ?? 0,
    globalStart: num("globalStart"),
    globalEnd: num("globalEnd"),
    width: num("width"),
    height: num("height"),
  };
});

const gDur = Number(/GLOBAL_DURATION = ([0-9.]+)/.exec(src)[1]);
const gFrames = Number(/GLOBAL_FRAMES = (\d+)/.exec(src)[1]);
const startFrames = JSON.parse(/SEGMENT_START_FRAME = (\[[^\]]+\])/.exec(src)[1]);
const introOffset = Number(/INTRO_OFFSET_FRAMES = (\d+)/.exec(src)[1]);

const near = (a, b, eps = 0.0001) => Math.abs(a - b) < eps;
const check = (cond, msg) => (cond ? ok.push(msg) : fail.push(msg));

check(segs.length === 5, `5 segmentos encontrados (${segs.length})`);

const sumFrames = segs.reduce((a, s) => a + s.frames, 0);
check(sumFrames === gFrames, `soma frames ${sumFrames} == GLOBAL_FRAMES ${gFrames}`);
check(near(gFrames / 24, gDur, 0.001), `GLOBAL_DURATION ${gDur} == ${gFrames}/24 (${(gFrames / 24).toFixed(6)})`);

let cursor = 0;
segs.forEach((s, i) => {
  check(near(s.globalStart, cursor), `seg${i + 1} globalStart ${s.globalStart} encaixa em ${cursor.toFixed(6)}`);
  check(near(s.globalEnd - s.globalStart, s.duration), `seg${i + 1} duration bate com o intervalo`);
  check(near(s.duration, s.frames / 24, 0.001), `seg${i + 1} duration == frames/24`);
  check(s.mediaFrames === s.frames + s.offsetFrames, `seg${i + 1} mediaFrames == frames + offset`);
  check(startFrames[i] === Math.round(cursor * 24), `seg${i + 1} SEGMENT_START_FRAME ${startFrames[i]}`);
  cursor = s.globalEnd;
});
check(near(cursor, gDur), `fim do ultimo segmento ${cursor} == GLOBAL_DURATION ${gDur}`);
check(segs[0].offsetFrames === introOffset, `seg1 offsetFrames == INTRO_OFFSET_FRAMES (${introOffset})`);

// Overlays
const ovBlocks = [...src.matchAll(/id: "([a-z0-9-]+)",\s*kind: "(narrative|equipment)",\s*globalStart: ([0-9.]+),\s*globalEnd: ([0-9.]+)/g)];
const posOf = (id) => {
  const seg = new RegExp(`id: "${id}"[\\s\\S]*?position: "([a-z-]+)"`).exec(src);
  return seg ? seg[1] : "?";
};
const ovs = ovBlocks.map((m) => ({ id: m[1], start: Number(m[3]), end: Number(m[4]), pos: posOf(m[1]) }));
check(ovs.length > 0, `${ovs.length} overlays encontrados`);
for (const o of ovs) {
  check(o.start >= 0 && o.end <= gDur + 0.0001, `overlay ${o.id} dentro de [0, ${gDur}]`);
  check(o.end > o.start, `overlay ${o.id} tem duracao positiva`);
}
// mesma posicao nao pode sobrepor
const byPos = {};
for (const o of ovs) (byPos[o.pos] ||= []).push(o);
for (const [pos, list] of Object.entries(byPos)) {
  list.sort((a, b) => a.start - b.start);
  for (let i = 1; i < list.length; i++) {
    check(
      list[i].start >= list[i - 1].end - 0.0001,
      `sem sobreposicao em ${pos}: ${list[i - 1].id} termina ${list[i - 1].end} antes de ${list[i].id} ${list[i].start}`,
    );
  }
}

// Media real em disco
const probe = (f, field) =>
  execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", `stream=${field}`, "-of", "csv=p=0", f])
    .toString()
    .trim();

for (const [i, s] of segs.entries()) {
  const n = String(i + 1).padStart(2, "0");
  for (const suffix of ["", "-reverse"]) {
    const f = `public/media/web/scene-${n}-4k-bt709-tv-gop6${suffix}.mp4`;
    if (!existsSync(f)) { fail.push(`ARQUIVO AUSENTE ${f}`); continue; }
    const nb = Number(probe(f, "nb_frames"));
    check(nb === s.mediaFrames, `${f} tem ${nb} frames == mediaFrames ${s.mediaFrames}`);
    const [w, h] = probe(f, "width,height").split(",").map(Number);
    check(w === s.width && h === s.height, `${f} ${w}x${h} == timeline ${s.width}x${s.height}`);
  }
}
const poster = "public/media/web/scene-01-poster-desktop.avif";
check(existsSync(poster), `poster existe: ${poster}`);

console.log(`\n${ok.length} checagens OK`);
if (fail.length) {
  console.log(`\n${fail.length} FALHAS:`);
  for (const f of fail) console.log("  X " + f);
  process.exit(1);
}
console.log("TODOS OS INVARIANTES OK");
for (const s of segs) console.log(`  seg${s.index} ${s.id.padEnd(9)} ${s.globalStart.toFixed(3)} -> ${s.globalEnd.toFixed(3)}  ${s.frames}f  ${s.width}x${s.height}`);
for (const o of ovs) console.log(`  overlay ${o.id.padEnd(20)} ${o.start.toFixed(3)} -> ${o.end.toFixed(3)}  ${o.pos}`);
