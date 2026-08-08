#!/usr/bin/env node
/**
 * Validates the tv/limited candidates against the full remuxes and the masters.
 *
 * Frames are pulled straight from the files at the site's own cover crop, so
 * the comparison does not depend on scroll timing or damping. ffmpeg picks the
 * decode from each file's own tags: `full` -> pc, `tv` -> tv, master (untagged)
 * -> tv by default. If the tv tag reproduces the approved look, the tv frame and
 * the master frame must come out byte-identical.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "media-comparison/scene01-fidelity/tv-validation";
const A = "media-comparison/source-archive/masters";
const W = "public/media/web";

/** Representative frame per scene, chosen for the elements under review. */
const SCENES = [
  { n: "01", master: "001-Sonare-Cena 01 completa.mp4", frame: 0, w: 3876, h: 2136,
    look: "estrelas e luzes da fachada",
    regions: "250,80,300,140,ceu-estrelas 1480,80,180,100,fachada-luz 850,860,200,100,luzes-caminho" },
  { n: "02", master: "002-Sonare-Cena 02.mp4", frame: 48, w: 3876, h: 2136,
    look: "tela de projecao e caixas B&W",
    regions: "120,90,420,300,tela-projecao 300,330,120,150,caixa-bw-esq 1200,560,160,200,caixa-bw-dir" },
  { n: "03", master: "003-Sonare-Cena-03.mp4", frame: 90, w: 3856, h: 2148,
    look: "textos e icones do S110",
    regions: "560,560,320,180,s110-tela 640,720,260,90,s110-icones 1400,300,200,200,parede" },
  { n: "04", master: "004-Sonare-Cena-04.mp4", frame: 90, w: 3876, h: 2136,
    look: "iluminacao da area gourmet",
    regions: "300,200,300,160,sanca-luz 1000,600,260,180,bancada 1500,750,240,200,marcenaria" },
  { n: "05", master: "005-Sonare-Cena-05.mp4", frame: 150, w: 3876, h: 2136,
    look: "luzes do skyline",
    regions: "700,600,400,180,skyline 300,300,260,220,cortina 1400,850,300,150,piso" },
];

const cropFor = (w, h) => {
  // cover into 1920x1080, centred — the same rectangle computeGeometry produces.
  const sw = Math.round(h * (16 / 9));
  return `crop=${sw}:${h}:${Math.round((w - sw) / 2)}:0,scale=1920:1080:flags=lanczos+accurate_rnd`;
};

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

mkdirSync(OUT, { recursive: true });

const rows = [];
let tvMatchesMaster = true;

for (const s of SCENES) {
  const variants = {
    full: `${W}/scene-${s.n}-4k-bt709-full.mp4`,
    tv: `${W}/scene-${s.n}-4k-bt709-tv.mp4`,
    master: `${A}/${s.master}`,
  };
  const files = {};
  for (const [k, src] of Object.entries(variants)) {
    const out = join(OUT, `cena-${s.n}-${k}.png`);
    execFileSync("ffmpeg", [
      "-hide_banner", "-v", "error", "-y", "-i", src,
      "-vf", `select=eq(n\\,${s.frame}),${cropFor(s.w, s.h)}`,
      "-fps_mode", "passthrough", "-frames:v", "1", out,
    ]);
    execFileSync("node", ["media-comparison/scene01-fidelity/tools/strip-png-color.mjs", out], {
      stdio: "ignore",
    });
    files[k] = out;
  }

  const identical = sha(files.tv) === sha(files.master);
  if (!identical) tvMatchesMaster = false;

  console.log(`\n${"=".repeat(76)}`);
  console.log(`CENA ${s.n} — frame ${s.frame} — ${s.look}`);
  console.log(`  tv == master (pixel a pixel): ${identical ? "SIM" : "*** NAO ***"}`);

  for (const k of ["full", "tv", "master"]) {
    const txt = execFileSync(
      "node",
      ["media-comparison/scene01-fidelity/tools/analyze.mjs", files[k], "--regions",
       ...s.regions.split(" ")],
      { encoding: "utf8" },
    );
    const luma = txt.match(/luma\s+(.*)/)?.[1] ?? "";
    const crush = txt.match(/crush\s+(.*)/)?.[1] ?? "";
    const regions = [...txt.matchAll(/region (\S+)\s+luma=\s*([\d.]+)/g)].map(
      (m) => `${m[1]}=${m[2]}`,
    );
    console.log(`  ${k.padEnd(7)} ${luma}`);
    console.log(`          ${crush}`);
    console.log(`          ${regions.join("  ")}`);
    rows.push({ scene: s.n, variant: k, crush });
  }
}

console.log(`\n${"=".repeat(76)}`);
console.log(
  tvMatchesMaster
    ? "TODAS AS CINCO: o frame do tv e byte-identico ao frame do master untagged."
    : "*** alguma cena difere do master ***",
);
process.exit(tvMatchesMaster ? 0 : 1);
