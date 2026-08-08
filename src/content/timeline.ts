export type OverlayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

/**
 * A timed caption. Times are GLOBAL — seconds on the single journey, not
 * per-segment. Segment boundaries are invisible to overlays, so nothing can
 * blink or restart when the underlying file changes.
 */
export type Overlay = {
  id: string;
  kind: "narrative" | "equipment";
  globalStart: number;
  globalEnd: number;
  eyebrow?: string;
  title: string;
  description: string;
  descriptionMobile?: string;
  equipment?: string;
  position: OverlayPosition;
  positionMobile?: OverlayPosition;
};

export type Segment = {
  id: string;
  index: number;
  label: string;
  /** The original Higgsfield master, served as-is. */
  src: string;
  /**
   * The same footage with its frames in reverse order.
   *
   * A media element cannot play backwards, so scrolling up used to mean a seek
   * per frame. Playing THIS file forwards advances the story backwards, which
   * puts both directions on the decoder's streaming path.
   */
  reverseSrc: string;
  /**
   * Opening still for the first segment, so the hero never shows black while
   * the 4K master is still arriving. Same aspect ratio as the source, so
   * object-fit:cover frames it identically to the canvas crop.
   */
  poster?: string;
  /** Seconds of USABLE footage: mediaFrames minus offsetFrames, over FPS. */
  duration: number;
  /** Usable frames on the global timeline. */
  frames: number;
  /** Frames the file actually contains, offset included. */
  mediaFrames: number;
  /**
   * Frames skipped at the head of this segment. Editorial only — the file is
   * untouched; the timeline simply starts later inside it.
   */
  offsetFrames: number;
  globalStart: number;
  globalEnd: number;
  /** Native pixel dimensions — segment 3 differs from the rest. */
  width: number;
  height: number;
};

/** Source footage is 24fps CFR throughout. */
export const FPS = 24;

/**
 * `?s1=v2` swaps ONLY scene 01 for the Higgsfield v2 test take (8.041667 s,
 * 193 frames, 3840x2160), served from media-comparison/ exactly like the other
 * dev-only sets, so nothing new touches public/. Segments 2-5 keep the v1
 * footage and slide 1.125 s later — the extra runway the longer opening adds.
 * Two overlays tied to old scene-01 content are adjusted: the SIM2 card is
 * dropped (no projector in the new exterior) and the first B&W card starts at
 * the scene-02 cut, where the towers actually appear. A/B: same URL without
 * the flag serves production v1 untouched.
 */
const s1v2 =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("s1") === "v2";
/** Seconds the v2 opening adds to everything after segment 1. */
const S1_DELTA = s1v2 ? 1.125 : 0;

/**
 * Scene 01 starts at frame 3, not frame 0.
 *
 * Frame 0 of the master is measurably soft: acutance 7,114 against 8,278 at
 * frame 3 and 8,753 at frame 8 — only 1 of the first 25 frames sits within ±2%
 * of frame 0, and that one is frame 0 itself. The same curve is present in the
 * untagged master, so it is the delivered footage, not our pipeline. It is the
 * opening frame of a camera move that has not settled.
 *
 * Frame 3 recovers 16,4% of the available 23% while keeping the ease-in almost
 * intact (inter-frame motion 6,81 against 6,58 at frame 1), so the shot still
 * starts from rest instead of already travelling.
 *
 * Nothing is re-encoded or cut. The video is played from (3 + 0.5)/24 s and the
 * global timeline is 3 frames — exactly 125 ms — shorter.
 */
/** The v2 test take opens on its master still, already settled — no skip. */
export const INTRO_OFFSET_FRAMES = s1v2 ? 0 : 3;
const INTRO_OFFSET = INTRO_OFFSET_FRAMES / FPS;

/**
 * `?media=original` serves the single-keyframe files instead of the GOP-6
 * derivatives, for A/B during development. Folded away in production builds by
 * the same `import.meta.env.DEV` pattern the diagnostic flags use, so neither
 * the branch nor the string reaches the shipped bundle.
 */
const useOriginalMedia =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("media") === "original";

/**
 * Both sets are the same footage; they differ only in keyframe spacing.
 *
 * The delivered masters carry ONE keyframe each, so a backward seek has to
 * decode from frame 0 — measured in Chrome at 216 ms median and 384 ms worst
 * case, which is what made scrolling up feel stuck. The GOP-6 derivatives put a
 * keyframe every 6 frames and bring the same seek to 33 ms median, 50 ms worst.
 *
 * Re-encoded at CRF 20 with no filter of any kind: decode-YUV to encode-YUV,
 * so no scaling, no crop, no range conversion and no colour transform. Measured
 * against the file they replace: PSNR 46-52 dB, SSIM 0.991-0.996, VMAF
 * 98.8-100. The whole set is 2.7% SMALLER than what it replaces.
 */
/**
 * Reverse-order companions. `?reverseMedia=off` falls back to the forward file,
 * which makes the controller behave as it did before this change.
 */
const noReverseMedia =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("reverseMedia") === "off";

/**
 * `?temporalMedia=48` serves motion-interpolated 48 fps derivatives.
 *
 * The source is 24 fps and the playhead follows the scroll, so the number of
 * NEW frames per wall-second is scrollSpeed x 24 — twelve at half speed, seven
 * at a third, three at a reading crawl. That ceiling is arithmetic, and three
 * rounds of controller work confirmed there is no way past it from the player
 * side. Doubling the frames in the file is the only lever left that does not
 * desynchronise the picture from the gesture.
 *
 * The files are served from media-comparison/ rather than public/, exactly like
 * `?media=original`: the dev server exposes the project root, so the flag works
 * while developing and the 274 MB never reaches a build. Promoting this set to
 * production means moving the files into public/media/web/ and taking the flag
 * out — deliberately a separate decision.
 */
const temporalMedia48 =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("temporalMedia") === "48";

/**
 * Frames per second of the FILE, which is no longer always the frame rate of
 * the timeline. Everything editorial — segment lengths, overlay times, the
 * intro offset — stays in 24 fps logical frames; only the media changes.
 */
export const MEDIA_FPS = temporalMedia48 ? 48 : FPS;
/** Physical frames per logical frame. 1 or 2; never written inline anywhere. */
export const MEDIA_SCALE = MEDIA_FPS / FPS;

/**
 * Which resolution this device should be sent, decided by the pixels the canvas
 * will actually draw into.
 *
 * DPR alone is the wrong question and a phone is why: a modern handset reports
 * DPR 3 and would "deserve" 4K by that rule, while having neither the decoder
 * nor the network for it. What matters is the backing store the controller will
 * create — CSS width times DPR, capped at the same MAX_DPR of 2 the canvas uses
 * — because anything beyond that is decoded and thrown away by the downscale.
 *
 * Measured on scene 05, against 4K reduced to a 1920x1058 backing:
 *
 *   1440p48  PSNR 46,78 dB  SSIM 0,9913  seek p95 39,5 ms  17,3 MB
 *   1080p48  PSNR 46,06 dB  SSIM 0,9902  seek p95 50,0 ms  11,1 MB
 *   4K48     reference                   seek p95 116,7 ms 32,5 MB
 *
 * For calibration, the GOP-6 re-encode already in production measured 46-52 dB
 * and SSIM 0,991-0,996 and was accepted as visually equivalent. 1440p sits
 * inside that band while cutting seek latency by two thirds.
 *
 * 1440p only stays equivalent while it is still being REDUCED. Past a backing
 * of about 2560 px wide it would be enlarged instead, and that is where 4K
 * earns its cost — a large high-density desktop display, not a phone.
 */
export type MediaVariant = "4k" | "1440p" | "1080p";
const CANVAS_MAX_DPR = 2;

export const pickMediaVariant = (): MediaVariant => {
  const q = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("mediaVariant")
    : null;
  if (q === "4k" || q === "1440p" || q === "1080p") return q;

  const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_MAX_DPR);
  const backingWidth = Math.round(window.innerWidth * dpr);
  const coarse =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  // deviceMemory is Chromium-only and coarse (2/4/8); absent means "assume fine".
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  // A touch-first device, a small viewport or a memory-constrained one gets the
  // cheap set regardless of how many pixels it claims to have.
  if (coarse || memory <= 4 || window.innerWidth < 900) return "1080p";
  // Beyond this the 1440p master would be enlarged rather than reduced.
  if (backingWidth > 2560) return "4k";
  return "1440p";
};

/** Resolved once per load; the controller must not change source mid-gesture. */
export const MEDIA_VARIANT: MediaVariant = temporalMedia48 ? pickMediaVariant() : "4k";

const variantSuffix = () =>
  MEDIA_VARIANT === "4k" ? "4k-bt709-tv-48fps" : `${MEDIA_VARIANT}-48fps`;

const reverseMediaFor = (scene: string) =>
  noReverseMedia || useOriginalMedia
    ? mediaFor(scene)
    : temporalMedia48
      ? `/media-comparison/interp/out/scene-${scene}-${variantSuffix()}-reverse.mp4`
      : `/media/web/scene-${scene}-4k-bt709-tv-gop6-reverse.mp4`;

const mediaFor = (scene: string) =>
  useOriginalMedia
    ? // Archived outside public/ so the superseded set does not double the
      // bundle. The dev server serves the project root, so this resolves while
      // developing and simply does not exist in a build — which is correct,
      // since the flag that reaches for it is compiled out too.
      `/media-comparison/source-archive/remux-tv/scene-${scene}-4k-bt709-tv.mp4`
    : temporalMedia48
      ? `/media-comparison/interp/out/scene-${scene}-${variantSuffix()}.mp4`
      : `/media/web/scene-${scene}-4k-bt709-tv-gop6.mp4`;

/**
 * The five scenes. Nothing is merged, cropped, scaled or re-timed.
 *
 * What IS served is a GOP-6 re-encode (see mediaFor above) of a remux of the
 * delivered master. The remux was `-c copy`, container only, tagged BT.709
 * **tv/limited**; the re-encode changes keyframe spacing and nothing else, and
 * its predecessors are all still on disk for A/B.
 *
 * The masters ship with no colour metadata whatsoever: no VUI
 * video_signal_type, no `colr` box. Every player therefore falls back to
 * limited range — VLC, QuickTime, the Higgsfield preview, Chrome. That default
 * IS the look the client reviewed and approved, so the tag makes it explicit
 * rather than changing it. Verified in Chrome: the tv remux and the untagged
 * master render byte-identically (same SHA-256 on the captured frame).
 *
 * A `pc/full` set also exists (`scene-0X-4k-bt709-full.mp4`) and was measured
 * side by side. Technically the coded luma does run 3..250, i.e. the content
 * uses headroom, which argues for full range — but decoding it that way lifts
 * the picture to a flatter curve nobody had signed off on. Limited costs
 * ~0.8% of pixels to clipping and buys the contrast the scenes were graded
 * around. That is a look decision, taken deliberately, not a defect.
 *
 * Both REMUX sets are bit-identical to their master on the H.264 elementary
 * stream and on the decoded frames; only the container differs, by a constant
 * 173 bytes. The GOP-6 files are re-encoded and therefore not bit-identical —
 * they are measured instead, see mediaFor. Re-check the remuxes with:
 *   node media-comparison/scene01-fidelity/tools/verify-scenes.mjs
 *
 *   scene  elementary MD5 (master == tv == full)
 *   01     f98db8eb5e9687724cfb989897f2001d
 *   02     db33fef3206a60ec2251f10a6f8a729a
 *   03     a6a9cfcafde02ff8fb6dc3c56285ce96
 *   04     198dda002056a5c4d9de33513931ca9f
 *   05     7d13bf1021491306fe49534cf09ea00a
 *
 * The untagged masters are archived in media-comparison/source-archive/masters/,
 * outside public/ so Vite does not copy them into the bundle.
 */
export const SEGMENTS: Segment[] = [
  {
    id: "fachada",
    index: 1,
    label: "Fachada",
    src: s1v2
      ? "/media-comparison/higgsfield/new-renders/site/scene-01-v2-4k-bt709-tv-gop6.mp4"
      : mediaFor("01"),
    reverseSrc: s1v2
      ? "/media-comparison/higgsfield/new-renders/site/scene-01-v2-4k-bt709-tv-gop6-reverse.mp4"
      : reverseMediaFor("01"),
    poster: s1v2
      ? "/media-comparison/higgsfield/new-renders/site/scene-01-v2-poster-desktop.webp"
      : "/media/web/scene-01-poster-desktop.avif",
    duration: s1v2 ? 8.041667 : 6.916667,
    frames: s1v2 ? 193 : 166,
    mediaFrames: s1v2 ? 193 : 169,
    offsetFrames: INTRO_OFFSET_FRAMES,
    globalStart: 0,
    globalEnd: s1v2 ? 8.041667 : 6.916667,
    width: s1v2 ? 3840 : 3876,
    height: s1v2 ? 2160 : 2136,
  },
  {
    id: "living",
    index: 2,
    label: "Living",
    src: mediaFor("02"),
    reverseSrc: reverseMediaFor("02"),
    duration: 4.041667,
    frames: 97,
    mediaFrames: 97,
    offsetFrames: 0,
    globalStart: 6.916667 + S1_DELTA,
    globalEnd: 10.958334 + S1_DELTA,
    width: 3876,
    height: 2136,
  },
  {
    id: "s110",
    index: 3,
    label: "Display S110",
    src: mediaFor("03"),
    reverseSrc: reverseMediaFor("03"),
    duration: 5.041667,
    frames: 121,
    mediaFrames: 121,
    offsetFrames: 0,
    globalStart: 10.958334 + S1_DELTA,
    globalEnd: 16.000001 + S1_DELTA,
    // The odd one out: 3856x2148 (AR 1.79516) against 3876x2136 (1.81461)
    // everywhere else. Handled at draw time, never by re-encoding.
    width: 3856,
    height: 2148,
  },
  {
    id: "gourmet",
    index: 4,
    label: "Área gourmet",
    src: mediaFor("04"),
    reverseSrc: reverseMediaFor("04"),
    duration: 5.041667,
    frames: 121,
    mediaFrames: 121,
    offsetFrames: 0,
    globalStart: 16.000001 + S1_DELTA,
    globalEnd: 21.041668 + S1_DELTA,
    width: 3876,
    height: 2136,
  },
  {
    id: "skyline",
    index: 5,
    label: "Cortinas e skyline",
    src: mediaFor("05"),
    reverseSrc: reverseMediaFor("05"),
    duration: 8.041667,
    frames: 193,
    mediaFrames: 193,
    offsetFrames: 0,
    globalStart: 21.041668 + S1_DELTA,
    globalEnd: 29.083335 + S1_DELTA,
    width: 3876,
    height: 2136,
  },
];

/** 698 usable frames: 701 delivered minus the 3 skipped at the head of scene 01. */
export const GLOBAL_DURATION = s1v2 ? 30.208335 : 29.083335;
export const GLOBAL_FRAMES = s1v2 ? 725 : 698;

/** Frame index at which each segment starts on the global timeline. */
export const SEGMENT_START_FRAME = s1v2 ? [0, 193, 290, 411, 532] : [0, 166, 263, 384, 505];

/**
 * Overlays as AUTHORED against the original footage, before the intro offset.
 * Kept in these coordinates on purpose: the local times in the comments trace
 * back to the per-segment frame analysis, and staying in that frame of
 * reference is what keeps them checkable. The 125 ms shift is applied once,
 * below, so every caption keeps its position relative to its own scene.
 */
const AUTHORED_OVERLAYS: Overlay[] = [
  {
    // seg1 local 3.50–7.00 — projector unmistakable from 3.25s to the last frame
    id: "fachada-projecao",
    kind: "equipment",
    globalStart: 3.5,
    globalEnd: 7.0,
    eyebrow: "SIM2",
    equipment: "SIM2",
    title: "Projeção cinematográfica",
    description:
      "Projeção dedicada integrada à arquitetura, cuidadosamente posicionada para entregar uma experiência de cinema sem interferir na estética do ambiente.",
    descriptionMobile:
      "Projeção dedicada integrada à arquitetura, sem interferir na estética do ambiente.",
    position: "top-right",
  },
  {
    /**
     * Starts inside scene 01, while the projector card is still up.
     *
     * The towers are already unmistakable in the wide shot at the end of scene
     * 01, so waiting for the cut wasted the moment the hardware is clearest.
     * Deliberately overlapping SIM2 by about a second: the two cards sit in
     * opposite corners — top-right and bottom-left — so they read as one system
     * being described rather than two labels fighting for the same space.
     */
    id: "living-bw-1",
    kind: "equipment",
    globalStart: 6.0,
    globalEnd: 9.341667,
    eyebrow: "Bowers & Wilkins",
    equipment: "Bowers & Wilkins",
    title: "Referência em áudio high-end",
    description:
      "Sistema frontal da linha 800 Series Diamond, projetado para revelar precisão, espacialidade e detalhes de uma reprodução cinematográfica de referência.",
    descriptionMobile:
      "Sistema frontal da linha 800 Series Diamond: precisão, espacialidade e detalhe.",
    // Over the coffee table, where the frame is quietest and the card does not
    // cover the towers it is describing.
    position: "bottom-left",
  },
  {
    // seg2 local 2.30–4.041667
    id: "living-bw-2",
    kind: "equipment",
    globalStart: 9.341667,
    globalEnd: 11.083334,
    eyebrow: "Bowers & Wilkins",
    equipment: "Bowers & Wilkins",
    title: "Engenharia a serviço do som",
    description:
      "A arquitetura dos gabinetes e o Tweeter-on-Top ajudam a controlar ressonâncias e preservar clareza, foco e imagem sonora.",
    descriptionMobile: "Gabinetes e Tweeter-on-Top preservam clareza, foco e imagem sonora.",
    position: "bottom-right",
  },
  {
    // seg3 local 1.60–3.50
    id: "s110-1",
    kind: "narrative",
    globalStart: 12.683334,
    globalEnd: 14.583334,
    eyebrow: "Automação integrada",
    title: "Um único ponto de controle",
    description:
      "Iluminação, climatização, áudio, vídeo, cortinas e segurança reunidos em uma interface central.",
    descriptionMobile:
      "Iluminação, clima, áudio, vídeo, cortinas e segurança em uma interface central.",
    position: "bottom-left",
  },
  {
    // seg3 local 3.50–5.041667
    id: "s110-2",
    kind: "narrative",
    globalStart: 14.583334,
    globalEnd: 16.125001,
    eyebrow: "Display S110",
    title: "Tecnologia que desaparece na arquitetura",
    description:
      "Uma interface discreta na parede conecta os ambientes e transforma comandos complexos em cenas simples para o cotidiano.",
    descriptionMobile:
      "Uma interface discreta na parede transforma comandos complexos em cenas simples.",
    position: "bottom-left",
  },
  {
    // seg4 local 0.00–1.95 — atravessa a fronteira de propósito
    id: "s110-3",
    kind: "narrative",
    globalStart: 16.125001,
    globalEnd: 18.075001,
    eyebrow: "Cenas personalizadas",
    title: "Um toque muda o ambiente",
    description:
      "O sistema coordena diferentes equipamentos para preparar cada espaço de forma integrada.",
    descriptionMobile: "O sistema coordena os equipamentos para preparar cada espaço.",
    position: "bottom-left",
  },
  // travessia pelo display: 18.08 → 19.65, sem cards
  {
    // seg4 local 3.66–5.04 + seg5 local 0–1.32
    id: "gourmet-iluminacao",
    kind: "equipment",
    globalStart: 19.785001,
    globalEnd: 22.485001,
    eyebrow: "Controle de iluminação",
    equipment: "Controle de iluminação",
    title: "Iluminação arquitetural",
    description:
      "Luz indireta em sanca, fitas sob a marcenaria e spots embutidos compõem a cena sem aparelho à vista.",
    descriptionMobile: "Sanca, fitas sob a marcenaria e spots embutidos, sem aparelho à vista.",
    position: "bottom-right",
  },
  {
    // seg5 local 1.62–4.72
    id: "gourmet-cortinas",
    kind: "equipment",
    globalStart: 22.785001,
    globalEnd: 25.885001,
    eyebrow: "Automação de cortinas",
    equipment: "Automação de cortinas",
    title: "Cortinas automatizadas",
    description: "A abertura acompanha a cena escolhida e entrega a vista da cidade no tempo certo.",
    descriptionMobile: "A abertura acompanha a cena e entrega a vista no tempo certo.",
    position: "bottom-right",
  },
  // 25.9 → 29.2: skyline limpo, depois o encerramento de marca
];

/**
 * Every caption moves earlier by exactly the intro offset.
 *
 * A single uniform shift is the correct transform, not a special case for
 * scene 01: each scene's start moved by the same 125 ms, so subtracting it once
 * leaves every caption at the identical moment of its own footage.
 */
/**
 * v2 test mode: the SIM2 card is dropped (its projector belongs to the old
 * scene 01), the first B&W card is pinned to the scene-02 cut where the towers
 * actually enter frame, and everything else slides with the footage it was
 * authored against.
 */
const ACTIVE_OVERLAYS: Overlay[] = s1v2
  ? AUTHORED_OVERLAYS.filter((o) => o.id !== "fachada-projecao").map((o) =>
      o.id === "living-bw-1"
        ? { ...o, globalStart: 8.141667, globalEnd: 11.483334 }
        : { ...o, globalStart: o.globalStart + S1_DELTA, globalEnd: o.globalEnd + S1_DELTA },
    )
  : AUTHORED_OVERLAYS;

export const OVERLAYS: Overlay[] = ACTIVE_OVERLAYS.map((o) => ({
  ...o,
  globalStart: +(o.globalStart - INTRO_OFFSET).toFixed(6),
  globalEnd: +(o.globalEnd - INTRO_OFFSET).toFixed(6),
}));

/** Desktop scroll runway, in vh per second of footage. */
export const SCROLL_VH_PER_SECOND = 62;

/**
 * Forward frame index <-> reverse frame index, in whole frames.
 *
 * Integers on purpose. Deriving the reverse position from durations
 * (`reverseTime = duration - forwardTime`) is off by half a frame at best and
 * asks for exactly the end of the file at worst; this can do neither. The
 * relation is its own inverse, so one formula serves both ways — the two names
 * exist because reading `reverseFrameToForwardFrame` at a call site is worth
 * more than saving a line.
 *
 * Verified against the media in verify-reverse.mjs: forward 0 <-> reverse 96,
 * 1 <-> 95, 48 <-> 48, 96 <-> 0, worst pair 42.44 dB PSNR (a one-frame shift
 * would land around 20 dB).
 */
export const forwardFrameToReverseFrame = (frame: number, frameCount: number) =>
  frameCount - 1 - frame;
export const reverseFrameToForwardFrame = (frame: number, frameCount: number) =>
  frameCount - 1 - frame;

/**
 * The logical/physical boundary, in one place.
 *
 * Everything editorial is authored in 24 fps LOGICAL frames: segment lengths,
 * the intro offset, overlay times, the handover tolerances. The FILE may run at
 * a different rate — 48 fps under `?temporalMedia=48` — and the only code that
 * should ever know the difference is right here. A stray `* 2` anywhere else is
 * a bug waiting for the day the factor changes.
 *
 * Rounding is asymmetric on purpose. Logical to physical is exact by
 * construction (integer scale). Physical to logical floors, so a synthesised
 * frame sitting between two originals reports the logical frame it has not yet
 * passed — the conservative answer for a handover gate, which must never
 * believe the incoming track is further along than it is.
 */
export const logicalFrameToMediaFrame = (frame: number) => Math.round(frame * MEDIA_SCALE);
export const mediaFrameToLogicalFrame = (frame: number) => Math.floor(frame / MEDIA_SCALE);
/** Physical frames a file holds, from the logical count the timeline authored. */
export const mediaFrameCount = (logicalFrames: number) => logicalFrameToMediaFrame(logicalFrames);
/** Duration is invariant: interpolation adds frames, never time. */
export const logicalTimeToMediaTime = (seconds: number) => seconds;

/** Centre of a PHYSICAL frame, so rounding never lands on the neighbour. */
export const frameToMediaTime = (mediaFrame: number) => (mediaFrame + 0.5) / MEDIA_FPS;
/** Half a physical frame — below this the playhead already shows what was asked. */
export const MEDIA_EPS = 0.5 / MEDIA_FPS;

/**
 * Maps a global frame to its segment and the frame to address INSIDE THE FILE.
 *
 * The returned localFrame is a media frame, offset included, so callers seek
 * the video without needing to know an offset exists: global frame 0 of scene
 * 01 resolves to media frame 3.
 */
export function locateFrame(globalFrame: number): { index: number; localFrame: number } {
  for (let i = SEGMENTS.length - 1; i >= 0; i--) {
    if (globalFrame >= SEGMENT_START_FRAME[i] || i === 0) {
      const within = Math.min(
        Math.max(globalFrame - SEGMENT_START_FRAME[i], 0),
        SEGMENTS[i].frames - 1,
      );
      return { index: i, localFrame: SEGMENTS[i].offsetFrames + within };
    }
  }
  return { index: 0, localFrame: SEGMENTS[0].offsetFrames };
}
