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

/**
 * A lead SMALLER than this is not held at all — the picture keeps playing,
 * slower, and the target walks into it while it moves.
 *
 * The hold above exists for the floors' overshoot, but without a dead zone it
 * fires on the ordinary steady state too. Once the rate has converged on the
 * scroll's own velocity, the playhead sits within a hair of the target and
 * crosses it constantly — the target is continuous and the playhead moves in
 * frame steps — so "ahead by any amount" was true for a slice of every frame
 * period. Each of those pause()d the element and the next tick play()ed it
 * again. Chrome resumes in under a frame and the cycling was invisible there,
 * which is why it survived; iOS resumes an AVPlayer in one to three frames,
 * every time, and that was the stutter reported from the handset as "gaps in
 * the frames" — the earlier round had already logged the same cycle as
 * play()/pause() collisions "on nearly every tick". Inside one frame of lead
 * the rate formula below already reads a negative gap as "slow down", which
 * converges without ever stopping the pipeline. Past it, hold as before.
 */
const LEAD_DEAD_ZONE_FRAMES = 1;

/**
 * playbackRate is rewritten only when it moves by more than this, and then
 * no more often than RATE_WRITE_INTERVAL_MS apart unless the change is
 * RATE_WRITE_URGENT or larger. The rate formula produces a slightly different
 * number every tick, and a rate write is not free on every player — iOS
 * re-times the AVPlayer pipeline on each one, and a pipeline re-timed several
 * times a second shows it as a hitch each time. Between writes the position
 * error simply accumulates a little (a fraction of a frame at these rates),
 * and the next write takes it back up; that is invisible where the writes
 * were not.
 */
const RATE_WRITE_HYSTERESIS = 0.04;
const RATE_WRITE_INTERVAL_MS = 250;
const RATE_WRITE_URGENT = 0.3;

/**
 * CADENCE. 24 fps footage presents evenly on a phone only at rates where the
 * panel's refresh divides the frame period. 1.25x is 30 fps — exactly two
 * refreshes per frame at 60 Hz and four at 120 Hz — the one rate above real
 * time both panels share. 1.667x is 40 fps: exactly three per frame at
 * 120 Hz, and a regular 2-1 alternation at 60 Hz, which is far easier on the
 * eye than the irregular patterns of the rates around it. A demanded rate
 * within CADENCE_SNAP of either is written as exactly that rate: the position
 * error a small mismatch accumulates is corrected by the gap term of the rate
 * formula, which pushes the demand outside the window only after a fraction
 * of a frame has drifted, and corrects it in one write rather than a hundred.
 */
const CADENCE_RATES = [1.25, 5 / 3];
const CADENCE_SNAP = 0.08;

/** A seek slower than this counts against the health score used for tier fallback. */
const SLOW_SEEK_MS = 220;

/**
 * How long a seek may stay in flight before the engine stops waiting for its
 * `seeked` and lets itself issue another.
 *
 * The engine keeps exactly one seek in flight and trusts the element to report
 * its end. Two things on a phone break that trust: a `load()` (memory
 * pressure, an error recovery) aborts the pending seek without a `seeked`, and
 * WebKit occasionally swallows a seek issued while the media pipeline is still
 * being set up. Either way `seeking` stays true forever and every later target
 * is parked in `queued` with nothing left to drain it — the picture is frozen
 * and nothing in the readout says why. Three seconds is well past any seek a
 * 720p GOP-6 file takes even over a poor cellular link, so the watchdog only
 * ever fires on a seek that was genuinely lost.
 */
const SEEK_WATCHDOG_MS = 3000;

/**
 * After play() is refused with NotAllowedError, how long the engine drives by
 * seeking alone before it asks again.
 *
 * The refusal is not permanent state on iOS: Low Power Mode can be switched
 * off, and WebKit lifts its gesture requirement for muted inline video after
 * the first real touch on the page. A block that never expired left the film
 * seek-driven for the whole visit over a condition that had long since
 * cleared; retrying every couple of seconds costs one rejected promise while
 * the refusal stands and recovers the play path within seconds once it lifts.
 */
const PLAY_RETRY_MS = 2000;

/**
 * Minimum spacing between "give me a frame" seeks issued at HAVE_METADATA.
 *
 * A seek issued before the data for that position has arrived completes with
 * the element still at HAVE_METADATA — the spec only promises that `seeked`
 * fires once the agent knows whether the data is available, not that it is.
 * Re-issuing on the very next tick would restart the fetch it is waiting on.
 * Half a second lets a fetch on a slow link get somewhere before it is asked
 * again.
 */
const PRIME_SEEK_INTERVAL_MS = 500;

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
  /**
   * Times play() was called. Against presentedFrames over the same window
   * this is the pause/play cycling rate — the number that says whether a
   * stutter is the pipeline being restarted rather than the frames not
   * arriving.
   */
  playCalls: number;
  /** playbackRate writes actually made — see RATE_WRITE_HYSTERESIS. */
  rateWrites: number;
  /** Seeks the watchdog gave up waiting for — see SEEK_WATCHDOG_MS. */
  seekTimeouts: number;
  /** Times prime() actually asked the element to fetch — see prime. */
  primes: number;
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
  /**
   * Make an element that has declined to fetch anything start fetching.
   *
   * The engine can only steer an element that holds metadata: a seek needs a
   * duration to be clamped against and a frame table to land on, so at
   * HAVE_NOTHING the ticker has nothing to act on and skips. Normally the
   * element gets there on its own from `preload`. iOS is the exception — a
   * WebKit that has decided not to preload (no `mediaDataLoadsAutomatically`,
   * typically on cellular) honours neither `preload="auto"` nor `load()`, and
   * the element sits at HAVE_NOTHING / NETWORK_IDLE indefinitely. The one call
   * WebKit always answers with a fetch is play(), so that is what this does:
   * play, with a pause queued behind it so the element loads and paints its
   * first frame without ever running. Rate-limited by PLAY_RETRY_MS so a
   * refusal (Low Power Mode) costs one rejected promise every couple of
   * seconds rather than one per tick. Cheap to call every tick; the caller
   * decides WHEN an element deserves its bytes, this only decides HOW to ask.
   */
  prime: () => void;
  /**
   * Start the playback pipeline once, without moving the picture, so the
   * first play() the scroll asks for is a resume rather than a cold start.
   *
   * On iOS the first play() on a freshly loaded element is the expensive
   * one — AVPlayer prerolls, one to three hundred milliseconds — and every
   * later one resumes in about a frame. Scene 01 pays the cold start while
   * the film is still at rest, where nobody sees it; a scene entered mid-scroll
   * pays it as a freeze at its first frame. This is the same play()-with-a-
   * pause-queued request as prime(), at RATE_MIN, so the picture advances a
   * few milliseconds of footage before the pause lands: under half a frame,
   * nothing on screen changes, and nothing needs seeking back. Refused where
   * play() is refused (Low Power Mode), harmlessly. Returns whether a play()
   * was actually issued, so the caller can keep asking until one is.
   */
  preroll: () => boolean;
  /**
   * Forget a standing play() refusal. A hidden track's pre-roll may be
   * refused where a visible one's play() would not be (a platform that will
   * not start invisible video), and the refusal would otherwise keep the
   * engine seek-driven for up to PLAY_RETRY_MS after the track comes on
   * screen — the first two seconds of a scene spent on the expensive path.
   * Called at the handover; if play() is refused again it blocks again.
   */
  retryPlay: () => void;
  /**
   * Stop where it is, now, and stay there: velocity zeroed, target moved to
   * the current playhead so the ticker idles instead of chasing. For a track
   * that has just left the screen. Its real target — the last frame, for a
   * hard cut nobody sees — is handed back by the caller at a moment when
   * converging on it hidden costs the visible track nothing.
   */
  park: () => void;
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
  /** True while a play() Promise is in flight and not yet settled. */
  playPending: boolean;
  /** A pause was requested while play() was pending; apply it once play() settles. */
  pauseQueued: boolean;
  /**
   * Until this timestamp, play() is not attempted: it was refused with
   * NotAllowedError — the platform withholding the permission outright — and
   * retrying every tick would just repeat the refusal. Until it expires the
   * engine drives forward entirely by seeking, which needs no permission; then
   * it asks once more. See requestPlay and PLAY_RETRY_MS.
   */
  playBlockedUntil: number;
  /** When the last seek completed — spaces the HAVE_METADATA priming seeks. */
  lastSeekEndedAt: number;
  /** When prime() last asked — rate-limits it to PLAY_RETRY_MS. */
  lastPrimeAt: number;
  /** When playbackRate was last written — see RATE_WRITE_INTERVAL_MS. */
  lastRateWriteAt: number;
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

/**
 * Pause, but never while a play() Promise is still in flight — calling
 * pause() on a pending play() is what produces WebKit's AbortError ("the
 * play() request was interrupted by a call to pause()"), and on iOS this
 * engine's own pause/play cycling was tripping that on nearly every tick.
 * Queue the pause and apply it once play() settles instead.
 */
function requestPause(s: EngineState) {
  if (s.playPending) {
    s.pauseQueued = true;
    return;
  }
  if (!s.video.paused) s.video.pause();
}

/** Play, guarding against overlapping play() calls and recording refusals. */
function requestPlay(s: EngineState) {
  if (s.playPending) return;
  s.playPending = true;
  s.stats.playCalls += 1;
  const p = s.video.play();
  if (p && typeof p.catch === "function") {
    p.then(() => {
      s.playPending = false;
      if (s.pauseQueued) {
        s.pauseQueued = false;
        if (!s.video.paused) s.video.pause();
      }
    }).catch((err: unknown) => {
      s.playPending = false;
      s.pauseQueued = false;
      s.stats.playRejects += 1;
      const name = (err as Error)?.name || String(err);
      s.stats.lastPlayError = name;
      // NotAllowedError is the platform withholding permission outright — fall
      // back to seek-driven advance so the picture keeps moving, and ask again
      // after PLAY_RETRY_MS in case the condition has lifted. AbortError just
      // means a pause() or load() interrupted this same play(), which the
      // queued pause above already exists to prevent going forward; it clears
      // on its own and is not a permission problem.
      if (name === "NotAllowedError") s.playBlockedUntil = performance.now() + PLAY_RETRY_MS;
    });
  } else {
    s.playPending = false;
  }
}

/**
 * Ask the element to fetch and paint a frame without running the story: a
 * play() with a pause queued behind it, rate-limited to PLAY_RETRY_MS. See the
 * `prime` entry on ScrubEngine for why this is the request to make.
 */
function primeElement(s: EngineState): boolean {
  const now = performance.now();
  if (s.playPending || now < s.playBlockedUntil) return false;
  // `lastPrimeAt` of 0 means never — and has to be read that way, because
  // performance.now() is itself under PLAY_RETRY_MS for the first two seconds
  // of the page's life, which is exactly when the first prime is asked for.
  if (s.lastPrimeAt && now - s.lastPrimeAt < PLAY_RETRY_MS) return false;
  s.lastPrimeAt = now;
  s.stats.primes += 1;
  requestPlay(s);
  // Queued behind the pending play(), so it lands the moment the element is
  // actually playing: enough to have fetched and painted a frame, not enough
  // to have moved the story.
  requestPause(s);
  return true;
}

/**
 * `force` skips the "already there" check. It exists for the HAVE_METADATA
 * priming seek, where currentTime may well equal the target and still no
 * frame has been decoded: the seek is the request for the frame, not a
 * correction to the playhead.
 */
function issueSeek(s: EngineState, to: number, force = false) {
  const target = clamp(quantize(to), 0, Math.max(0, s.duration - FRAME));
  if (s.seeking) {
    // Never build a queue: the newest target simply replaces the previous one.
    s.queued = target;
    return;
  }
  if (!force && Math.abs(s.video.currentTime - target) < EPSILON) return;
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
  const now = performance.now();
  for (const s of engines) {
    const v = s.video;
    if (!s.active) continue;

    // HAVE_NOTHING: no duration, no frame table, nothing a seek can address.
    // Only the element's own loading — or a prime() from the caller — can
    // move it from here.
    if (v.readyState < 1) continue;

    // A seek that never came back. Release it so the engine can act again
    // rather than parking every later target behind a `seeked` that is not
    // coming. See SEEK_WATCHDOG_MS.
    if (s.seeking && now - s.seekStartedAt > SEEK_WATCHDOG_MS) {
      s.seeking = false;
      s.queued = null;
      s.stats.seekTimeouts += 1;
    }

    // HAVE_METADATA: the element knows the file but has decoded nothing, and
    // it will not decode anything on its own.
    //
    // This used to be `readyState < 2 → skip`, on the assumption that an
    // element with preload="auto" always climbs past 2 by itself. iOS breaks
    // the assumption two ways: WebKit caps preload at metadata whenever it has
    // decided not to preload (cellular, typically), and Low Power Mode refuses
    // play(). Under either the element parks here, the old gate never opened,
    // and the film was a poster that scrolled — every scene "failed to load".
    // Both paths still honour a seek, which WebKit answers by preparing the
    // pipeline it declined to prepare for preload and decoding the frame. So
    // ask for the target frame, then wait for it. `seeked` lifts readyState
    // to 2 and the ordinary branches below take over.
    if (v.readyState < 2) {
      if (!s.seeking && now - s.lastSeekEndedAt > PRIME_SEEK_INTERVAL_MS) {
        s.mode = "seek";
        issueSeek(s, s.target, true);
      }
      // A priming seek the watchdog had to abandon means this agent is not
      // going to decode on a seek alone. play() is the other request WebKit
      // always answers with a fetch; ask that way too, at its own rate limit.
      if (s.stats.seekTimeouts > 0) primeElement(s);
      continue;
    }

    const delta = s.target - v.currentTime;
    const abs = Math.abs(delta);
    /** The story is being carried forward, as opposed to settling or reversing. */
    const advancing = s.velocity > ADVANCING_VEL_MIN;

    // The picture is AHEAD of the scroll while the story is still advancing.
    //
    // By less than a frame: nothing to do here — the play path below reads
    // the negative gap as "slow down" and the target walks into the picture
    // while it keeps moving. See LEAD_DEAD_ZONE_FRAMES for why stopping it
    // instead was the stutter on iOS.
    //
    // By more, up to the leash: this is the floors doing their job, not an
    // error, so it is HELD rather than corrected — the target walks into the
    // frame already on screen and playback resumes underneath it. Only a lead
    // past the leash, or a story actually running backwards, where waiting
    // would never converge, is worth the seek. See LEAD_MAX_FRAMES.
    const slightlyAhead = delta < 0 && advancing && -delta <= LEAD_DEAD_ZONE_FRAMES * FRAME;
    if (delta < 0 && advancing && !slightlyAhead && -delta <= LEAD_MAX_FRAMES * FRAME) {
      requestPause(s);
      s.mode = "idle";
      continue;
    }

    // Close enough, and not being carried — hold this frame. While advancing
    // the floors below deliberately keep playing through a gap this small,
    // which is what stops the pause/play cycling at low speed.
    if (abs < EPSILON && !advancing) {
      requestPause(s);
      s.mode = "idle";
      continue;
    }

    // Backwards past the leash: media elements cannot play in reverse, so this
    // is the one case that must seek. Single in-flight, frame-quantized, aimed
    // ahead of the scroll by one seek-latency.
    if (delta < 0 && !slightlyAhead) {
      requestPause(s);
      s.mode = "seek";
      issueSeek(s, leadTarget(s));
      continue;
    }

    // Forward, but too far to catch up by playing — jump. Also the fallback
    // path while play() stands refused (playBlockedUntil): with no permission
    // to play, seeking is the only way left to advance, so treat every forward
    // gap as "too far" rather than waiting for FORWARD_SEEK_GAP and reading as
    // a freeze in the meantime.
    if (delta > FORWARD_SEEK_GAP || now < s.playBlockedUntil) {
      requestPause(s);
      s.mode = "seek";
      issueSeek(s, leadTarget(s));
      continue;
    }

    // An element that has ENDED is parked, never played. play() on an ended
    // element restarts it from zero — that is the spec — and this engine would
    // then chase its own restart with a seek to the end, where it ends again:
    // a play/seek loop, invisible because the element is hidden, running in
    // the background of every scene after the first. The outgoing track of
    // a handover lands here by design (parked on its last frame, the video
    // run out under it), and its frozen velocity kept it inside the dead
    // zone above rather than in the hold. Idle, and the seek branches above
    // still bring it back if the story ever returns to it.
    if (v.ended) {
      requestPause(s);
      s.mode = "idle";
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
    let rate = clamp(feedForward + delta / RATE_TIME_CONSTANT, floor, s.rateCeiling());
    for (const even of CADENCE_RATES) {
      if (Math.abs(rate - even) < CADENCE_SNAP) {
        rate = even;
        break;
      }
    }
    const change = Math.abs(v.playbackRate - rate);
    if (
      change > RATE_WRITE_HYSTERESIS &&
      (change >= RATE_WRITE_URGENT || now - s.lastRateWriteAt >= RATE_WRITE_INTERVAL_MS)
    ) {
      v.playbackRate = rate;
      s.lastRateWriteAt = now;
      s.stats.rateWrites += 1;
    }
    // A pause queued behind a play() that has not settled yet is a pause this
    // engine no longer wants: the tick that queued it has been superseded by
    // this one, which wants the picture moving. Left in place it would land
    // the moment play() resolved and cost another restart to undo.
    s.pauseQueued = false;
    if (v.paused) requestPlay(s);
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
    playPending: false,
    pauseQueued: false,
    playBlockedUntil: 0,
    lastSeekEndedAt: 0,
    lastPrimeAt: 0,
    lastRateWriteAt: 0,
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
      playCalls: 0,
      rateWrites: 0,
      seekTimeouts: 0,
      primes: 0,
    },
  };

  let boundVideo = video;

  const onSeeked = () => {
    const ms = performance.now() - state.seekStartedAt;
    state.seeking = false;
    state.lastSeekEndedAt = performance.now();
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

  /**
   * The element was reset — a load() or a new src. Any seek in flight is
   * gone without a `seeked` (a play() in flight rejects with AbortError on
   * its own), so the bookkeeping is cleared here rather than left for the
   * watchdog. The target is kept: the ticker re-seeks the fresh element to it
   * as soon as it has metadata, which is how a track swapped to its local
   * copy lands back on the frame it was holding.
   */
  const onEmptied = () => {
    state.seeking = false;
    state.queued = null;
    state.lastSeekEndedAt = 0;
    state.mode = "idle";
  };

  video.addEventListener("seeked", onSeeked);
  video.addEventListener("emptied", onEmptied);

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
      boundVideo.removeEventListener("emptied", onEmptied);
      state.video = el;
      state.seeking = false;
      state.queued = null;
      // A play()/pause() in flight on the outgoing element must not act on the
      // element it hands over to once its promise settles.
      state.playPending = false;
      state.pauseQueued = false;
      state.playBlockedUntil = 0;
      state.lastSeekEndedAt = 0;
      state.lastPrimeAt = 0;
      state.lastRateWriteAt = 0;
      boundVideo = el;
      el.addEventListener("seeked", onSeeked);
      el.addEventListener("emptied", onEmptied);
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
    prime: () => primeElement(state),
    retryPlay: () => {
      state.playBlockedUntil = 0;
    },
    park: () => {
      state.velocity = 0;
      state.target = clamp(state.video.currentTime, 0, Math.max(0, duration - FRAME));
      state.lastTarget = state.target;
      state.queued = null;
      requestPause(state);
      state.mode = "idle";
    },
    preroll: () => {
      if (state.playPending || !state.video.paused) return false;
      // At the floor rate the queued pause lands before half a frame has
      // gone by; the rate formula rewrites this the moment the scroll asks
      // for movement.
      if (Math.abs(state.video.playbackRate - RATE_MIN) > 0.001) state.video.playbackRate = RATE_MIN;
      return primeElement(state);
    },
    stats: () => ({ ...state.stats }),
    destroy: () => {
      state.active = false;
      boundVideo.removeEventListener("seeked", onSeeked);
      boundVideo.removeEventListener("emptied", onEmptied);
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
