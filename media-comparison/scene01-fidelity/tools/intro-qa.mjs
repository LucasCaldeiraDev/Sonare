#!/usr/bin/env node
/**
 * QA for the frame-3 intro offset: 5 cold-cache loads and 5 warm.
 *
 * Each run watches the canvas continuously from before the app boots and
 * asserts the handover is clean:
 *   - exactly two visual states, poster then video, never a third;
 *   - no black frame at any point;
 *   - the video settles on media time (3 + 0.5)/24 and nothing else;
 *   - poster and video agree on luma within a small tolerance.
 *
 *   node intro-qa.mjs <baseUrl> [runs]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const RUNS = Number(process.argv[3] ?? 5);
const OUT = "media-comparison/scene01-fidelity/intro-qa";
const INTRO_TIME = 3.5 / 24; // 0.1458333

const RECORDER = () => {
  const w = window;
  w.__qa = { t0: performance.now(), states: [], black: 0, samples: 0 };
  let lastHash = null;
  const tick = () => {
    const c = document.querySelector("section canvas");
    if (c && c.width) {
      try {
        const ctx = c.getContext("2d");
        const d = ctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
        let sum = 0;
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          h = Math.imul(h ^ d[i], 16777619) >>> 0;
        }
        const luma = sum / (d.length / 4);
        w.__qa.samples += 1;
        if (luma < 1) w.__qa.black += 1;
        const key = document.body.dataset.heroSource + ":" + h.toString(16);
        if (key !== lastHash) {
          lastHash = key;
          const v = document.querySelector("section video");
          w.__qa.states.push({
            t: +(performance.now() - w.__qa.t0).toFixed(1),
            source: document.body.dataset.heroSource ?? null,
            luma: +luma.toFixed(3),
            currentTime: v ? +v.currentTime.toFixed(5) : null,
          });
        }
      } catch { /* not ready */ }
    }
  };
  const id = setInterval(() => {
    tick();
    if (performance.now() - w.__qa.t0 > 10000) clearInterval(id);
  }, 16);
};

const HIDE = "header,.skip-link,.z-30,.z-40{display:none !important}";

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    ],
  });

  const all = [];
  // One context for the warm runs so the HTTP cache actually survives between
  // them; the cold runs each get a fresh one with the cache disabled.
  const warmCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  for (const mode of ["frio", "quente"]) {
    for (let i = 1; i <= RUNS; i++) {
      const ctx =
        mode === "quente"
          ? warmCtx
          : await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.addInitScript(RECORDER);
      await page.addInitScript(([css]) => {
        window.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        });
      }, [HIDE]);

      if (mode === "frio") {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      }

      await page.goto(BASE, { waitUntil: "load", timeout: 90000 });
      await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, { timeout: 60000 });
      await page.waitForTimeout(1200);

      const qa = await page.evaluate(() => window.__qa);
      const ct = await page.evaluate(() => document.querySelector("section video").currentTime);

      // Only the first cold run keeps images; ten copies prove nothing extra.
      if (mode === "frio" && i === 1) {
        await page.screenshot({ path: join(OUT, "B-corrigido-scroll0.png") });
        await page.evaluate(() => window.scrollTo(0, 40));
        await page.waitForTimeout(1600);
        await page.screenshot({ path: join(OUT, "B2-corrigido-apos-scroll.png") });
      }

      const states = qa.states.filter((s) => s.source);
      const sources = [...new Set(states.map((s) => s.source))];
      all.push({
        mode, run: i,
        states: states.length,
        sequence: sources.join(" -> "),
        posterLuma: states.find((s) => s.source === "poster")?.luma ?? null,
        videoLuma: states.filter((s) => s.source === "video").pop()?.luma ?? null,
        firstVideoAt: states.find((s) => s.source === "video")?.t ?? null,
        currentTime: +ct.toFixed(5),
        blackSamples: qa.black,
        errors: errors.length,
      });
      await page.close();
      if (mode === "frio") await ctx.close();
    }
  }

  await warmCtx.close();
  await browser.close();
  writeFileSync(join(OUT, "qa.json"), JSON.stringify(all, null, 2));

  console.log("\nmodo    run  estados  sequência          poster    vídeo   Δluma   vídeo@ms   currentTime   preto  erros");
  console.log("-".repeat(112));
  let pass = true;
  for (const r of all) {
    const d = r.posterLuma != null && r.videoLuma != null ? r.videoLuma - r.posterLuma : null;
    const ctOk = Math.abs(r.currentTime - INTRO_TIME) < 1e-4;
    const ok = r.sequence === "poster -> video" && r.blackSamples === 0 && r.errors === 0 && ctOk;
    if (!ok) pass = false;
    console.log(
      `${r.mode.padEnd(8)}${String(r.run).padStart(3)}${String(r.states).padStart(9)}  ${r.sequence.padEnd(18)}` +
        `${String(r.posterLuma ?? "—").padStart(8)}${String(r.videoLuma ?? "—").padStart(9)}` +
        `${(d == null ? "—" : d.toFixed(3)).padStart(8)}${String(r.firstVideoAt ?? "—").padStart(11)}` +
        `${String(r.currentTime).padStart(14)}${ctOk ? "" : " ✗"}${String(r.blackSamples).padStart(7)}${String(r.errors).padStart(7)}`,
    );
  }
  console.log(
    `\n  currentTime esperado: ${INTRO_TIME.toFixed(5)}  (frame 3, centro temporal)\n` +
      (pass
        ? "  TODAS AS EXECUÇÕES: poster -> vídeo, sem terceiro estado, sem tela preta, sem erro."
        : "  *** alguma execução falhou ***"),
  );
  process.exit(pass ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
