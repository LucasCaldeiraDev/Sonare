// Drives the phone journey (MobileNarrative) in a real headless browser and
// reads the `?diag=1` readout while scrolling through the whole pin and part
// of the way back.
//
// WHY THIS EXISTS. The in-app Browser pane never fires requestAnimationFrame,
// so GSAP's ticker — and with it the scrub engine — does not run there: the
// film cannot be exercised in it at all. Playwright's Chromium and WebKit run
// rAF at full rate, and WebKit is the closer of the two to an iPhone.
//
// WHAT IT CANNOT DO. It is not an iPhone. iOS decides on its own whether
// `preload` is honoured and whether play() is permitted, and no desktop engine
// reproduces those policies. So each is EMULATED instead, from the page side,
// as a scenario:
//
//   baseline   nothing overridden.
//   lpm        Low Power Mode — play() rejects with NotAllowedError.
//   metadata   preload capped at metadata — readyState reports at most 1
//              (HAVE_METADATA) until a seek on that element completes.
//   idle       preload refused — readyState 0 / networkState 1 (HAVE_NOTHING,
//              NETWORK_IDLE) until play() is called on that element.
//   slow       Chromium only — a 4 Mbit/s, 150 ms link, so the background
//              fetch and the local-copy swap are watched happening mid-scroll.
//
// A scenario passes when all four scenes become the active track in order,
// the page logs no errors, and the scroll back lands inside scene 02. The
// per-sample timeline printed underneath is for reading what the engine did
// on the way (mode, readyState, playhead per track).
//
// RUNNING IT. Playwright is not a dependency of this project. Point NODE_PATH
// at any install that has it, or add one (`npm i -D playwright` and
// `npx playwright install chromium webkit`). The dev server must be up.
//
//   NODE_PATH=../some-project/node_modules node tools/mobile-scrub-test.mjs chromium all
//   node tools/mobile-scrub-test.mjs webkit lpm
//
//   node tools/mobile-scrub-test.mjs [chromium|webkit] [baseline|lpm|metadata|idle|all] [url]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  const root = execSync("npm root -g").toString().trim();
  pw = require(path.join(root, "playwright"));
}

const browserName = process.argv[2] || "chromium";
const which = process.argv[3] || "all";
const URL = process.argv[4] || "http://localhost:5173/?diag=1";

// The iPhone UA puts the page on the same platform branches a real iPhone
// takes (see isWebKitTouch in MobileNarrative). The scroll here is written
// with window.scrollTo, which the touch governor never sees, so the governor
// is not what this exercises — it is the film, the engine and the loading.
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// Mirrors MOBILE_GLOBAL_DURATION, Journey's settle and MOBILE_SCROLL_VH_PER_SECOND.
const PIN_PX = Math.round((31.333334 + 2) * 0.35 * 844);

const scenarios = {
  baseline: null,
  lpm: () => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        return Promise.reject(new DOMException("play() blocked (simulated LPM)", "NotAllowedError"));
      },
    });
  },
  metadata: () => {
    const real = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState").get;
    const unlocked = new WeakSet();
    document.addEventListener(
      "seeked",
      (e) => {
        if (e.target instanceof HTMLMediaElement) unlocked.add(e.target);
      },
      true,
    );
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get() {
        const v = real.call(this);
        return unlocked.has(this) ? v : Math.min(v, 1);
      },
    });
  },
  idle: () => {
    const rs = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState").get;
    const ns = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "networkState").get;
    const play = HTMLMediaElement.prototype.play;
    const primed = new WeakSet();
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get() {
        return primed.has(this) ? rs.call(this) : 0;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "networkState", {
      configurable: true,
      get() {
        return primed.has(this) ? ns.call(this) : 1;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        primed.add(this);
        return play.call(this);
      },
    });
  },
};

function parse(diag) {
  const lines = (diag || "").split("\n");
  const m = /cena (\d+) local f(\d+)\s+ativa (\d+)/.exec(lines[1] || "");
  const vids = lines
    .filter((l) => /^v\d/.test(l))
    .map((l) => {
      const g = (re) => (re.exec(l) || [])[1];
      return {
        rs: +g(/rs(\d)/),
        t: +g(/ t([\d.]+)/),
        mode: g(/ (idle|play|seek) /),
        rej: +g(/rej(\d+)/),
        pr: +g(/pr(\d+)/),
        sk: +g(/sk(\d+)\//),
        to: +g(/to(\d+)/),
        err: g(/ (ERRO\d|-)$/),
      };
    });
  // "download 1:100%L 2:43% 3:0% 4:0%" — the background fetch and which
  // tracks have been switched to their local copy.
  const dlLine = lines.find((l) => l.startsWith("download")) || "";
  const dl = [...dlLine.matchAll(/(\d):(\d+)%(L?)/g)].map((x) => ({ pct: +x[2], local: x[3] === "L" }));
  return { scene: m ? +m[1] : 0, local: m ? +m[2] : 0, active: m ? +m[3] : 0, vids, dl };
}

/**
 * Chromium only: a throttled link, to watch the background fetch and the
 * local-copy swap happen while the film is being scrolled rather than after.
 * 4 Mbit/s and 150 ms is a poor cellular link; the four files total 11.4 MB,
 * so under it they take about 23 s to arrive.
 */
const SLOW_LINK = { downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8, latency: 150 };

async function run(name) {
  const browser = await pw[browserName].launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: browserName === "chromium",
    hasTouch: true,
    userAgent: IPHONE_UA,
  });
  const errors = [];
  const init = scenarios[name];
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  if (name === "slow") {
    if (browserName !== "chromium") throw new Error("the slow scenario needs Chromium (CDP throttling)");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...SLOW_LINK });
  }
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const diag = async () => parse(await page.evaluate(() => document.querySelector("pre")?.textContent));
  const samples = [];
  const t0 = Date.now();

  // A deliberate scroll through the whole pin: 40 px every 50 ms (~800 px/s,
  // about 2.7x real time on the 35 vh/s runway).
  let y = 0;
  while (y < PIN_PX + 200) {
    y += 40;
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(50);
    if (Math.round(y / 40) % 10 === 0) samples.push({ y, ms: Date.now() - t0, ...(await diag()) });
  }
  await page.waitForTimeout(1500);

  // Then back up to the middle of scene 02 — the seek path, the expensive one.
  const back = Math.round(PIN_PX * 0.4);
  while (y > back) {
    y -= 40;
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1500);
  const end = { y, ms: Date.now() - t0, ...(await diag()) };
  samples.push(end);

  const seen = [...new Set(samples.map((s) => s.active))];
  const pass = seen.join(",") === "1,2,3,4" && end.scene === 2 && end.active === 2 && errors.length === 0;
  console.log(`${pass ? "PASS" : "FAIL"}  active ${seen.join(">")}  end s${end.scene} a${end.active}`);
  console.log(
    "  per track: " +
      end.vids
        .map((v) => `rs${v.rs} rej${v.rej} pr${v.pr} sk${v.sk} to${v.to} ${v.err}`)
        .join(" | "),
  );
  for (const e of errors.slice(0, 5)) console.log("  " + e);
  console.log("  download: " + end.dl.map((d, i) => `${i + 1}:${d.pct}%${d.local ? "L" : ""}`).join(" "));
  console.log("  y      ms      scene   active  local  tracks (rs, t, mode)");
  for (const s of samples) {
    console.log(
      `  ${String(s.y).padStart(5)} ${String(s.ms).padStart(6)}  s${s.scene} f${String(s.local).padStart(3)}  a${s.active}    ` +
        s.dl.map((d) => (d.local ? "L" : d.pct === 100 ? "+" : "-")).join("").padEnd(6) +
        s.vids.map((v) => `rs${v.rs} t${v.t.toFixed(2)} ${v.mode}`).join(" | "),
    );
  }
  await browser.close();
  return pass;
}

const list =
  which === "all" ? [...Object.keys(scenarios), ...(browserName === "chromium" ? ["slow"] : [])] : [which];
let failed = 0;
for (const n of list) {
  console.log(`\n== ${browserName} / ${n}`);
  try {
    if (!(await run(n))) failed += 1;
  } catch (e) {
    failed += 1;
    console.log("FAIL  " + e.message);
  }
}
process.exit(failed ? 1 : 0);
