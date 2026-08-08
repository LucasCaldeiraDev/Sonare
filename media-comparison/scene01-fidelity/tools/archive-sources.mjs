#!/usr/bin/env node
/**
 * Moves the unreferenced source files out of public/ so Vite stops copying them
 * into dist, without ever putting a file at risk.
 *
 * Order of operations is deliberate:
 *   1. hash in place,
 *   2. refuse to start if anything is missing or a destination already exists,
 *   3. rename (same volume — no bytes copied, nothing duplicated),
 *   4. hash again and compare.
 *
 * A rename that fails leaves the original untouched; a rename that succeeds is
 * verified before the run is called clean. Nothing is ever deleted.
 *
 *   node archive-sources.mjs [--apply]      (dry run without --apply)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

const MASTERS = [
  "001-Sonare-Cena 01 completa.mp4",
  "002-Sonare-Cena 02.mp4",
  "003-Sonare-Cena-03.mp4",
  "004-Sonare-Cena-04.mp4",
  "005-Sonare-Cena-05.mp4",
];

const STILLS = [
  "Cena 01.png",
  "Cena 02 end.png",
  "cena 01 end.png",
  "cena 03 end frame.png",
  "cena 04 end frame.png",
  "cena 04(usado como referencia).png",
  "cena 05 end frame.png",
];

const DEST_MASTERS = "media-comparison/source-archive/masters";
const DEST_STILLS = "media-comparison/source-archive/stills";

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

const plan = [
  ...MASTERS.map((f) => ({ from: join("public/media", f), to: join(DEST_MASTERS, f), kind: "master" })),
  ...STILLS.map((f) => ({ from: join("public/media", f), to: join(DEST_STILLS, f), kind: "still" })),
];

// ── preflight ───────────────────────────────────────────────────────────────
const problems = [];
for (const item of plan) {
  if (!existsSync(item.from)) problems.push(`missing source: ${item.from}`);
  if (existsSync(item.to)) problems.push(`destination already exists: ${item.to}`);
}
if (problems.length) {
  console.error("REFUSING TO RUN:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(`root: ${ROOT}\n`);
console.log(`${plan.length} files to archive (${APPLY ? "APPLY" : "DRY RUN"})\n`);

// ── hash in place ───────────────────────────────────────────────────────────
for (const item of plan) {
  item.size = statSync(item.from).size;
  item.before = sha256(item.from);
}

if (!APPLY) {
  for (const i of plan) {
    console.log(`  ${basename(i.from).padEnd(38)} ${String(i.size).padStart(10)}  ${i.before.slice(0, 16)}…`);
  }
  console.log("\ndry run — nothing moved. re-run with --apply");
  process.exit(0);
}

mkdirSync(DEST_MASTERS, { recursive: true });
mkdirSync(DEST_STILLS, { recursive: true });

// ── move + verify ───────────────────────────────────────────────────────────
let failed = 0;
for (const item of plan) {
  renameSync(item.from, item.to);
  item.after = sha256(item.to);
  item.sizeAfter = statSync(item.to).size;
  const ok = item.after === item.before && item.sizeAfter === item.size;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "OK  " : "FAIL"} ${basename(item.to).padEnd(38)} ${String(item.size).padStart(10)}  ${item.before.slice(0, 16)}… -> ${item.after.slice(0, 16)}…`,
  );
}

// ── report duplicate copies that already existed ────────────────────────────
console.log("\nchecking media-comparison/current-masters for pre-existing copies:");
for (const f of MASTERS) {
  const dup = join("media-comparison/current-masters", f);
  if (!existsSync(dup)) {
    console.log(`  ${f.padEnd(38)} no copy there`);
    continue;
  }
  const h = sha256(dup);
  const orig = plan.find((p) => basename(p.to) === f);
  console.log(`  ${f.padEnd(38)} ${h === orig.after ? "IDENTICAL duplicate" : "DIFFERENT content"}`);
}

console.log(
  failed
    ? `\n*** ${failed} file(s) failed verification ***`
    : `\nall ${plan.length} archived and verified — SHA-256 unchanged, nothing deleted`,
);
process.exit(failed ? 1 : 0);
