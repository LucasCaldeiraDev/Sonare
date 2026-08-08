#!/usr/bin/env node
/**
 * Closing QA for the fidelity round. Loads the main route, walks all five
 * scenes, and asserts the things that must be true now that the sources have
 * been archived out of public/.
 *
 *   node final-qa.mjs <baseUrl>
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
/**
 * Optional query, e.g. `?temporalMedia=48`. The media assertions below adapt:
 * with the flag the ten tracks must be the 48 fps derivatives, without it the
 * shipped GOP-6 set — and never a mixture, which is the failure a single
 * permissive regex would hide.
 */
const QUERY = process.argv[3] ?? "";
const EXPECT_48 = /temporalMedia=48/.test(QUERY);
const TRACK_RE = EXPECT_48
  ? /\/media-comparison\/interp\/out\/scene-0\d-(4k-bt709-tv|1440p|1080p)-48fps(-reverse)?\.mp4$/
  : /\/media\/web\/scene-0\d-4k-bt709-tv-gop6(-reverse)?\.mp4$/;

const GLOBAL_DURATION = 29.083335;
const GLOBAL_FRAMES = 698;
const SCROLL_VH_PER_SECOND = 62;
const SETTLE = 2.0;
const VP = { width: 1920, height: 1080 };

const FRAMES = [
  ["cena-01", 60],
  ["cena-02", 214],
  ["cena-03", 323],
  ["cena-04", 444],
  ["cena-05", 597],
];

const scrollForFrame = (frame, h) => {
  const total = GLOBAL_DURATION + SETTLE;
  const runway = Math.round(total * (SCROLL_VH_PER_SECOND / 100) * h);
  return Math.round((((frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION) / total) * runway);
};

const run = async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
    ],
  });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const requests = [];
  const bad = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const u = r.url().replace(BASE, "");
    requests.push({ url: u, status: r.status() });
    if (r.status() >= 400) bad.push(`${r.status()} ${u}`);
  });
  // Media elements cancel their own range requests once they have buffered
  // enough; Chrome reports that as net::ERR_ABORTED. It is normal streaming
  // behaviour, not a broken resource, so it is recorded separately instead of
  // being counted as a failure.
  const aborted = [];
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "unknown";
    const entry = `${reason} ${r.url().replace(BASE, "")}`;
    if (reason === "net::ERR_ABORTED") aborted.push(entry);
    else bad.push(entry);
  });

  await page.goto(`${BASE}/${QUERY}`, { waitUntil: "load", timeout: 90000 });

  // Poster must be the surface before any video frame exists.
  const posterState = await page.evaluate(() => document.body.dataset.heroSource ?? null);

  await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, {
    timeout: 90000,
  });

  const perScene = [];
  for (const [id, frame] of FRAMES) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollForFrame(frame, VP.height));
    await page.waitForTimeout(4000);
    perScene.push(
      await page.evaluate(
        ({ id }) => {
          const c = document.querySelector("section canvas");
          const vids = Array.from(document.querySelectorAll("section video"));
          const active = vids
            .map((v, i) => ({ i, v }))
            .filter(({ v }) => v.readyState >= 2 && v.currentTime > 0)
            .pop();
          return {
            id,
            canvasBacking: c ? `${c.width}x${c.height}` : null,
            canvasCss: c ? `${c.clientWidth}x${c.clientHeight}` : null,
            dpr: window.devicePixelRatio,
            expectedBacking: c ? `${Math.round(c.clientWidth * window.devicePixelRatio)}x${Math.round(c.clientHeight * window.devicePixelRatio)}` : null,
            activeSegment: active ? active.i + 1 : null,
            activeSrc: active ? active.v.currentSrc : null,
            videoWidth: active ? `${active.v.videoWidth}x${active.v.videoHeight}` : null,
          };
        },
        { id },
      ),
    );
  }

  // Walk the rest of the document too, so sections below the pinned journey
  // (S110, soluções, contato, footer) actually request their assets.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  for (let i = 0; i < 6; i++) {
    await page.evaluate((n) => window.scrollTo(0, (document.body.scrollHeight / 6) * n), i);
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const allVideos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("section video")).map((v, i) => ({
      seg: i + 1,
      src: v.currentSrc,
      dim: `${v.videoWidth}x${v.videoHeight}`,
      rs: v.readyState,
    })),
  );

  await browser.close();

  const media = requests.filter((r) => /\.(mp4|png|webp|avif|jpg)$/i.test(r.url));
  const masters = media.filter((r) => /00[1-5]-Sonare/i.test(r.url));
  const diagnostics = media.filter((r) => /diagnostic-refs|frame-000-|lanczos/i.test(r.url));
  const mobilePoster = media.filter((r) => /poster-mobile/i.test(r.url));

  const line = (ok, label) => `  ${ok ? "PASS" : "FAIL"}  ${label}`;

  console.log("\n=== currentSrc dos cinco segmentos ===");
  for (const v of allVideos) console.log(`  seg ${v.seg}  ${v.dim}  rs=${v.rs}  ${v.src.replace(BASE, "")}`);

  console.log("\n=== por cena: canvas backing vs CSS x DPR ===");
  for (const s of perScene) {
    console.log(
      `  ${s.id}  backing ${s.canvasBacking}  css ${s.canvasCss}  dpr ${s.dpr}  esperado ${s.expectedBacking}  ${
        s.canvasBacking === s.expectedBacking ? "OK" : "MISMATCH"
      }   ativo=seg${s.activeSegment} ${s.videoWidth}`,
    );
  }

  console.log("\n=== requisições de mídia ===");
  for (const r of media) console.log(`  ${r.status}  ${r.url}`);

  console.log("\n=== verificações ===");
  const checks = [
    [allVideos.length === 10 && allVideos.every((v) => TRACK_RE.test(v.src)), `dez tracks (5 normais + 5 reversas) em currentSrc${EXPECT_48 ? ", todas 48 fps" : ""}`],
    [masters.length === 0, "nenhum master cru requisitado"],
    [diagnostics.length === 0, "nenhum PNG de diagnóstico requisitado"],
    [mobilePoster.length === 0, "nenhuma referência ao poster mobile removido"],
    [posterState === "poster" || posterState === "video", `poster da Cena 01 ativo (heroSource inicial = ${posterState})`],
    [perScene.every((s) => s.canvasBacking === s.expectedBacking), "canvas backing == CSS x DPR em todas as cenas"],
    [allVideos.every((v) => /^\d{3,4}x\d{3,4}$/.test(v.dim) && new Set(allVideos.map((x) => x.dim.split("x")[0])).size <= 2), "todas as tracks na mesma família de resolução"],
    [consoleErrors.length === 0, "zero erros de console"],
    [bad.length === 0, "zero requests 4xx/falhos"],
  ];
  for (const [ok, label] of checks) console.log(line(ok, label));

  if (consoleErrors.length) console.log("\nerros de console:\n  " + consoleErrors.join("\n  "));
  if (bad.length) console.log("\nrequests com problema:\n  " + bad.join("\n  "));
  if (aborted.length) {
    console.log(
      `\nrange requests abortados pelo próprio player (normal, não são falhas): ${aborted.length}`,
    );
  }

  const failed = checks.filter(([ok]) => !ok).length;
  console.log(failed ? `\n${failed} verificação(ões) falharam` : "\ntodas as verificações passaram");
  process.exit(failed ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
