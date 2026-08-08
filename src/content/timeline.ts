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
 * Scene 01 starts at frame 0.
 *
 * The previous master opened on an unsettled camera move — frame 0 measurably
 * softer than frame 3 — so the timeline skipped three frames to start from the
 * sharpest point at rest. The current scene 01 is generated from an approved
 * still as its literal first frame, so there is nothing to skip: frame 0 is the
 * still itself, already settled and at full acutance.
 *
 * Kept as a named constant rather than deleted: it is the one lever that moves
 * every overlay with the footage, and the next master may need it again.
 */
export const INTRO_OFFSET_FRAMES = 0;
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
 * THE WHOLE SET IS v3 as of 2026-08-08 — the mixed v1/v2 era is over, and with
 * it the house discontinuity between scene 01 and the rest: every scene now
 * shows the same architecture. Each was generated on Higgsfield at 1080p and
 * upscaled to 3840x2160 (ByteDance, `aigc` preset, 24 fps), which preserves the
 * frame count exactly — no interpolation, no re-timing. The upscaled masters
 * live in media-comparison/source-archive/v3-masters/; what is served is the
 * GOP-6 re-encode of those, straight off the master with no remux step and no
 * filter chain (x264 slow, CRF 20, keyint 6, closed GOP), tagged BT.709
 * **tv/limited**.
 *
 * The upscale was measured against a native Seedance 2.0 4K take of the same
 * shot: the native master holds slightly more organic micro-texture at 100%
 * zoom, and the two are indistinguishable at the size the canvas actually
 * draws. The cost difference decided it — 0.64 credits per scene against 176.
 *
 * PLAYBACK ORDER IS NOT SOURCE ORDER. The delivered files 003 and 004 are
 * swapped with respect to continuity, and the boundary measurement is
 * unambiguous — PSNR between one scene's last frame and the next one's first:
 *
 *   01 -> 02  26.5 dB      02 -> 03  12.4 dB
 *   02 -> 04  36.8 dB      03 -> 04  12.0 dB
 *   04 -> 03  28.7 dB      04 -> 05  12.3 dB
 *   03 -> 05  22.5 dB
 *
 * Unrelated framings all sit at 10-13 dB, so the chain 01 -> 02 -> 04 -> 03 ->
 * 05 is the one the shots were generated for: each was made between two stills,
 * so a scene's last frame IS the next one's first. The files are therefore
 * deployed in PLAYBACK order — source 004 is served as scene-03, source 003 as
 * scene-04 — because every other tool in this repo reads `scene-0X` as "the Xth
 * segment" (verify-reverse.mjs, verify-timeline.mjs, SEGMENT_START_FRAME). The
 * source-order originals keep their own numbering in v3-masters/.
 *
 * What each segment now travels through, which is what the overlays are timed
 * against: 01 facade -> entrance. 02 entrance -> living -> home theatre, with
 * the projector and the B&W towers arriving in its last third. 03 home theatre
 * -> S110 display. 04 S110 -> gourmet. 05 gourmet -> curtains open -> skyline.
 *
 * The superseded sets are archived outside public/ so Vite does not copy them:
 * v1-scene-01/, v2-scene-01/ and v1-scenes-02-05/ under source-archive/.
 *
 * Note for `?media=original`: the remux set it reaches for is not present in
 * this checkout, so that flag resolves to nothing for every scene. It is
 * dev-only and compiled out of builds, so this costs production nothing.
 *
 * The masters ship with no colour metadata whatsoever: no VUI
 * video_signal_type, no `colr` box. Every player therefore falls back to
 * limited range — VLC, QuickTime, the Higgsfield preview, Chrome. That default
 * IS the look the client reviewed and approved, so the tag makes it explicit
 * rather than changing it.
 */
export const SEGMENTS: Segment[] = [
  {
    id: "fachada",
    index: 1,
    label: "Fachada",
    src: mediaFor("01"),
    reverseSrc: reverseMediaFor("01"),
    poster: "/media/web/scene-01-poster-desktop.avif",
    duration: 8.041667,
    frames: 193,
    mediaFrames: 193,
    offsetFrames: INTRO_OFFSET_FRAMES,
    globalStart: 0,
    globalEnd: 8.041667,
    width: 3840,
    height: 2160,
  },
  {
    id: "living",
    index: 2,
    label: "Living",
    src: mediaFor("02"),
    reverseSrc: reverseMediaFor("02"),
    duration: 10.041667,
    frames: 241,
    mediaFrames: 241,
    offsetFrames: 0,
    globalStart: 8.041667,
    globalEnd: 18.083334,
    width: 3840,
    height: 2160,
  },
  {
    id: "s110",
    index: 3,
    label: "Display S110",
    src: mediaFor("03"),
    reverseSrc: reverseMediaFor("03"),
    duration: 8.041667,
    frames: 193,
    mediaFrames: 193,
    offsetFrames: 0,
    globalStart: 18.083334,
    globalEnd: 26.125001,
    width: 3840,
    height: 2160,
  },
  {
    id: "gourmet",
    index: 4,
    label: "Área gourmet",
    src: mediaFor("04"),
    reverseSrc: reverseMediaFor("04"),
    duration: 8.041667,
    frames: 193,
    mediaFrames: 193,
    offsetFrames: 0,
    globalStart: 26.125001,
    globalEnd: 34.166668,
    width: 3840,
    height: 2160,
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
    globalStart: 34.166668,
    globalEnd: 42.208335,
    width: 3840,
    height: 2160,
  },
];

/** 1013 frames: 193 + 241 + 193 + 193 + 193, nothing skipped. */
export const GLOBAL_DURATION = 42.208335;
export const GLOBAL_FRAMES = 1013;

/** Frame index at which each segment starts on the global timeline. */
export const SEGMENT_START_FRAME = [0, 193, 434, 627, 820];

/**
 * Overlays as AUTHORED against the footage, before the intro offset.
 * Kept in these coordinates on purpose: the local times in the comments trace
 * back to the per-segment frame analysis, and staying in that frame of
 * reference is what keeps them checkable. The offset is applied once, below,
 * so every caption keeps its position relative to its own scene.
 */
const AUTHORED_OVERLAYS: Overlay[] = [
  {
    /**
     * Late in segment 2, not at its cut.
     *
     * The card has followed the hardware through two re-cuts now. Segment 02 no
     * longer opens inside the house: it starts on the entrance and spends its
     * first half getting there, so the projector is not on the ceiling until
     * roughly local 6 s, when the camera is finally inside the theatre. Placing
     * the card any earlier would describe equipment the viewer cannot see.
     */
    id: "fachada-projecao",
    kind: "equipment",
    // seg2 local 6.20–8.40
    globalStart: 14.241667,
    globalEnd: 16.441667,
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
     * Starts a second after the SIM2 card, while it is still up.
     *
     * Deliberately overlapping SIM2 by about a second: the two cards sit in
     * opposite corners — top-right and bottom-left — so they read as one system
     * being described rather than two labels fighting for the same space. The
     * towers enter frame a beat after the projector does, so the offset that
     * produces the overlap is also the honest order of what appears.
     */
    id: "living-bw-1",
    kind: "equipment",
    // seg2 local 7.30–9.40
    globalStart: 15.341667,
    globalEnd: 17.441667,
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
    // seg2 local 9.40 → seg3 local 1.40. Crosses the cut on purpose: the
    // theatre is the same room on both sides of it, so the card carries over.
    id: "living-bw-2",
    kind: "equipment",
    globalStart: 17.441667,
    globalEnd: 19.483334,
    eyebrow: "Bowers & Wilkins",
    equipment: "Bowers & Wilkins",
    title: "Engenharia a serviço do som",
    description:
      "A arquitetura dos gabinetes e o Tweeter-on-Top ajudam a controlar ressonâncias e preservar clareza, foco e imagem sonora.",
    descriptionMobile: "Gabinetes e Tweeter-on-Top preservam clareza, foco e imagem sonora.",
    position: "bottom-right",
  },
  {
    // seg3 local 4.60–6.50, once the camera has left the screen and the wall
    // panel is what the frame is about. The gap before it is the travelling
    // shot across the wood wall, deliberately uncaptioned.
    id: "s110-1",
    kind: "narrative",
    globalStart: 22.683334,
    globalEnd: 24.583334,
    eyebrow: "Automação integrada",
    title: "Um único ponto de controle",
    description:
      "Iluminação, climatização, áudio, vídeo, cortinas e segurança reunidos em uma interface central.",
    descriptionMobile:
      "Iluminação, clima, áudio, vídeo, cortinas e segurança em uma interface central.",
    position: "bottom-left",
  },
  {
    // seg3 local 6.50–8.041667, running out on the S110 close-up that ends it.
    id: "s110-2",
    kind: "narrative",
    globalStart: 24.583334,
    globalEnd: 26.125001,
    eyebrow: "Display S110",
    title: "Tecnologia que desaparece na arquitetura",
    description:
      "Uma interface discreta na parede conecta os ambientes e transforma comandos complexos em cenas simples para o cotidiano.",
    descriptionMobile:
      "Uma interface discreta na parede transforma comandos complexos em cenas simples.",
    position: "bottom-left",
  },
  {
    // seg4 local 0.00–1.95 — atravessa a fronteira de propósito: o display
    // fecha a cena 3 e abre a 4, então o card não vê corte nenhum.
    id: "s110-3",
    kind: "narrative",
    globalStart: 26.125001,
    globalEnd: 28.075001,
    eyebrow: "Cenas personalizadas",
    title: "Um toque muda o ambiente",
    description:
      "O sistema coordena diferentes equipamentos para preparar cada espaço de forma integrada.",
    descriptionMobile: "O sistema coordena os equipamentos para preparar cada espaço.",
    position: "bottom-left",
  },
  // travessia do display para a cozinha: 28.08 → 30.02, sem cards
  {
    // seg4 local 3.90–6.60, com a marcenaria, a sanca e as fitas de LED já
    // abertas no quadro — que é exatamente o que o card descreve.
    id: "gourmet-iluminacao",
    kind: "equipment",
    globalStart: 30.025001,
    globalEnd: 32.725001,
    eyebrow: "Controle de iluminação",
    equipment: "Controle de iluminação",
    title: "Iluminação arquitetural",
    description:
      "Luz indireta em sanca, fitas sob a marcenaria e spots embutidos compõem a cena sem aparelho à vista.",
    descriptionMobile: "Sanca, fitas sob a marcenaria e spots embutidos, sem aparelho à vista.",
    position: "bottom-right",
  },
  {
    // seg5 local 0.80–4.60, acompanhando a abertura das cortinas de ponta a
    // ponta: elas começam fechadas e terminam liberando o skyline.
    id: "gourmet-cortinas",
    kind: "equipment",
    globalStart: 34.966668,
    globalEnd: 38.766668,
    eyebrow: "Automação de cortinas",
    equipment: "Automação de cortinas",
    title: "Cortinas automatizadas",
    description: "A abertura acompanha a cena escolhida e entrega a vista da cidade no tempo certo.",
    descriptionMobile: "A abertura acompanha a cena e entrega a vista no tempo certo.",
    position: "bottom-right",
  },
  // 38.77 → 42.21: skyline limpo, depois o encerramento de marca
];

/**
 * Every caption moves earlier by exactly the intro offset.
 *
 * A single uniform shift is the correct transform, not a special case for
 * scene 01: each scene's start moves by the same amount, so subtracting it once
 * leaves every caption at the identical moment of its own footage. The offset
 * is 0 for the current master; the transform stays so that reinstating it is a
 * one-line change instead of a re-timing pass over every caption.
 */
export const OVERLAYS: Overlay[] = AUTHORED_OVERLAYS.map((o) => ({
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
