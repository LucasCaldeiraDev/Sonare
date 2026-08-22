import { gsap } from "./gsap";

/** Source footage is 24fps CFR — there is no point resolving finer than one frame. */
export const FRAME = 1 / 24;
/** Ignore deltas below half a frame: they address the frame already on screen. */
const EPSILON = FRAME * 0.5;

/**
 * Forward gap (s) above which rate-steering gives up and we seek instead.
 * Below it, playing fast is smoother than seeking; above it, playing would take
 * too long to catch up and read as lag.
 *
 * Exported because it is the boundary between this engine's two modes, and a
 * caller that meters its own input — the mobile touch governor — has to know
 * where that boundary is to stay on the smooth side of it. See
 * MobileNarrative's backlog cap.
 */
export const FORWARD_SEEK_GAP = 1.5;
/** Gap that a playbackRate of exactly 1.0 corresponds to; smaller gaps slow down, larger speed up. */
const RATE_TIME_CONSTANT = 0.35;

/**
 * Floor once the debt is nearly settled — low enough to ease to rest, and only
 * ever reached inside TAIL_FLOOR_FRAMES of the target. See TAIL_FLOOR_FRAMES
 * for why it is not the floor that matters.
 */
const RATE_MIN = 0.08;

/**
 * Default ceiling, used only when a caller does not supply its own.
 *
 * A caller that meters its own input should pass `rateCeiling` instead, so the
 * player and whatever is feeding it cannot disagree about how fast the story
 * may advance — see MobileNarrative, where both come from one function.
 * Letting the player run faster than the feeder will ever ask for buys
 * nothing: it only lets the picture overshoot and then need correcting.
 */
const DEFAULT_MAX_RATE = 3;

/**
 * Below this the rate is driven by the gap alone; above it the scroll's own
 * velocity is fed forward and the gap becomes a correction on top of it.
 *
 * Rate from the gap alone has a blind spot at exactly the moment a scene
 * starts: the incoming segment enters with delta ~0, so it is commanded to
 * crawl and has to wait for a gap to build before it moves properly. Seeding
 * the rate with how fast the story is already advancing means a new scene
 * picks up at the speed the last one was running. Ported from
 * CanvasNarrative, which found the same sag at every crossing.
 */
const ADVANCING_VEL_MIN = 0.15;

/**
 * While more than this many frames are owed, the picture may not finish
 * slower than real time.
 *
 * This is the "travadinha" at the end of a fast scroll, and it is not a
 * dropped frame — it is a commanded crawl. When a gesture lands, the measured
 * velocity collapses ahead of the remaining gap, so a rate of
 * `velocity + delta/TAU` decays to a 0.2-0.5x crawl exactly while three to
 * five frames are still owed. Desktop measured 123-314 ms inter-frame gaps
 * right after every energetic stop from precisely this. While more than two
 * frames are outstanding the shot is still visibly in motion and finishing it
 * below 1x reads as a freeze; past that the ordinary formula eases it to rest.
 * Steady slow scrolling never trips it, because there the equilibrium gap sits
 * well under two frames.
 */
const TAIL_FLOOR_FRAMES = 2;

/**
 * How far, in frames, the picture may run AHEAD of the scroll before it is
 * simply held.
 *
 * The floors above mean the playhead outruns a scroll that is slower than they
 * are, so something has to bound the lead. Holding is the right answer and a
 * backward seek is the wrong one: a media element cannot play in reverse, so
 * every backward correction costs seek latency, and on a phone — which carries
 * no reverse companions, deliberately — that is the single most expensive
 * thing this engine can do. Pausing lets the target simply walk into the frame
 * already on screen, at no cost. Only a lead past this leash, or a story
 * genuinely running backwards, is worth a seek.
 */
const LEAD_MAX_FRAMES = 12;
/** A seek slower than this counts against the health score used for tier fallback. */
const SLOW_SEEK_MS = 220;

export type ScrubStats = {
  seekRequests: number;
  seeksCompleted: number;
  slowSeeks: number;
  maxPending: number;
  lastSeekMs: number;
  avgSeekMs: number;
  presentedFrames: number;
  playingMs: number;
  /**
   * Times play() was refused. Swallowed silently before, which is exactly the
   * failure that leaves a picture frozen while the scroll keeps working: this
   * engine advances by PLAYING and only falls back to seeking past
   * FORWARD_SEEK_GAP, so a platform that refuses play() reads as a stall
   * rather than as an error.
   */
  playRejects: number;
  /** Last refusal's name, e.g. NotAllowedError. */
  lastPlayError: string;
};

export type ScrubEngine = {
  /** Cheap: called from scroll/timeline updates. Only records intent. */
  setTarget: (t: number) => void;
  /** True once the element has enough data to be shown without stalling. */
  isReady: () => boolean;
  /**
   * True when this machine is measurably failing to seek this file smoothly.
   * Only meaningful after a handful of completed seeks, so it never fires from
   * one slow outlier. Capable hardware never reaches it.
   */
  isStruggling: () => boolean;
  /** Retarget the engine at a different element (used by the quality fallback). */
  setElement: (el: HTMLVideoElement) => void;
  /** Current playhead of whichever element the engine is driving. */
  currentTime: () => number;
  /** True only while the playhead is being moved by seeks (reverse / big jump). */
  isSeekDriven: () => boolean;
  /** Current drive mode, for diagnostics. */
  mode: () => "idle" | "play" | "seek";
  /** Smoothed target velocity, in footage-seconds per wall-second. */
  velocity: () => number;
  /**
   * Hand this engine a velocity it has not measured yet.
   *
   * Each scene owns its own engine, so an incoming one starts at zero and has
   * to rebuild the estimate from scratch — which is a sag in the rate at
   * exactly the moment a scene begins, since the feed-forward term is the part
   * that keeps the picture moving with the scroll rather than behind it.
   * Seeding it from the outgoing engine means a new scene picks up at the
   * speed the last one was running.
   */
  seedVelocity: (v: number) => void;
  stats: () => ScrubStats;
  destroy: () => void;
};

/**
 * Seeks must be at least this slow, over this many samples, before the quality
 * fallback engages. Tuned above what a machine with hardware H.264 decode
 * produces, so capable hardware keeps 4K through the whole scrub.
 */
const STRUGGLE_MIN_SEEKS = 6;
const STRUGGLE_AVG_MS = 120;

type EngineState = {
  video: HTMLVideoElement;
  duration: number;
  target: number;
  active: boolean;
  seeking: boolean;
  seekStartedAt: number;
  /** Newest target that arrived while a seek was in flight — only ever one. */
  queued: number | null;
  stats: ScrubStats;
  seekTotalMs: number;
  /** Smoothed target velocity (footage-seconds per wall-second), for seek lead. */
  velocity: number;
  lastTarget: number;
  lastTargetAt: number;
  /**
   * How the playhead is currently being moved. "play" (forward, rate-steered)
   * costs no seeks and looks perfect even at 4K; "seek" (reverse or big jump)
   * is the only mode that pays seek latency.
   */
  mode: "idle" | "play" | "seek";
  /** Ceiling on playbackRate — see DEFAULT_MAX_RATE. */
  rateCeiling: () => number;
};

export type ScrubOptions = {
  /**
   * Ceiling on playbackRate, read every tick so a caller whose own ceiling is
   * measured at runtime stays in step with it. Defaults to DEFAULT_MAX_RATE.
   */
  rateCeiling?: () => number;
};

const engines = new Set<EngineState>();
let tickerAttached = false;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Snap to the nearest frame boundary so we never ask for a time between frames. */
function quantize(t: number) {
  return Math.round(t / FRAME) * FRAME;
}

/**
 * A 4K seek takes ~200ms. Aiming at the *current* target means the frame lands
 * already stale and we immediately seek again, which reads as lag rather than
 * as motion. Aiming where the target will be when the seek completes makes the
 * displayed frame arrive in the right place.
 */
function leadTarget(s: EngineState) {
  const latency = (s.stats.avgSeekMs || 200) / 1000;
  const lead = s.velocity * latency;
  // Cap the lead so a violent flick cannot overshoot into unrelated footage.
  return s.target + clamp(lead, -1.2, 1.2);
}

function issueSeek(s: EngineState, to: number) {
  const target = clamp(quantize(to), 0, Math.max(0, s.duration - FRAME));
  if (s.seeking) {
    // Never build a queue: the newest target simply replaces the previous one.
    s.queued = target;
    return;
  }
  if (Math.abs(s.video.currentTime - target) < EPSILON) return;
  s.seeking = true;
  s.seekStartedAt = performance.now();
  s.stats.seekRequests += 1;
  s.stats.maxPending = Math.max(s.stats.maxPending, 1);
  try {
    s.video.currentTime = target;
  } catch {
    s.seeking = false;
  }
}

/**
 * One rAF pass over every registered video. Runs on GSAP's ticker so the whole
 * page has exactly one requestAnimationFrame loop.
 */
function tick() {
  for (const s of engines) {
    const v = s.video;
    if (!s.active || v.readyState < 2) continue;

    const delta = s.target - v.currentTime;
    const abs = Math.abs(delta);
    /** The story is being carried forward, as opposed to settling or reversing. */
    const advancing = s.velocity > ADVANCING_VEL_MIN;

    // The picture is AHEAD of the scroll.
    //
    // While the story is still advancing this is the floors doing their job,
    // not an error, so it is HELD rather than corrected: the target walks into
    // the frame already on screen and playback resumes underneath it. Only a
    // lead past the leash — or a story actually running backwards, where
    // waiting would never converge — is worth the seek. See LEAD_MAX_FRAMES.
    if (delta < 0 && advancing && -delta <= LEAD_MAX_FRAMES * FRAME) {
      if (!v.paused) v.pause();
      s.mode = "idle";
      continue;
    }

    // Close enough, and not being carried — hold this frame. While advancing
    // the floors below deliberately keep playing through a gap this small,
    // which is what stops the pause/play cycling at low speed.
    if (abs < EPSILON && !advancing) {
      if (!v.paused) v.pause();
      s.mode = "idle";
      continue;
    }

    // Backwards past the leash: media elements cannot play in reverse, so this
    // is the one case that must seek. Single in-flight, frame-quantized, aimed
    // ahead of the scroll by one seek-latency.
    if (delta < 0) {
      if (!v.paused) v.pause();
      s.mode = "seek";
      issueSeek(s, leadTarget(s));
      continue;
    }

    // Forward, but too far to catch up by playing — jump.
    if (delta > FORWARD_SEEK_GAP) {
      if (!v.paused) v.pause();
      s.mode = "seek";
      issueSeek(s, leadTarget(s));
      continue;
    }

    // Forward and close: let the decoder do what it is good at. Playing keeps
    // it in streaming mode at a real 24fps instead of paying seek latency per
    // frame, and the rate eases toward 1 as the gap closes, which is what gives
    // the movement its damped, cinematic feel.
    if (s.seeking) continue;
    s.mode = "play";
    /**
     * Feed-forward on the scroll's own velocity, with the gap only as a
     * correction, floored so a shot still visibly in motion never finishes
     * below real time, and ceilinged by whatever is metering the input.
     */
    const floor = delta > TAIL_FLOOR_FRAMES * FRAME ? 1 : RATE_MIN;
    const feedForward = advancing ? s.velocity : 0;
    const rate = clamp(feedForward + delta / RATE_TIME_CONSTANT, floor, s.rateCeiling());
    if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
    if (v.paused) {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          s.stats.playRejects += 1;
          s.stats.lastPlayError = (err as Error)?.name || String(err);
        });
      }
    }
  }
}

export function createScrubEngine(
  video: HTMLVideoElement,
  duration: number,
  options: ScrubOptions = {},
): ScrubEngine {
  const rateCeiling = options.rateCeiling ?? (() => DEFAULT_MAX_RATE);
  const state: EngineState = {
    video,
    duration,
    target: 0,
    active: true,
    seeking: false,
    seekStartedAt: 0,
    queued: null,
    seekTotalMs: 0,
    velocity: 0,
    lastTarget: 0,
    lastTargetAt: 0,
    mode: "idle",
    rateCeiling,
    stats: {
      seekRequests: 0,
      seeksCompleted: 0,
      slowSeeks: 0,
      maxPending: 0,
      lastSeekMs: 0,
      avgSeekMs: 0,
      presentedFrames: 0,
      playingMs: 0,
      playRejects: 0,
      lastPlayError: "",
    },
  };

  let boundVideo = video;

  const onSeeked = () => {
    const ms = performance.now() - state.seekStartedAt;
    state.seeking = false;
    state.stats.seeksCompleted += 1;
    state.stats.lastSeekMs = Math.round(ms);
    state.seekTotalMs += ms;
    state.stats.avgSeekMs = Math.round(state.seekTotalMs / state.stats.seeksCompleted);
    if (ms > SLOW_SEEK_MS) state.stats.slowSeeks += 1;
    // Converge on the newest target only; stale ones were already discarded.
    const q = state.queued;
    state.queued = null;
    if (q !== null) issueSeek(state, q);
  };

  video.addEventListener("seeked", onSeeked);

  // requestVideoFrameCallback tells us a frame was actually presented, which is
  // the only honest measure of perceived smoothness.
  let rvfcHandle = 0;
  const hasRvfc = typeof video.requestVideoFrameCallback === "function";
  if (hasRvfc) {
    const onFrame = () => {
      state.stats.presentedFrames += 1;
      rvfcHandle = video.requestVideoFrameCallback(onFrame);
    };
    rvfcHandle = video.requestVideoFrameCallback(onFrame);
  }

  engines.add(state);
  if (!tickerAttached) {
    gsap.ticker.add(tick);
    tickerAttached = true;
  }

  return {
    isStruggling: () =>
      state.stats.seeksCompleted >= STRUGGLE_MIN_SEEKS && state.stats.avgSeekMs > STRUGGLE_AVG_MS,
    currentTime: () => state.video.currentTime,
    isSeekDriven: () => state.mode === "seek",
    mode: () => state.mode,
    velocity: () => state.velocity,
    seedVelocity: (v: number) => {
      state.velocity = v;
    },
    setElement: (el: HTMLVideoElement) => {
      if (el === state.video) return;
      // Hand the playhead over so the swap is invisible, then re-bind listeners.
      const at = state.video.currentTime;
      if (!state.video.paused) state.video.pause();
      state.video.playbackRate = 1;
      boundVideo.removeEventListener("seeked", onSeeked);
      state.video = el;
      state.seeking = false;
      state.queued = null;
      boundVideo = el;
      el.addEventListener("seeked", onSeeked);
      if (Math.abs(el.currentTime - at) > EPSILON) {
        try {
          el.currentTime = at;
        } catch {
          /* not seekable yet; the ticker will converge it */
        }
      }
    },
    setTarget: (t: number) => {
      const next = clamp(t, 0, Math.max(0, duration - FRAME));
      const now = performance.now();
      if (state.lastTargetAt) {
        const dt = (now - state.lastTargetAt) / 1000;
        if (dt > 0.004) {
          const instant = (next - state.lastTarget) / dt;
          // Exponential smoothing keeps the lead stable through jittery input.
          state.velocity = state.velocity * 0.7 + instant * 0.3;
          state.lastTarget = next;
          state.lastTargetAt = now;
        }
      } else {
        state.lastTarget = next;
        state.lastTargetAt = now;
      }
      state.target = next;
    },
    isReady: () => video.readyState >= 3,
    stats: () => ({ ...state.stats }),
    destroy: () => {
      state.active = false;
      boundVideo.removeEventListener("seeked", onSeeked);
      if (hasRvfc && rvfcHandle && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(rvfcHandle);
      }
      if (!state.video.paused) state.video.pause();
      state.video.playbackRate = 1;
      engines.delete(state);
      if (engines.size === 0 && tickerAttached) {
        gsap.ticker.remove(tick);
        tickerAttached = false;
      }
    },
  };
}
