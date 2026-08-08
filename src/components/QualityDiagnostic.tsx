import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeGeometry, type Fit, type Geometry } from "../lib/coverGeometry";
import { createGLSurface, type GLQuality, type GLSurface } from "../lib/videoGL";

/**
 * /quality-diagnostic — the controlled A/B bench for scene 01.
 *
 * Deliberately contains NOTHING that could flatter or punish a renderer: no
 * navbar, no hero, no overlay, no scrim, no gradient, no GSAP, no ScrollTrigger,
 * no Lenis, no CSS filter, no backdrop-filter, no animation, and no transform at
 * all while zoom is 100%. The four surfaces are stacked at identical size and
 * fed identical geometry from computeGeometry(), so the only variable left is
 * how each one resamples.
 *
 * Every control is mirrored in the query string, which is what makes the
 * Playwright captures reproducible rather than anecdotal.
 */

type Mode = "A" | "B" | "C" | "D";
type View = "single" | "split" | "slider";
type RefSource = "native" | "lanczos";
/**
 * `full` and `tv` are the SAME H.264 bitstream (elementary MD5
 * f98db8eb5e9687724cfb989897f2001d) differing only in the container's range
 * tag. `master` is the original, untagged, which every player renders as `tv`
 * by default — so master and tv look identical and are both here on purpose:
 * master proves what the untagged default does, tv makes that default explicit.
 */
type VideoSource = "remux" | "tv" | "master";
type Smoothing = "low" | "medium" | "high";

/**
 * The untagged master, kept only as the "before" side of the colour A/B. It now
 * lives in the source archive outside public/, so this URL resolves from the dev
 * server's project root and does not exist in a production build — which is fine,
 * because this whole route is development-only.
 */
const MASTER_SRC = "/media-comparison/source-archive/masters/001-Sonare-Cena%2001%20completa.mp4";
/**
 * `tv` is what production serves. `full` is kept only as the other side of the
 * range A/B and lives in the source archive outside public/, so it resolves
 * from the dev server's project root and never reaches the bundle.
 */
const TV_SRC = "/media/web/scene-01-4k-bt709-tv.mp4";
const REMUX_SRC =
  "/media-comparison/source-archive/remux-full/scene-01-4k-bt709-full.mp4";
/**
 * Reference stills live outside public/ so the ~27 MB of diagnostic PNGs never
 * reach the production bundle. Vite's dev server serves the project root, so
 * this path resolves while developing and 404s in a built deploy — which is
 * correct: /quality-diagnostic is a dev-only route.
 */
const REF_NATIVE = "/diagnostic-refs/frame-000-fullrange.png";

const FRAMES = [0, 1, 12, 24];
const FPS = 24;

const MODE_LABEL: Record<Mode, string> = {
  A: "A · PNG REFERENCE",
  B: "B · NATIVE VIDEO",
  C: "C · CANVAS 2D",
  D: "D · WEBGL",
};

function lanczosRefFor(fit: Fit, w: number, h: number) {
  return `/diagnostic-refs/frame-000-lanczos-${fit}-${w}x${h}.png`;
}

/** URL is the single source of truth so a capture can be replayed byte for byte. */
function readParams() {
  const q = new URLSearchParams(window.location.search);
  const one = <T extends string>(k: string, allowed: readonly T[], dflt: T): T => {
    const v = q.get(k) as T | null;
    return v && allowed.includes(v) ? v : dflt;
  };
  return {
    mode: one<Mode>("mode", ["A", "B", "C", "D"], "B"),
    secondary: one<Mode>("b", ["A", "B", "C", "D"], "C"),
    view: one<View>("view", ["single", "split", "slider"], "single"),
    fit: one<Fit>("fit", ["cover", "contain", "none"], "cover"),
    // Any frame of scene 01, not just the four preset buttons — the motion
    // bench steps through arbitrary positions.
    frame: (() => {
      const f = Number(q.get("frame"));
      return Number.isInteger(f) && f >= 0 && f <= 168 ? f : 0;
    })(),
    /** Real playback with per-frame telemetry, for the motion comparison. */
    motion: q.get("motion") === "1",
    zoom: [1, 2, 4].includes(Number(q.get("zoom"))) ? Number(q.get("zoom")) : 1,
    ui: q.get("ui") !== "0",
    smoothing: one<Smoothing>("sq", ["low", "medium", "high"], "high"),
    alpha: q.get("alpha") === "1",
    desync: q.get("desync") !== "0",
    dpr: [1, 1.25, 1.5, 2].includes(Number(q.get("dpr"))) ? Number(q.get("dpr")) : 0,
    glq: one<GLQuality>("glq", ["linear", "mipmap", "lanczos"], "lanczos"),
    sharpen: [0, 0.25, 0.5, 0.8].includes(Number(q.get("sharpen")))
      ? Number(q.get("sharpen"))
      : 0,
    ref: one<RefSource>("ref", ["native", "lanczos"], "native"),
    vsrc: one<VideoSource>("vsrc", ["remux", "tv", "master"], "remux"),
    pos: Math.min(100, Math.max(0, Number(q.get("pos") ?? 50))),
  };
}

type Params = ReturnType<typeof readParams>;

export function QualityDiagnostic() {
  const [p, setP] = useState<Params>(() => readParams());
  /** Held key flips primary/secondary without touching any other state. */
  const [flipped, setFlipped] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [note, setNote] = useState<string>("");

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLSurface | null>(null);
  const refImgRef = useRef<HTMLImageElement>(null);
  const rafId = useRef(0);
  const timerId = useRef(0);
  const hudRef = useRef<HTMLPreElement>(null);

  const set = useCallback((patch: Partial<Params>) => {
    setP((prev) => {
      const next = { ...prev, ...patch };
      const q = new URLSearchParams();
      q.set("mode", next.mode);
      q.set("b", next.secondary);
      q.set("view", next.view);
      q.set("fit", next.fit);
      q.set("frame", String(next.frame));
      q.set("zoom", String(next.zoom));
      q.set("sq", next.smoothing);
      q.set("glq", next.glq);
      q.set("sharpen", String(next.sharpen));
      q.set("ref", next.ref);
      q.set("vsrc", next.vsrc);
      q.set("pos", String(next.pos));
      if (!next.ui) q.set("ui", "0");
      if (next.alpha) q.set("alpha", "1");
      if (!next.desync) q.set("desync", "0");
      if (next.dpr) q.set("dpr", String(next.dpr));
      if (next.motion) q.set("motion", "1");
      window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
      return next;
    });
  }, []);

  const primary = flipped ? p.secondary : p.mode;
  const secondary = flipped ? p.mode : p.secondary;
  const activeModes = p.view === "single" ? [primary] : [primary, secondary];

  const videoSrc = p.vsrc === "remux" ? REMUX_SRC : p.vsrc === "tv" ? TV_SRC : MASTER_SRC;
  const targetTime = (p.frame + 0.5) / FPS;

  /** Backing-store scale. dpr=0 means "whatever the device really is". */
  const effectiveDpr = p.dpr || window.devicePixelRatio || 1;

  // ── stage size ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStage({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry: Geometry = useMemo(() => {
    const vw = 3876;
    const vh = 2136;
    return computeGeometry(vw, vh, stage.w * effectiveDpr, stage.h * effectiveDpr, p.fit);
  }, [stage.w, stage.h, effectiveDpr, p.fit]);

  // ── drawing ───────────────────────────────────────────────────────────────
  const paint = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    if (timerId.current) clearTimeout(timerId.current);
    rafId.current = 0;
    timerId.current = 0;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !stage.w || !stage.h) return;

    const bw = Math.round(stage.w * effectiveDpr);
    const bh = Math.round(stage.h * effectiveDpr);
    const geo = computeGeometry(video.videoWidth, video.videoHeight, bw, bh, p.fit);

    if (activeModes.includes("C")) {
      const cv = canvas2dRef.current;
      if (cv) {
        if (cv.width !== bw || cv.height !== bh) {
          cv.width = bw;
          cv.height = bh;
        }
        const ctx = cv.getContext("2d", { alpha: p.alpha, desynchronized: p.desync });
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = p.smoothing;
          if (p.fit === "contain" || p.fit === "none") {
            ctx.fillStyle = "#808080";
            ctx.fillRect(0, 0, bw, bh);
          }
          ctx.drawImage(video, geo.sx, geo.sy, geo.sw, geo.sh, geo.dx, geo.dy, geo.dw, geo.dh);
        }
      }
    }

    if (activeModes.includes("D")) {
      const cv = glCanvasRef.current;
      if (cv) {
        if (!glRef.current) {
          try {
            glRef.current = createGLSurface(cv);
          } catch (e) {
            setNote(`WebGL: ${(e as Error).message}`);
          }
        }
        const gl = glRef.current;
        if (gl) {
          gl.resize(bw, bh);
          gl.draw(video, geo, p.glq, p.sharpen);
        }
      }
    }

    if (hudRef.current) {
      const cv = canvas2dRef.current;
      const gc = glCanvasRef.current;
      hudRef.current.textContent = [
        `renderer      ${MODE_LABEL[primary]}${p.view !== "single" ? `   vs ${MODE_LABEL[secondary]}` : ""}`,
        `currentSrc    ${video.currentSrc.replace(window.location.origin, "")}`,
        `videoWidth    ${video.videoWidth} x ${video.videoHeight}`,
        `frame         ${p.frame}   currentTime ${video.currentTime.toFixed(5)}   readyState ${video.readyState}`,
        `stage CSS     ${stage.w} x ${stage.h}`,
        `backing       ${bw} x ${bh}   dpr ${effectiveDpr}${p.dpr ? " (forced)" : " (device)"}`,
        `canvas2d      ${cv ? `${cv.width}x${cv.height}` : "-"}   smoothing ${p.smoothing}  alpha ${p.alpha}  desync ${p.desync}`,
        `webgl         ${gc ? `${gc.width}x${gc.height}` : "-"}   quality ${p.glq}   sharpen ${p.sharpen || "off"}   ${glRef.current?.info() ?? ""}`,
        `fit           ${p.fit}`,
        `crop sx/sy    ${geo.sx.toFixed(2)} / ${geo.sy.toFixed(2)}`,
        `crop sw/sh    ${geo.sw.toFixed(2)} / ${geo.sh.toFixed(2)}`,
        `dest          ${geo.dw.toFixed(1)} x ${geo.dh.toFixed(1)}  @ ${geo.dx.toFixed(1)},${geo.dy.toFixed(1)}`,
        `downscale     ${geo.ratioX.toFixed(4)}x horizontal   ${geo.ratioY.toFixed(4)}x vertical`,
        `zoom          ${p.zoom * 100}%${p.zoom === 1 ? "  (no transform applied)" : "  (inspection only)"}`,
        note ? `note          ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // Automation handshake: only true once real pixels exist on the active surface.
    (window as unknown as Record<string, unknown>).__qd = {
      ready: true,
      mode: primary,
      secondary,
      view: p.view,
      fit: p.fit,
      frame: p.frame,
      currentSrc: video.currentSrc,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      stage: { ...stage },
      backing: { w: bw, h: bh },
      dpr: effectiveDpr,
      geometry: geo,
      smoothing: p.smoothing,
      glQuality: p.glq,
      glRenderer: glRef.current?.info() ?? null,
    };
    document.body.dataset.qdReady = "1";
  }, [
    stage, effectiveDpr, p.fit, p.alpha, p.desync, p.smoothing, p.glq, p.frame, p.view, p.zoom,
    p.dpr, p.sharpen, primary, secondary, activeModes.join(""), note,
  ]);

  // Replace rather than skip: a pending frame holds the PREVIOUS paint closure,
  // so a plain "already scheduled" guard would repaint with a stale stage size
  // and never converge after the first measurement.
  //
  // The timer is not belt-and-braces: requestAnimationFrame does not fire while
  // the document is hidden, which is exactly the state an off-screen preview
  // pane or a headless capture runs in. Without it the surfaces never draw and
  // the readiness handshake never resolves. paint() cancels whichever of the
  // two did not win, so it still runs once per schedule.
  const schedule = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    if (timerId.current) clearTimeout(timerId.current);
    rafId.current = requestAnimationFrame(paint);
    timerId.current = window.setTimeout(paint, 48);
  }, [paint]);

  // Redraw on any parameter or size change. Static frame — no animation loop.
  useEffect(() => {
    document.body.dataset.qdReady = "0";
    schedule();
  }, [schedule]);

  // ── video: load + seek to the exact frame ─────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // In motion mode the playhead belongs to playback; seeking it back to a
    // fixed frame here would fight the loop and corrupt the timing sample.
    if (p.motion) return;
    document.body.dataset.qdReady = "0";

    const onReady = () => {
      if (Math.abs(v.currentTime - targetTime) > 0.5 / FPS) {
        v.currentTime = targetTime;
      } else {
        schedule();
      }
    };
    const onSeeked = () => schedule();

    v.addEventListener("loadeddata", onReady);
    v.addEventListener("seeked", onSeeked);
    if (v.readyState >= 2) onReady();

    // A presented frame is the only honest "the pixels are there" signal.
    let handle = 0;
    const hasRvfc = typeof v.requestVideoFrameCallback === "function";
    if (hasRvfc) {
      const onFrame = () => {
        schedule();
        handle = v.requestVideoFrameCallback(onFrame);
      };
      handle = v.requestVideoFrameCallback(onFrame);
    }

    return () => {
      v.removeEventListener("loadeddata", onReady);
      v.removeEventListener("seeked", onSeeked);
      if (hasRvfc && handle && typeof v.cancelVideoFrameCallback === "function") {
        v.cancelVideoFrameCallback(handle);
      }
    };
  }, [targetTime, videoSrc, schedule, p.motion]);

  // Recreate the GL surface when a context attribute would have to change.
  useEffect(() => {
    return () => {
      glRef.current?.destroy();
      glRef.current = null;
    };
  }, []);

  /**
   * Hands the live surfaces to the scrub bench.
   *
   * The bench needs to drive a scripted gesture — seek, ease, draw — against
   * the REAL renderers, including the actual videoGL shader, and it has to do
   * that identically for A/B/C/D. Exposing the refs keeps the whole gesture
   * script in the test harness instead of growing a second playhead model in
   * here that could drift from the site's. Dev-only route; tree-shaken out of
   * production along with the rest of this component.
   */
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__qdRefs = {
      video: () => videoRef.current,
      canvas2d: () => canvas2dRef.current,
      glCanvas: () => glCanvasRef.current,
      gl: () => glRef.current,
      geometry: (vw: number, vh: number, cw: number, ch: number) =>
        computeGeometry(vw, vh, cw, ch, p.fit),
    };
  }, [p.fit]);

  /**
   * Lets the capture harness step frames without a page reload. Reloading for
   * each frame would re-decode a 34 MB file 64 times and take minutes; more
   * importantly it would reset the GL context between samples, which is exactly
   * the state a shimmer measurement must keep constant.
   */
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__qdSetFrame = (n: number) => set({ frame: n });
    return () => {
      delete (window as unknown as Record<string, unknown>).__qdSetFrame;
    };
  }, [set]);

  // ── motion telemetry ──────────────────────────────────────────────────────
  /**
   * Real playback with per-frame measurement. Deliberately does NOT reuse
   * paint(): that call also rebuilds the HUD string and the __qd object, and
   * timing a draw with string concatenation inside it would measure the wrong
   * thing. Here the timed section contains the draw and nothing else.
   *
   * Every renderer gets the same treatment — same loop, same clock, same video
   * element — so the numbers are comparable across A/B/C/D.
   */
  useEffect(() => {
    if (!p.motion || !stage.w || !stage.h) return;
    const video = videoRef.current;
    if (!video) return;

    const bw = Math.round(stage.w * effectiveDpr);
    const bh = Math.round(stage.h * effectiveDpr);
    const ctx2d =
      primary === "C"
        ? canvas2dRef.current?.getContext("2d", { alpha: p.alpha, desynchronized: p.desync })
        : null;
    if (ctx2d && canvas2dRef.current) {
      canvas2dRef.current.width = bw;
      canvas2dRef.current.height = bh;
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.imageSmoothingQuality = p.smoothing;
    }
    if (primary === "D" && glCanvasRef.current) {
      if (!glRef.current) glRef.current = createGLSurface(glCanvasRef.current);
      glRef.current?.resize(bw, bh);
    }

    const rafDeltas: number[] = [];
    const drawMs: number[] = [];
    let presented = 0;
    let last = 0;
    let raf = 0;
    let rvfc = 0;
    let running = true;
    const startedAt = performance.now();

    const onFrame = () => {
      presented += 1;
      rvfc = video.requestVideoFrameCallback(onFrame);
    };
    const hasRvfc = typeof video.requestVideoFrameCallback === "function";
    if (hasRvfc) rvfc = video.requestVideoFrameCallback(onFrame);

    const loop = (ts: number) => {
      if (!running) return;
      if (last) rafDeltas.push(ts - last);
      last = ts;

      const t0 = performance.now();
      if (video.videoWidth) {
        const geo = computeGeometry(video.videoWidth, video.videoHeight, bw, bh, p.fit);
        if (primary === "C" && ctx2d) {
          ctx2d.drawImage(video, geo.sx, geo.sy, geo.sw, geo.sh, geo.dx, geo.dy, geo.dw, geo.dh);
        } else if (primary === "D") {
          glRef.current?.draw(video, geo, p.glq, p.sharpen);
        }
        // Mode A and B draw nothing: the compositor owns the surface. The rAF
        // cadence and the video pipeline counters still describe them fully.
      }
      drawMs.push(performance.now() - t0);

      const q = video.getVideoPlaybackQuality?.();
      (window as unknown as Record<string, unknown>).__qdMotion = {
        renderer: primary,
        glQuality: p.glq,
        sharpen: p.sharpen,
        elapsedMs: performance.now() - startedAt,
        rafDeltas,
        drawMs,
        presentedFrames: presented,
        totalVideoFrames: q?.totalVideoFrames ?? null,
        droppedVideoFrames: q?.droppedVideoFrames ?? null,
        gpuMs: glRef.current?.gpuTimings?.() ?? null,
        glRenderer: glRef.current?.info() ?? null,
        videoTime: video.currentTime,
        backing: { w: bw, h: bh },
      };
      raf = requestAnimationFrame(loop);
    };

    video.loop = true;
    video.currentTime = 0;
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => {});
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (hasRvfc && rvfc && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(rvfc);
      }
      video.loop = false;
      video.pause();
    };
  }, [
    p.motion, p.fit, p.glq, p.sharpen, p.alpha, p.desync, p.smoothing,
    stage.w, stage.h, effectiveDpr, primary, videoSrc,
  ]);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "shift") {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (k === "a" || k === "b" || k === "c" || k === "d") set({ mode: k.toUpperCase() as Mode });
      else if (k === "h") set({ ui: !p.ui });
      else if (k === "1") set({ zoom: 1 });
      else if (k === "2") set({ zoom: 2 });
      else if (k === "4") set({ zoom: 4 });
      else if (k === "s") set({ view: p.view === "split" ? "single" : "split" });
      else if (k === "v") set({ view: p.view === "slider" ? "single" : "slider" });
      else if (k === "f") set({ fit: p.fit === "cover" ? "contain" : p.fit === "contain" ? "none" : "cover" });
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "shift") setFlipped(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [p.ui, p.view, p.fit, set]);

  // ── slider drag ───────────────────────────────────────────────────────────
  const dragging = useRef(false);
  useEffect(() => {
    if (p.view !== "slider") return;
    const move = (e: PointerEvent) => {
      if (!dragging.current || !stageRef.current) return;
      const r = stageRef.current.getBoundingClientRect();
      set({ pos: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)) });
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [p.view, set]);

  // ── surfaces ──────────────────────────────────────────────────────────────
  const objectFit = p.fit === "none" ? "none" : p.fit;
  const fill: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  };

  const refSrc =
    p.ref === "lanczos" && stage.w && stage.h ? lanczosRefFor(p.fit, stage.w, stage.h) : REF_NATIVE;

  const surface = (m: Mode) => {
    switch (m) {
      case "A":
        return (
          <img
            ref={refImgRef}
            key={`A-${refSrc}`}
            src={refSrc}
            alt=""
            decoding="sync"
            style={{ ...fill, objectFit, objectPosition: "center" }}
            onError={() => setNote(`reference not found: ${refSrc} — falling back to native PNG`)}
          />
        );
      case "B":
        return (
          <video
            key="B"
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            style={{ ...fill, objectFit, objectPosition: "center" }}
          />
        );
      case "C":
        return <canvas key={`C-${p.alpha}-${p.desync}`} ref={canvas2dRef} style={fill} />;
      case "D":
        return <canvas key="D" ref={glCanvasRef} style={fill} />;
    }
  };

  /** Modes C and D need the video decoding even though it must not be seen. */
  const hiddenDecoder = !activeModes.includes("B");

  const clipFor = (m: Mode) => {
    if (p.view === "single" || m !== primary) return undefined;
    const cut = p.view === "split" ? 50 : p.pos;
    return { clipPath: `inset(0 ${100 - cut}% 0 0)` };
  };

  const zoomWrap: React.CSSProperties =
    p.zoom === 1
      ? { position: "absolute", inset: 0 }
      : {
          position: "absolute",
          inset: 0,
          transform: `scale(${p.zoom})`,
          transformOrigin: "center center",
          imageRendering: "pixelated",
        };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#808080",
        overflow: "hidden",
        margin: 0,
      }}
    >
      <div ref={stageRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={zoomWrap}>
          {/* Secondary underneath, primary clipped over it — both full size, so
              the seam compares the same pixels instead of two different crops. */}
          {p.view !== "single" && <div style={{ position: "absolute", inset: 0 }}>{surface(secondary)}</div>}
          <div style={{ position: "absolute", inset: 0, ...clipFor(primary) }}>{surface(primary)}</div>
        </div>
      </div>

      {/* The decoder for C/D when B is not on screen. Never visible. */}
      {hiddenDecoder && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, opacity: 0 }}
        />
      )}

      {p.view === "slider" && p.ui && (
        <div
          onPointerDown={(e) => {
            dragging.current = true;
            e.preventDefault();
          }}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${p.pos}%`,
            width: 2,
            background: "#ff2f6d",
            cursor: "ew-resize",
            zIndex: 30,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: -13,
              width: 28,
              height: 28,
              marginTop: -14,
              borderRadius: 14,
              background: "#ff2f6d",
            }}
          />
        </div>
      )}

      {p.ui && <Controls p={p} set={set} hudRef={hudRef} />}
    </div>
  );
}

// ── control panel ───────────────────────────────────────────────────────────

const btn = (on: boolean): React.CSSProperties => ({
  font: "600 11px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace",
  padding: "6px 9px",
  border: `1px solid ${on ? "#ff2f6d" : "#555"}`,
  background: on ? "#ff2f6d" : "#1b1b1b",
  color: on ? "#fff" : "#c9c9c9",
  cursor: "pointer",
  borderRadius: 3,
  letterSpacing: "0.04em",
});

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 5,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 7,
};

const labelStyle: React.CSSProperties = {
  font: "600 9px/1 ui-monospace, monospace",
  color: "#7a7a7a",
  letterSpacing: "0.12em",
  width: 62,
  flexShrink: 0,
};

function Group<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: readonly { v: T; t: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      {options.map((o) => (
        <button key={String(o.v)} style={btn(o.v === value)} onClick={() => onPick(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

function Controls({
  p,
  set,
  hudRef,
}: {
  p: Params;
  set: (patch: Partial<Params>) => void;
  hudRef: React.RefObject<HTMLPreElement | null>;
}) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 40,
          background: "#0e0e0e",
          border: "1px solid #333",
          borderRadius: 5,
          padding: "11px 12px 5px",
          width: 430,
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
        }}
      >
        <Group
          label="RENDERER"
          value={p.mode}
          options={[
            { v: "A", t: "A · PNG REF" },
            { v: "B", t: "B · NATIVE" },
            { v: "C", t: "C · CANVAS2D" },
            { v: "D", t: "D · WEBGL" },
          ] as const}
          onPick={(v) => set({ mode: v })}
        />
        <Group
          label="COMPARE"
          value={p.view}
          options={[
            { v: "single", t: "SINGLE" },
            { v: "split", t: "SPLIT 50/50" },
            { v: "slider", t: "SLIDER" },
          ] as const}
          onPick={(v) => set({ view: v })}
        />
        <Group
          label="VS"
          value={p.secondary}
          options={[
            { v: "A", t: "A" },
            { v: "B", t: "B" },
            { v: "C", t: "C" },
            { v: "D", t: "D" },
          ] as const}
          onPick={(v) => set({ secondary: v })}
        />
        <Group
          label="FIT"
          value={p.fit}
          options={[
            { v: "cover", t: "COVER" },
            { v: "contain", t: "CONTAIN" },
            { v: "none", t: "NO CROP" },
          ] as const}
          onPick={(v) => set({ fit: v })}
        />
        <Group
          label="ZOOM"
          value={p.zoom}
          options={[
            { v: 1, t: "100%" },
            { v: 2, t: "200%" },
            { v: 4, t: "400%" },
          ] as const}
          onPick={(v) => set({ zoom: v })}
        />
        <Group
          label="FRAME"
          value={p.frame}
          options={FRAMES.map((f) => ({ v: f, t: String(f) }))}
          onPick={(v) => set({ frame: v })}
        />
        <Group
          label="VIDEO"
          value={p.vsrc}
          options={[
            { v: "remux", t: "REMUX full" },
            { v: "tv", t: "REMUX tv" },
            { v: "master", t: "MASTER untagged" },
          ] as const}
          onPick={(v) => set({ vsrc: v })}
        />
        <Group
          label="PNG REF"
          value={p.ref}
          options={[
            { v: "native", t: "NATIVE 3876px" },
            { v: "lanczos", t: "LANCZOS @stage" },
          ] as const}
          onPick={(v) => set({ ref: v })}
        />
        <Group
          label="C·SMOOTH"
          value={p.smoothing}
          options={[
            { v: "low", t: "LOW (default)" },
            { v: "medium", t: "MEDIUM" },
            { v: "high", t: "HIGH" },
          ] as const}
          onPick={(v) => set({ smoothing: v })}
        />
        <Group
          label="C·CTX"
          value={`${p.alpha ? 1 : 0}${p.desync ? 1 : 0}`}
          options={[
            { v: "01", t: "alpha:false desync:true" },
            { v: "00", t: "alpha:false desync:false" },
            { v: "11", t: "alpha:true desync:true" },
          ] as const}
          onPick={(v) => set({ alpha: v[0] === "1", desync: v[1] === "1" })}
        />
        <Group
          label="DPR"
          value={p.dpr}
          options={[
            { v: 0, t: "DEVICE" },
            { v: 1, t: "1" },
            { v: 1.25, t: "1.25" },
            { v: 1.5, t: "1.5" },
            { v: 2, t: "2" },
          ] as const}
          onPick={(v) => set({ dpr: v })}
        />
        <Group
          label="D·QUALITY"
          value={p.glq}
          options={[
            { v: "linear", t: "BILINEAR" },
            { v: "mipmap", t: "TRILINEAR" },
            { v: "lanczos", t: "LANCZOS2" },
          ] as const}
          onPick={(v) => set({ glq: v })}
        />
        <Group
          label="D·SHARPEN"
          value={p.sharpen}
          options={[
            { v: 0, t: "OFF" },
            { v: 0.25, t: "0.25 sutil" },
            { v: 0.5, t: "0.50 médio" },
            { v: 0.8, t: "0.80 forte" },
          ] as const}
          onPick={(v) => set({ sharpen: v })}
        />
        <p
          style={{
            font: "500 9.5px/1.5 ui-monospace, monospace",
            color: "#6a6a6a",
            margin: "8px 0 6px",
            letterSpacing: "0.03em",
          }}
        >
          HOLD SPACE/SHIFT = flip primary↔secondary · A B C D = renderer · S = split · V = slider ·
          F = fit · 1 2 4 = zoom · H = hide UI
        </p>
      </div>

      <pre
        ref={hudRef}
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          zIndex: 40,
          margin: 0,
          background: "#0e0e0e",
          border: "1px solid #333",
          borderRadius: 5,
          padding: "11px 13px",
          font: "500 11px/1.62 ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "#68d98a",
          whiteSpace: "pre",
        }}
      />
    </>
  );
}
