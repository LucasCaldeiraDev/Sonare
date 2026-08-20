export type OverlayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

/**
 * Where the equipment a chip describes sits INSIDE THE SOURCE FRAME, in percent
 * of the 3840x2160 picture — not of the viewport. The card maps these through
 * the same centre-anchored cover crop the canvas uses, so the marker lands on
 * the same pixels at any window size, and hides itself if the crop cuts them.
 *
 * Coordinates were read off extracted frames of the actual footage at each
 * card's window (media in playback order, times local to the scene file).
 * x2/y2, when present, is where the equipment ends up by the END of the window:
 * the dot interpolates between the two as the camera travels. Windows whose
 * shot is static get a single point.
 */
export type OverlayAnchor = {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
};

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
  /**
   * Mobile's four scenes run at different durations and different cut points
   * than desktop's five (see MOBILE_SEGMENTS), so a caption timed to when its
   * equipment is on screen needs its own window there too. Falls back to
   * globalStart/globalEnd when absent — only the overlays below that actually
   * need different timing carry these.
   */
  globalStartMobile?: number;
  globalEndMobile?: number;
  eyebrow?: string;
  title: string;
  description: string;
  descriptionMobile?: string;
  equipment?: string;
  position: OverlayPosition;
  positionMobile?: OverlayPosition;
  /** Equipment chips only: where in the frame the described gear actually is. */
  anchor?: OverlayAnchor;
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

/**
 * Resolved once per load; the controller must not change source mid-gesture.
 *
 * LIVE IN PRODUCTION as of 2026-08-08 — this used to be pinned to "4k" with
 * pickMediaVariant() reserved for the 48 fps experiment. The v3 master swap
 * made the 4K set markedly heavier (scene 02 forward alone: 39.8 MB), which
 * surfaced as a felt hitch at scene crossings, so the 1440p/1080p GOP-6
 * derivatives were generated from the current masters with the exact house
 * recipe (x264 slow, CRF 20, keyint 6, BT.709 tv, faststart; frame counts
 * verified identical per file) and the selection was switched on. Screens
 * whose backing store exceeds 2560 px still receive 4K untouched.
 */
export const MEDIA_VARIANT: MediaVariant = pickMediaVariant();

const variantSuffix = () =>
  MEDIA_VARIANT === "4k" ? "4k-bt709-tv-48fps" : `${MEDIA_VARIANT}-48fps`;

const reverseMediaFor = (scene: string) =>
  noReverseMedia || useOriginalMedia
    ? mediaFor(scene)
    : temporalMedia48
      ? `/media-comparison/interp/out/scene-${scene}-${variantSuffix()}-reverse.mp4`
      : `/media/web/scene-${scene}-${MEDIA_VARIANT}-bt709-tv-gop6-reverse.mp4`;

/**
 * The portrait set is never A/B'd against anything and has no reverse or 48 fps
 * companion, so it resolves to one path with no flags in the way.
 */
const mobileMediaFor = (scene: string) => `/media/web/scene-${scene}-mobile-bt709-tv-gop6.mp4`;

/** Native pixel dimensions of every file MOBILE_SEGMENTS points at. */
export const MOBILE_SOURCE = { width: 720, height: 1280 } as const;

/** Frame 0 of the portrait scene 01, so the hero never opens on black. */
export const MOBILE_POSTER = "/media/web/scene-01-poster-mobile.webp";

const mediaFor = (scene: string) =>
  useOriginalMedia
    ? // Archived outside public/ so the superseded set does not double the
      // bundle. The dev server serves the project root, so this resolves while
      // developing and simply does not exist in a build — which is correct,
      // since the flag that reaches for it is compiled out too.
      `/media-comparison/source-archive/remux-tv/scene-${scene}-4k-bt709-tv.mp4`
    : temporalMedia48
      ? `/media-comparison/interp/out/scene-${scene}-${variantSuffix()}.mp4`
      : `/media/web/scene-${scene}-${MEDIA_VARIANT}-bt709-tv-gop6.mp4`;

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
 * A minimal per-scene descriptor for the mobile set — everything a desktop
 * Segment carries that MobileNarrative actually uses. No src/reverseSrc/width/
 * height/mediaFrames/offsetFrames: those exist for the canvas compositor and
 * the wheel-scrub reverse path, neither of which mobile has (see the "WHAT IS
 * BORROWED FROM DESKTOP AND WHAT IS NOT" note in MobileNarrative.tsx).
 */
export type MobileSegment = {
  id: string;
  label: string;
  mobileSrc: string;
  duration: number;
  frames: number;
  globalStart: number;
  globalEnd: number;
};

/**
 * The mobile set is FOUR scenes, not five, and does not share timing with
 * SEGMENTS/OVERLAYS above.
 *
 * Generated natively in 9:16 on Higgsfield (Seedance 2.5, 720x1280) rather
 * than cropped from the 16:9 masters — see docs/portrait-mobile-spec.md for
 * why a crop was rejected (74% of the frame permanently off screen on a real
 * phone) and docs/portrait-higgsfield-prompts.md for the prompts. Getting a
 * rigid door-hinge open reliably out of a video model turned out to be the
 * hard part; a wood pivot door swinging on its own is a well-known weak spot
 * for these models, so the sequence was re-cut around it: 01 walks through
 * the sliding glass panel beside the door (which the door itself never
 * animates) rather than the door swinging open, and 01 also absorbs what
 * would otherwise have been a separate facade→entrance scene, because
 * splitting that hand-off into its own clip kept re-introducing the same
 * failure. Every scene is used whole — the first scene 03 take opened closer
 * on the S110 than 02 leaves off and shipped briefly with 27 frames trimmed
 * off its head to reach the matching framing; the take here starts on it
 * already, so the trim is gone and the scene runs its full 8 s.
 *
 *   01 -> 02  34.0 dB      02 -> 03  25.6 dB      03 -> 04  32.1 dB
 *
 * Unrelated framings sit at 10-13 dB (see SEGMENTS' own boundary note above),
 * so all three are genuine matches, not coincidence.
 *
 * What each scene travels through: 01 facade -> entrance (through the glass
 * panel, not the door) -> living room / home theatre, settling wide on the
 * screen and both B&W towers. 02 that same wide shot -> a push-in that ends
 * close on the S110 panel. 03 pulls back off the S110 and travels to the
 * gourmet area. 04 gourmet -> curtains open -> skyline.
 */
export const MOBILE_SEGMENTS: MobileSegment[] = [
  {
    id: "fachada-living",
    label: "Fachada, entrada e living",
    mobileSrc: mobileMediaFor("01"),
    duration: 10.041667,
    frames: 241,
    globalStart: 0,
    globalEnd: 10.041667,
  },
  {
    id: "s110",
    label: "Living ao Display S110",
    mobileSrc: mobileMediaFor("02"),
    duration: 5.041667,
    frames: 121,
    globalStart: 10.041667,
    globalEnd: 15.083334,
  },
  {
    id: "gourmet",
    label: "S110 à área gourmet",
    mobileSrc: mobileMediaFor("03"),
    duration: 8.041667,
    frames: 193,
    globalStart: 15.083334,
    globalEnd: 23.125001,
  },
  {
    id: "skyline",
    label: "Gourmet, cortinas e skyline",
    mobileSrc: mobileMediaFor("04"),
    duration: 8.041667,
    frames: 193,
    globalStart: 23.125001,
    globalEnd: 31.166668,
  },
];

/** 748 frames: 241 + 121 + 193 + 193, nothing skipped. */
export const MOBILE_GLOBAL_DURATION = 31.166668;
export const MOBILE_GLOBAL_FRAMES = 748;

/** Frame index at which each mobile scene starts on the global timeline. */
export const MOBILE_SEGMENT_START_FRAME = [0, 241, 362, 555];

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
     * Segment 1, inside the "luzes internas em cena de chegada" status beat
     * (frame 96 / 4.0s onward — see systemStatus.ts). The hero has fully
     * faded by t=2.0s, so this opens on clear screen and closes with margin
     * before the segment 2 cut, rather than fighting the hero or the SIM2
     * card for space.
     *
     * Bottom-left to match this dataset's own convention: every other
     * narrative-kind card (s110-1, s110-2, s110-3) sits bottom-left, and it
     * is the same corner the hero just spoke from — the "voice" continues
     * from where it left off instead of jumping across the frame.
     */
    id: "fachada-boasvindas",
    kind: "narrative",
    // seg1 local 4.30 → seg2 local 3.46. Crosses the cut on purpose, like
    // living-bw-2 and s110-3: scene 1 ends on the entrance and scene 2 begins
    // there, so the welcome keeps walking with the visitor. It leaves as the
    // theatre's cove lights come on behind the glass (s02 t3.5 → t4.5 frames)
    // — the house takes over the greeting — and clears the SIM2 card at
    // 14.24 by almost three seconds.
    globalStart: 4.3,
    globalEnd: 11.5,
    // Mobile 01 covers facade through the living-room settle in one clip, so
    // this rides the approach and the arrival at the threshold, clearing the
    // SIM2 card with margin.
    globalStartMobile: 1.5,
    globalEndMobile: 6.0,
    eyebrow: "Chegada",
    title: "Seja bem-vindo",
    description:
      "A Sonare antecipa cada chegada: balizadores, paisagismo e luzes internas se acendem no tempo certo para receber você.",
    descriptionMobile: "Balizadores, paisagismo e luzes internas se acendem no tempo certo para receber você.",
    position: "bottom-left",
  },
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
    // Measured on the actual mobile clip: the SIM2 projector reads clearly
    // on the ceiling from local frame ~160 (6.7s) of scene 01 through its
    // settle at 10.0s.
    globalStartMobile: 6.8,
    globalEndMobile: 9.3,
    eyebrow: "SIM2",
    equipment: "SIM2",
    title: "Projeção cinematográfica",
    description:
      "Projeção dedicada integrada à arquitetura, cuidadosamente posicionada para entregar uma experiência de cinema sem interferir na estética do ambiente.",
    descriptionMobile:
      "Projeção dedicada integrada à arquitetura, sem interferir na estética do ambiente.",
    position: "top-right",
    // Frames s02 t6.2→t8.4: the projector hangs at top-centre and rises in
    // frame as the camera enters the theatre.
    anchor: { x: 50.5, y: 19, x2: 50, y2: 11.5 },
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
    // Both towers are in frame together from local frame ~200 (8.3s) of
    // scene 01, through the settle and into scene 02's opening push (which
    // starts on the identical framing — see MOBILE_SEGMENTS).
    globalStartMobile: 8.3,
    globalEndMobile: 11.2,
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
    // Frames s02 t7.3→t9.4: the left 800-series tower, nearest the card.
    anchor: { x: 30, y: 61, x2: 28, y2: 64 },
  },
  {
    // seg2 local 9.40 → seg3 local 1.40. Crosses the cut on purpose: the
    // theatre is the same room on both sides of it, so the card carries over.
    id: "living-bw-2",
    kind: "equipment",
    globalStart: 17.441667,
    globalEnd: 19.483334,
    // Follows living-bw-1 into scene 02, while a single tower (with its
    // Tweeter-on-Top) is still readable as the push-in moves past it toward
    // the S110 wall.
    globalStartMobile: 11.2,
    globalEndMobile: 13.0,
    eyebrow: "Bowers & Wilkins",
    equipment: "Bowers & Wilkins",
    title: "Engenharia a serviço do som",
    description:
      "A arquitetura dos gabinetes e o Tweeter-on-Top ajudam a controlar ressonâncias e preservar clareza, foco e imagem sonora.",
    descriptionMobile: "Gabinetes e Tweeter-on-Top preservam clareza, foco e imagem sonora.",
    position: "bottom-right",
    // Frames s02 t9.4 / s03 t0.7 — near-static shot. The dot sits on the right
    // tower's Tweeter-on-Top, which is the exact feature the copy names.
    anchor: { x: 73, y: 55 },
  },
  {
    // seg3 local 4.60–6.50, once the camera has left the screen and the wall
    // panel is what the frame is about. The gap before it is the travelling
    // shot across the wood wall, deliberately uncaptioned.
    id: "s110-1",
    kind: "narrative",
    globalStart: 22.683334,
    globalEnd: 24.583334,
    // Scene 02 is a fast 5s push straight to the S110 close-up — the panel
    // is already legible by local frame 60 (2.5s) — so there is no
    // travelling-shot gap to leave uncaptioned the way desktop does.
    globalStartMobile: 13.0,
    globalEndMobile: 14.6,
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
    // Runs out on the S110 close-up that ends scene 02 and crosses into
    // scene 03, which opens on the same panel (26.5 dB match — see
    // MOBILE_SEGMENTS).
    globalStartMobile: 14.6,
    globalEndMobile: 16.6,
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
    // Early in scene 03, as the camera pulls back off the S110 and starts
    // travelling toward the gourmet area. Measured on the current take: the
    // panel is still readable through local 2.0 s and the passage has taken
    // over by local 4.0 s.
    globalStartMobile: 16.8,
    globalEndMobile: 19.0,
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
    // The cabinetry LED strip and the ceiling cove are both legible from
    // local frame 96 (4.0 s) of scene 03 — the passage shot — and stay in
    // frame through its settle on the island and across into scene 04, which
    // opens on the identical framing (32.1 dB).
    globalStartMobile: 19.2,
    globalEndMobile: 23.4,
    eyebrow: "Controle de iluminação",
    equipment: "Controle de iluminação",
    title: "Iluminação arquitetural",
    description:
      "Luz indireta em sanca, fitas sob a marcenaria e spots embutidos compõem a cena sem aparelho à vista.",
    descriptionMobile: "Sanca, fitas sob a marcenaria e spots embutidos, sem aparelho à vista.",
    position: "bottom-right",
    // Frames s04 t3.9→t6.6: the camera dollies out of the corridor, so the
    // cove line travels — the two points ride its corner above the curtains.
    anchor: { x: 82, y: 15, x2: 74, y2: 27 },
  },
  {
    // seg5 local 0.80–4.60, acompanhando a abertura das cortinas de ponta a
    // ponta: elas começam fechadas e terminam liberando o skyline.
    id: "gourmet-cortinas",
    kind: "equipment",
    globalStart: 34.966668,
    globalEnd: 38.766668,
    // Scene 04's curtains open fast — mostly done by local frame 60 (2.5 s)
    // — so the window tracks the actual motion instead of the desktop
    // scene's slower reveal. Picks up where gourmet-iluminacao leaves off,
    // one beat after scene 04 begins at 23.125.
    globalStartMobile: 23.6,
    globalEndMobile: 25.9,
    eyebrow: "Automação de cortinas",
    equipment: "Automação de cortinas",
    title: "Cortinas automatizadas",
    description: "A abertura acompanha a cena escolhida e entrega a vista da cidade no tempo certo.",
    descriptionMobile: "A abertura acompanha a cena e entrega a vista no tempo certo.",
    position: "bottom-right",
    // Frames s05 t0.8→t4.6: the right-hand curtain panel keeps this point
    // through the whole opening move, so a single anchor is enough.
    anchor: { x: 78, y: 46 },
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
  ...(o.globalStartMobile !== undefined
    ? { globalStartMobile: +(o.globalStartMobile - INTRO_OFFSET).toFixed(6) }
    : {}),
  ...(o.globalEndMobile !== undefined
    ? { globalEndMobile: +(o.globalEndMobile - INTRO_OFFSET).toFixed(6) }
    : {}),
}));

/**
 * Desktop scroll runway, in vh per second of footage — and the single number
 * that decides whether a mouse wheel can be rendered smoothly at all.
 *
 * The arithmetic is unforgiving. A 60 Hz screen showing 24 fps media can
 * present at most 2.5x real time; past that the browser decodes frames it
 * cannot display. Story rate = scrollSpeed / (SCROLL_VH_PER_SECOND x vh), so
 * at 62 vh/s on a 1080 px viewport anything faster than ~1670 px/s of
 * scrolling demands more than the screen can show — and a mouse wheel clears
 * that easily, because a wheel is not a ramp but ~100 px jumps a few tens of
 * milliseconds apart. The controller then runs at the ceiling, arrives,
 * stops, and repeats: the burst-pause that reads as skipped frames.
 *
 * THIS NUMBER NO LONGER CONTROLS SMOOTHNESS, and that is worth stating
 * plainly because it did for one round and the wrong lesson is easy to keep.
 *
 * It was raised 62 -> 85 to stop a wheel spin outrunning the screen, and the
 * sweep supported it: at 62 the canvas took steps of up to 20 frames, at 85
 * of 2. Then the wheel governor arrived in CanvasNarrative and made that
 * reasoning obsolete. The governor's budget is computed AS a multiple of this
 * value, so the maximum story rate it permits — ceiling x fraction — comes out
 * the same whatever the runway is. Length stopped buying smoothness and became
 * pure cost: 37% more scrolling for a film that already asks for a lot.
 *
 * Re-measured with the governor on, 62 is as clean as 85 and marginally better
 * (dropped frames per scene 0/1.5/2.3/2.9/2.8% against 2.0/2.4/3.7/3.5/3.6%),
 * with zero multi-frame steps either way. So it goes back to 62 — the shortest
 * of the two, since the longer one now only makes visitors scroll further.
 *
 * `?vhps=N` overrides it in development. If the governor is ever removed, this
 * reverts to being a smoothness control and 85 becomes the floor again.
 */
const vhpsOverride =
  import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get("vhps")) || 0 : 0;
export const SCROLL_VH_PER_SECOND = vhpsOverride || 62;

/**
 * The same runway for touch, and a shorter one — 15.2 screens of scrolling
 * against the desktop's 26.
 *
 * The desktop number is a smoothness control. This one is NOT, and assuming
 * otherwise would waste a lot of scrolling. The arithmetic that governs desktop
 * — story rate = scrollSpeed / (vhps x vh) — says that holding a gesture under
 * the 2.5x presentation ceiling needs the runway to grow with the gesture's
 * speed, and a touch fling runs at 2000-4000 px/s where a wheel runs at 1670.
 * Matching it would take roughly 62 screens. There is no runway length that
 * makes a fling smooth, so length is not the lever here.
 *
 * What handles a fling instead is the pair already in the pipeline:
 * ScrollTrigger's scrub damping plays the jump out over its own time constant,
 * and past FORWARD_SEEK_GAP the scrub engine stops chasing and seeks. A flick
 * therefore reads as travelling forward quickly, which is what a flick means.
 *
 * So the number is chosen for the DELIBERATE scroll instead, the one the film
 * is actually read at: at 35 vh/s a steady 400 px/s on an 812 px screen runs
 * the story at 1.4x, close enough to real time to feel like footage rather than
 * a slideshow, without asking a phone for 26 screens of travel.
 *
 * `?mvhps=N` overrides it in development.
 */
const mobileVhpsOverride = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("mvhps")) || 0
  : 0;
export const MOBILE_SCROLL_VH_PER_SECOND = mobileVhpsOverride || 35;

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
