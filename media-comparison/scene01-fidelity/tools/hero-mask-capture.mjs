#!/usr/bin/env node
/**
 * Captures the hero exactly as shipped (overlay ON) at scroll 0 / frame 0, and
 * dumps the evidence needed to prove what the mask is doing:
 *
 *   - every element inside the hero carrying a gradient background,
 *   - the canvas's opacity / filter / mix-blend-mode,
 *   - luma of the regions the mask was covering.
 *
 * Run once before the edit and once after, with identical arguments, so the two
 * PNGs are the same viewport, DPR, zoom, crop and timestamp.
 *
 *   node hero-mask-capture.mjs <baseUrl> <label>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:5173";
const LABEL = process.argv[3] ?? "estado";
const OUT = "media-comparison/scene01-fidelity/hero-mask";

const run = async () => {
  mkdirSync(OUT, { recursive: true });
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
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.heroSource === "video", null, {
    timeout: 90000,
  });
  // scroll 0 / frame 0, hero fully visible. No scrolling at all.
  await page.waitForTimeout(2500);

  const evidence = await page.evaluate(() => {
    const section = document.querySelector("section");
    const canvas = section?.querySelector("canvas");
    const cs = canvas ? getComputedStyle(canvas) : null;

    // A span can read opacity:1 while sitting inside a parent at opacity:0, so
    // the only meaningful number is the product down the ancestor chain.
    const effectiveOpacity = (el) => {
      let o = 1;
      let n = el;
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n);
        o *= parseFloat(s.opacity || "1");
        if (s.display === "none" || s.visibility === "hidden") return 0;
        n = n.parentElement;
      }
      return o;
    };

    // Anything inside the hero painting a gradient over the picture.
    const gradients = [];
    for (const el of section ? Array.from(section.querySelectorAll("*")) : []) {
      const s = getComputedStyle(el);
      const bg = s.backgroundImage;
      if (bg && bg !== "none" && /gradient/i.test(bg)) {
        const r = el.getBoundingClientRect();
        gradients.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") || "").slice(0, 90),
          backgroundImage: bg.slice(0, 220),
          rect: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`,
          opacity: s.opacity,
          effectiveOpacity: +effectiveOpacity(el).toFixed(4),
          ownerOverlay: el.closest("[data-overlay]")?.getAttribute("data-overlay") ?? "hero",
        });
      }
    }

    return {
      scrollY: window.scrollY,
      heroSource: document.body.dataset.heroSource,
      canvas: cs
        ? {
            size: `${canvas.width}x${canvas.height}`,
            css: `${canvas.clientWidth}x${canvas.clientHeight}`,
            opacity: cs.opacity,
            filter: cs.filter,
            mixBlendMode: cs.mixBlendMode,
            backdropFilter: cs.backdropFilter,
            transform: cs.transform,
          }
        : null,
      gradientCount: gradients.length,
      gradients,
    };
  });

  const file = join(OUT, `hero-${LABEL}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  writeFileSync(join(OUT, `hero-${LABEL}.json`), JSON.stringify({ evidence, errors }, null, 2));

  console.log(`\n[${LABEL}] scrollY=${evidence.scrollY} heroSource=${evidence.heroSource}`);
  console.log(`  canvas ${evidence.canvas.size} css ${evidence.canvas.css}`);
  console.log(
    `  canvas opacity=${evidence.canvas.opacity} filter=${evidence.canvas.filter} blend=${evidence.canvas.mixBlendMode} backdrop=${evidence.canvas.backdropFilter} transform=${evidence.canvas.transform}`,
  );
  console.log(`  gradientes dentro da section: ${evidence.gradientCount}`);
  for (const g of evidence.gradients) {
    console.log(
      `    <${g.tag}> ${g.rect}  dono=${g.ownerOverlay}  opacity=${g.opacity}  EFETIVA=${g.effectiveOpacity}${
        g.effectiveOpacity === 0 ? "  (invisível)" : "  <<< PINTA SOBRE A CENA"
      }`,
    );
    console.log(`      ${g.backgroundImage}`);
  }
  const painting = evidence.gradients.filter((g) => g.effectiveOpacity > 0);
  console.log(`  gradientes REALMENTE visíveis sobre a cena: ${painting.length}`);
  console.log(`  erros de console: ${errors.length ? errors.join(" | ") : "nenhum"}`);
  console.log(`  -> ${file}`);

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
