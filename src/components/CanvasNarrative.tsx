import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap, ScrollTrigger } from "../lib/gsap";
import { REFRESH_JOURNEY } from "../lib/scrollOrder";
import {
  FPS,
  GLOBAL_DURATION,
  GLOBAL_FRAMES,
  MEDIA_EPS,
  MEDIA_FPS,
  MEDIA_SCALE,
  OVERLAYS,
  SCROLL_VH_PER_SECOND,
  SEGMENTS,
  SEGMENT_START_FRAME,
  forwardFrameToReverseFrame,
  frameToMediaTime,
  locateFrame,
  logicalFrameToMediaFrame,
  mediaFrameCount,
  mediaFrameToLogicalFrame,
  reverseFrameToForwardFrame,
} from "../content/timeline";
import { OverlayCard } from "./OverlayCard";
import { SystemRail } from "./SystemRail";

type CanvasNarrativeProps = {
  id?: string;
  /** Extra seconds of scroll after the footage ends, holding the last frame. */
  settle?: number;
  closing?: ReactNode;
  hero?: ReactNode;
  /** Renders the technical HUD used by the diagnostic route. */
  debug?: boolean;
};

/**
 * The two smoothing stages between the scroll wheel and the playhead.
 *
 * A mouse wheel is not a scroll — it is a burst of discrete jumps, ~100 px
 * each, tens of milliseconds apart. Measured against a continuous ramp over
 * the same distance, the wheel made the canvas present a new frame every
 * 17 ms against 33 ms: the controller saw a large gap on every notch,
 * commanded the rate ceiling to close it, arrived, and stopped — burst,
 * pause, burst. That oscillation IS the stutter reported as "skipping
 * frames"; every frame is there, they just arrive at double speed and then
 * not at all.
 *
 * SCRUB is ScrollTrigger's catch-up time for the timeline; DAMPING is the
 * exponential rate at which the rendered frame chases that timeline (higher =
 * faster = twitchier). Both were tuned against trackpads, where the input is
 * already continuous, and both are too eager for a wheel. Values below come
 * from the sweep in wheel-vs-smooth.mjs.
 */
const SCRUB = 1.1;
const DAMPING = 6;

/**
 * The wheel governor: while the journey owns the screen, a gesture may not
 * advance the page faster than the film can be shown.
 *
 * Everything before this treated the symptom. A 60 Hz screen showing 24 fps
 * media can present at most 2.5x real time, and a wheel spin asks for far
 * more; smoothing the target and lengthening the runway only changed how the
 * shortfall was distributed — the controller still ran at the ceiling,
 * arrived, stopped, and repeated. Three rounds of tuning moved the stutter
 * around without removing it.
 *
 * So the input is capped instead of the output. Wheel deltas are collected
 * and released into the scroll at a rate the presentation path can actually
 * sustain, which means the playhead is never asked to catch up and the
 * burst-pause has nothing to feed on. Capping the INPUT is also what keeps
 * the scrollbar, the overlays and the picture in agreement: they all follow
 * the same (now bounded) scroll position, so nothing drifts apart the way it
 * would if the canvas alone were rate-limited.
 *
 * ceiling x this fraction is the budget. 1.0 spends the whole presentable
 * rate: it was picked by the client over 0.8 in side-by-side testing on real
 * hardware, and the reason it wins is that the ceiling is already the honest
 * physical limit — holding back a further fifth only made the page feel heavy
 * without buying smoothness the screen could show. Anything ABOVE 1.0 asks for
 * frames that cannot be presented and the burst-pause returns, so this is the
 * top of the useful range, not a midpoint.
 */
const GOVERNOR_FRACTION = 1.0;
/**
 * Ceiling on the backlog, in seconds of scrolling. A flick that would take
 * ten seconds to play out is not obedience, it is a hostage situation: past
 * this the surplus is dropped and the gesture simply ends where the budget
 * reached.
 */
const GOVERNOR_MAX_BACKLOG_S = 0.9;
/**
 * The floor, in STORY FRAMES: the least the film may advance for one wheel
 * event, however small that event was.
 *
 * The ceiling exists because a wheel can ask for more than the screen can
 * show. This is the opposite failure, and it is just as real: a trackpad
 * emits deltas of a few pixels, and a few pixels is a fraction of one frame,
 * so the picture does not change at all. Nothing is broken — the film is
 * simply being advanced slower than film exists — but the visitor reads a
 * still image under their moving finger as the page being heavy.
 *
 * Rounding each event up means every input produces visible movement. Two
 * consequences worth stating: fine-grained scrubbing becomes impossible
 * (deliberate — that is the behaviour being removed), and trackpad users
 * travel further per gesture than they asked for.
 *
 * Three frames, not one. One frame is the least that guarantees the picture
 * changes, but "changed by one frame" still reads as a slideshow to someone
 * inching along. Three is 70 px against the 119 px an ordinary mouse notch
 * delivers, so a deliberate nudge now lands in the same register as a normal
 * scroll instead of a fifth of it — which is what closes the gap between the
 * floor and the ceiling that the client asked for. It cannot go much higher
 * without a single trackpad twitch out-travelling a full wheel click, which
 * would feel broken in the other direction.
 */
const GOVERNOR_MIN_STEP_FRAMES = 3;

/**
 * The one seam the film dissolves instead of cutting.
 *
 * Every other crossing is a straight cut, by design: the scenes were
 * generated between shared stills, so a scene's last frame IS the next one's
 * first and a fade would only soften something already continuous. The
 * 04 -> 05 seam is the exception, and it was measured rather than guessed.
 * Against the same scene's own frame-to-frame step — the honest yardstick for
 * one frame of motion at that camera speed — the seam is worth more than four
 * frames:
 *
 *   1 frame inside scene 05   27.3 dB
 *   2 frames                  24.2 dB
 *   4 frames                  22.0 dB
 *   THE SEAM                  20.7 dB
 *
 * It cannot be fixed by realigning: scene 05's frame 0 is already the closest
 * match to scene 04's last frame (20.74 dB, falling monotonically to 19.83 by
 * frame 4), and scene 04 is confirmed as the true predecessor (20.7 dB
 * against 11-12 dB for every other scene). The generator simply did not
 * reproduce its conditioning still as frame 0 — it opens slightly further
 * along the camera path. A second effect stacks on top: scene 04 ends nearly
 * static (42 dB between frames) while scene 05 opens fast (27 dB), so the eye
 * takes a jolt in velocity as well as in position.
 *
 * It shipped OFF for a while: at three frames the dissolve was
 * indistinguishable from the cut at seam 04, and a cut that looks the same is
 * the better answer. That changed when the client felt 01->02 and 02->03 —
 * the two seams this file's own note had already flagged as candidates.
 * `?seam=off` restores the cut for comparison.
 *
 * Brightness, checked separately, is continuous at every seam (steps of
 * 0.3-0.8 on a 16-235 scale), so nothing here is compensating for a flash.
 */
const SEAM_FADE_FRAMES = 3;
/**
 * Segment INDEXES whose start is dissolved. Every seam was measured against
 * the step the INCOMING scene takes between its own consecutive frames — the
 * only fair yardstick, because a jump matters in proportion to the motion it
 * has to hide behind:
 *
 *   01->02  21.9 dB vs 25.9 — a camera advance, 4.0 dB adrift
 *   02->03  28.3 dB vs 45.9 — 17.6 dB adrift, the worst of the four. Scene 03
 *           opens nearly static, so a push-in has NO motion to hide behind;
 *           in absolute terms it is the mildest jump and perceptually the
 *           harshest.
 *   03->04  23.6 dB vs 25.3 — 1.7 dB, continuous. Left alone.
 *   04->05   20.8 dB vs 27.5 — 6.7 dB adrift.
 *
 * Trimming was tested first and does not help: the gaps are constant camera
 * offsets, not timing offsets. Scene 02's last frame sits ~36.7 dB from EVERY
 * one of scene 03's first 32 frames, so there is no cut point that closes it.
 * The real fix is upstream — regenerate the scene from its predecessor's true
 * final frame — and this dissolve is what stands in until then.
 */
const SEAM_AT = new Set([1, 2, 4]);

/**
 * How early (in frames) the next segment is warmed up.
 *
 * Raised from 48 after the 2026-08-08 v3 master swap: several derivatives got
 * markedly heavier at the same GOP-6/CRF settings (scene 02 forward alone went
 * 14.0 MB -> 39.8 MB), which means more bytes to fetch and more to decode
 * before the incoming track can confirm the boundary frame. HANDOVER_MAX_MS
 * hides a short miss by holding the outgoing frame, but it cannot hide a miss
 * it was never given time to prevent — more lead acts before the gate has to.
 * This value is a proportional guess (~1.75x), not a re-measurement: it has
 * not been run through media-comparison/scene01-fidelity/tools/boundary-bench.mjs
 * against the new masters, which is the tool to confirm or retune it with.
 */
const PRELOAD_LEAD_FRAMES = 84;
/** Canvas is capped at this device pixel ratio to keep compositing cheap. */
const MAX_DPR = 2;
/**
 * Half a PHYSICAL frame — below this the playhead already shows what was asked.
 *
 * Tied to the file's rate, not the timeline's: on 48 fps media the tolerance
 * halves to 10,4 ms, because half a frame there really is half a frame. Every
 * other tolerance in this file stays in logical frames, which is why this is
 * the only one imported from the media layer.
 */
const EPS = MEDIA_EPS;

// ── playhead tuning (see drivePlayhead) ─────────────────────────────────────
/** Gap, in footage-seconds, that maps to playbackRate 1.0. */
const RATE_TAU = 0.3;
/** Below this the picture crawls and reads as stalled — pause instead. */
const RATE_MIN = 0.08;
/**
 * Ceiling on playbackRate, set by what the SCREEN can show.
 *
 * An earlier version of this called the budget `DECODE_BUDGET_FPS` and blamed
 * the decoder. A controlled comparison across resolutions refuted that: the
 * discard rate is identical for 4K, 1440p and 1080p and depends only on how
 * many frames per second are asked for — 0,9% at 48, 18% at 72, 38% at 96,
 * 58% at 144. A 24 fps file at rate 3 drops the same 17,5% as a 48 fps file at
 * rate 1,5, because both ask for 72. It is the presentation path, not decode:
 * a display cannot show more frames than it refreshes, so everything above
 * that is decoded and thrown away, starving the frames that would have been
 * shown.
 *
 * So the budget is the refresh rate, measured rather than assumed. A flat 72
 * wasted a fifth of the work on a 60 Hz panel and left half the capacity unused
 * on a 120 Hz one.
 */
const REFRESH_FALLBACK_HZ = 60;
const REFRESH_MIN_HZ = 50;
const REFRESH_MAX_HZ = 240;
/**
 * Median interval over a short rAF sample. Median, not mean, because the first
 * frames after load are routinely long and would drag an average down into
 * nonsense; and clamped, because a throttled or hidden tab reports intervals
 * that describe the tab's suspension, not the panel.
 */
let refreshHz = REFRESH_FALLBACK_HZ;
const measureRefresh = () => {
  const gaps: number[] = [];
  let last = 0;
  let n = 0;
  const tick = (ts: number) => {
    if (last) gaps.push(ts - last);
    last = ts;
    if (++n < 24) {
      requestAnimationFrame(tick);
      return;
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1];
    if (median > 0) {
      const hz = 1000 / median;
      if (hz >= REFRESH_MIN_HZ && hz <= REFRESH_MAX_HZ) refreshHz = Math.round(hz);
    }
  };
  requestAnimationFrame(tick);
};

/**
 * Rate ceiling, recomputed from the measurement.
 *
 * Never below 1: the story must always be able to advance at real time, even on
 * a panel whose refresh happens to sit under the media's frame rate. And never
 * above 3, because past that the picture stops reading as motion and starts
 * reading as a skip — the original reason this constant existed.
 */
const rateCeiling = () => Math.min(3, Math.max(1, refreshHz / MEDIA_FPS));
/**
 * Behind by more than this many seconds of story, playing cannot catch up.
 *
 * A fast flick advances the target at ten times story speed. Against a ceiling
 * of 1,5 the gap grows at eight seconds of story per second of wall clock, so
 * the old forward branch — which never seeks while moving — was committing the
 * decoder to a chase it could not finish, at maximum rate, for the whole
 * gesture. One seek costs about 17 ms of latency inside a scene; the chase
 * costs the rest of the gesture.
 */
const RECOVERY_GAP = 0.5;
/** Never chain recovery seeks faster than one can plausibly land. */
const RECOVERY_MIN_MS = 150;
/**
 * Above this story-rate the target is mid-sweep. Used by the STANDBY arm:
 * chasing the opposite representation through a sweep armed it onto positions
 * the sweep had already left, and each of those seeks competed with the
 * visible track's decode.
 *
 * An earlier round also gated RECOVERY seeks on this line — no seeking at all
 * mid-sweep. It fixed the cadence (57 presented frames against 34 across an
 * 800 ms flick) but traded it for position: the debt the sweep accumulated
 * was paid in ONE seek when the gesture landed, felt on real hardware as a
 * frame JUMP right at the end of every hard flick. The recovery path now
 * seeks THROUGH the sweep instead, with a predictive lead (below) so each
 * landing is on target rather than three frames stale — position and cadence
 * held together instead of traded.
 */
const RECOVERY_MAX_VEL = 3.0;
/**
 * How far ahead of the CURRENT target a recovery seek aims, per unit of
 * story-rate: the seek lands ~one landing-latency later, and by then a moving
 * target has moved. Lead = velocity x landing latency, so the decoder
 * arrives where the story IS, not where it was when the seek was issued.
 * Landing latency is the GOP-6 measurement (33 ms median, 50 ms worst) plus
 * one tick; the cap keeps a mis-estimated velocity from aiming into fantasy.
 */
const RECOVERY_LANDING_S = 0.06;
const RECOVERY_LEAD_MAX_FRAMES = 36;
/** The gesture must be still this long before a resync seek is allowed. */
const SETTLE_MS = 140;
/**
 * Error tolerated before a backward seek is worth paying for. Under this,
 * holding the frame beats seeking — it is also what keeps small upward jitter
 * from seeking at all.
 */
const RESYNC_GAP = 0.3;
/** Target movement below this is noise, not a gesture. */
const MOVE_EPS_FRAMES = 0.5;
/**
 * How far the incoming segment's PRESENTED frame may sit from the requested one
 * before the canvas is allowed to switch to it.
 *
 * Asymmetric, and that is the point. Being a little BEHIND is the normal state
 * of Path A — the picture always trails the scroll slightly while playback
 * catches up — so demanding an exact match at a crossing would hold the old
 * segment for as long as the gesture keeps running. A first attempt did exactly
 * that: it forced two handovers after 879 ms of holding, which is a worse stall
 * than the hitch it was meant to remove.
 *
 * Being AHEAD is different: it can only mean the element is parked somewhere
 * else in the shot, which is precisely the wrong frame this gate exists to keep
 * off screen.
 */
const HANDOVER_LAG_FRAMES = 12;
const HANDOVER_AHEAD_FRAMES = 2;

/**
 * Direction hysteresis, in global frames per second of story time.
 *
 * Measured on this machine: a hand resting on the trackpad keeps |velocity|
 * under about 1,2 frames/s, while a deliberate reversal passes 8 frames/s
 * inside ~40 ms. 2,5 sits clear of the noise floor and well under a real
 * gesture; 70 ms of persistence is shorter than the ~90 ms a reversal takes to
 * become visible, so the switch is already armed before anyone could perceive a
 * delay. Inside the dead zone the current direction simply holds.
 */
const DIR_MIN_VEL_FRAMES = 2.5;
const DIR_PERSIST_MS = 70;
/**
 * How far the standby representation may drift before it is re-armed. Sits
 * just inside the handover's lag tolerance, so a reversal always lands close
 * enough to switch immediately, while a gesture crossing this many frames pays
 * one seek rather than one per frame.
 */
const ARM_REFRESH_FRAMES = 10;
/**
 * Ceiling on how long the outgoing segment may be held at a crossing.
 *
 * Deliberately short. The gate exists to keep a wrong frame off screen for the
 * few milliseconds a decoder needs, not to freeze the hero: at 900 ms an
 * unlucky crossing held longer than the artefact it was preventing.
 */
const HANDOVER_MAX_MS = 250;

/**
 * Pre-roll: how many story frames before a boundary the INCOMING element
 * starts PLAYING — not merely sitting armed on its entry frame.
 *
 * Motivated by measurement, 2026-08-08, on the 1440p set: the handover gate
 * holds for only 17–50 ms at every crossing (boundary-hold bench, 10 cases),
 * yet the worst visually-new-frame gap around a crossing is a near-constant
 * ~283 ms, in both directions, at every speed — and `?standby=off` does not
 * move it. That signature is not the gate and not standby seeks; it is the
 * play() pipeline start of the incoming element, paid exactly at the cut.
 *
 * The relay-runner rule instead: the incoming starts rolling at RATE_MIN
 * (0.08x) a beat before the baton arrives, so the crossing becomes a rate
 * change on an element that is ALREADY streaming — the one transition this
 * whole controller is built around being smooth.
 *
 * At 0.08x the element advances ~1.9 media frames per second, so over the
 * longest plausible approach (these 12 story frames at a 0.5x crawl, ~1 s)
 * it drifts under 2 frames past its entry — inside HANDOVER_AHEAD_FRAMES,
 * which is what keeps the gate's arithmetic untouched. A cap 3 frames past
 * entry reins in the pathological crawl case rather than letting the roll
 * run away from the story.
 *
 * Outcome, same bench, same day: slow crossings dropped to the bench
 * environment's own noise floor (117 ms worst against a 100 ms no-boundary
 * control), gate holds stayed ≤ 52 ms with zero forced switches across 30
 * crossings, and the reverse direction was unaffected. Medium-speed
 * crossings could not be resolved there — headless software decode has a
 * ~250 ms stall floor at that scroll rate with no boundary in sight — so
 * their verdict belongs to real hardware, where `?preroll=off` remains the
 * live A/B.
 */
const PREROLL_LEAD_FRAMES = 12;
const PREROLL_MAX_AHEAD_FRAMES = 3;

/**
 * `?playhead=seek` restores the old seek-per-frame model for A/B measurement.
 * Folded away in production builds, so the shipped bundle only ever has the
 * rate-steered path.
 */
const legacySeekMode =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("playhead") === "seek";

/**
 * `?handover=off` restores the old behaviour of switching segments the moment
 * readyState allows it, for measuring the boundary hitch against the fix.
 * Dev-only, folded away in production alongside legacySeekMode.
 */
const legacyHandover =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("handover") === "off";

/**
 * `?reverseMode=seek` keeps the reverse representation but drives it by seeks,
 * to separate "the reverse file helps" from "continuous playback helps".
 * `?reverseMedia=off` (read in timeline.ts) drops the reverse files entirely,
 * which puts the controller back on the single-direction Path A behaviour.
 */
const legacyReverseMode =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("reverseMode") === "seek";

/**
 * Diagnostic isolators, development only.
 *
 *   ?standby=off     stop arming the opposite representation. Costs one seek on
 *                    the first reversal; tells us whether standby seeks are
 *                    stealing decode bandwidth from the visible track.
 *   ?fixedRate=N     pin playbackRate instead of feed-forward steering, to see
 *                    how much of the unevenness is the controller modulating
 *                    the rate rather than the pipeline.
 */
const standbyOff =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("standby") === "off";
/**
 * `?preroll=off` parks the incoming element until the crossing, as before
 * 2026-08-08 — the A/B for measuring the pipeline-start gap the pre-roll
 * exists to remove.
 */
const prerollOff =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("preroll") === "off";
/**
 * `?surface=native` shows the active <video> directly, full size and properly
 * composited, instead of drawing it into the canvas.
 *
 * The decoders normally live at 1x1 px, opacity 0, at left:-9999 — deliberately
 * never composited. Chrome is free to service a non-composited video's frame
 * pipeline lazily, so the cadence measured through it may belong to the probe
 * rather than to the picture. This mode removes exactly that variable: same
 * controller, same media, same telemetry, same cover crop — only drawImage and
 * the off-screen placement are gone. Diagnostic only.
 */
const surfaceNative =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("surface") === "native";
/**
 * `?debug=1` shows the technical HUD on the REAL page.
 *
 * Distinct from the `debug` prop, which the diagnostic route sets and which
 * also hides the overlays — useful for measuring the canvas alone, useless for
 * judging the experience. This flag adds the readout and leaves everything else
 * exactly as a visitor sees it, which is what manual validation needs.
 */
const hudFlag =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "1";
const fixedRate = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("fixedRate")) || 0
  : 0;
/**
 * `?scrub=N` and `?damp=N` override the two smoothing stages between the
 * scroll and the playhead, for sweeping them against real wheel input.
 * Dev-only; production uses the constants chosen from those sweeps.
 */
const scrubOverride = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("scrub")) || 0
  : 0;
const dampOverride = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("damp")) || 0
  : 0;
/** `?recovery=N` overrides RECOVERY_GAP, for sweeping it against wheel input. */
const recoveryOverride = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("recovery")) || 0
  : 0;
/**
 * The idle prefetch is OFF by default, and stays off until it can be made
 * safe. It exists to fill the HTTP cache on a cold CDN visit so a scene
 * boundary never waits on the network — a real benefit, but a speculative one,
 * and the cost turned out to be measurable and immediate.
 *
 * Two defects, both mine, both found by the client scrolling rather than by a
 * bench. The first version read every response with arrayBuffer(), holding a
 * whole scene in memory to throw it away, which roughly doubled dropped frames
 * from scene 02 onward. The second gated the START of each file on the scroll
 * being still — but an in-flight transfer of 15 MB keeps running once begun,
 * and `lastMoveAt` is zero at load, so it fired immediately on arrival and
 * contended with scene 01 itself. That is the opposite of the intent.
 *
 * Doing this properly means small Range requests that can be abandoned the
 * moment a gesture starts, so the transfer is genuinely interruptible. Until
 * that exists, the journey is better served by leaving the network alone:
 * `?prefetch=on` re-enables it for that work.
 */
const prefetchOn =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("prefetch") === "on";
/** `?governor=off` restores raw wheel input; `?governor=N` sets the fraction. */
const governorParam = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("governor")
  : null;
const governorOff = governorParam === "off";
/**
 * The seam dissolve, ON by default now that the client has felt the two seams
 * the measurement had already singled out. `?seam=off` restores the hard cut
 * for an A/B in dev — the flag flipped meaning, so the comparison stays
 * one keystroke away rather than a rebuild.
 */
const seamOn =
  !import.meta.env.DEV || new URLSearchParams(window.location.search).get("seam") !== "off";
const governorFraction = Number(governorParam) || GOVERNOR_FRACTION;
const useReverseMedia = SEGMENTS.some((s) => s.reverseSrc !== s.src);

/**
 * Playback policy v2 — perceptual smoothness first while the scroll is moving.
 *
 * The source is 24 fps and the rate follows the scroll, so the number of new
 * frames per second of wall clock is fixed by arithmetic: 0,5x gives 12, 0,3x
 * gives 7,2, 0,13x gives 3,1. Nothing short of interpolation changes that, and
 * interpolation is out of scope.
 *
 * What IS ours to choose is how that budget is spent. v1 spends it badly at low
 * speed: it stops the element every time the playhead lands within half a frame
 * of the target and restarts it a moment later — measured at 74 pause/play
 * cycles and 1416 ms of dead time in a single 6,2 s gesture at 0,5x, which turns
 * an even 12 fps into one with a 400 ms tail.
 *
 * v2 keeps the same frame budget and makes it even:
 *
 *   moving    never stop for a small error. The rate has a FLOOR, so the
 *             picture keeps moving at a speed that still reads as motion, and
 *             the gap becomes a correction on top of the scroll's own velocity.
 *   settling  the gesture ended; converge to the target at a lower floor, so
 *             the shot comes to rest instead of slamming to a halt.
 *   settled   hold, and pay at most one seek if the error is worth fixing.
 *
 * The floor makes the playhead run AHEAD when the scroll is slower than it, so
 * a leash bounds that lead. The leash trades cadence against sync explicitly:
 * duty cycle is scrollSpeed / floor regardless of leash length, so the leash
 * only chooses whether you get long smooth runs separated by clear holds, or
 * the short bursts v1 already produces. Long runs are the bet; the sweep below
 * is what settles it.
 */
const MOVING_RATE_MIN = 0.5;
/** Coming to rest may go slower than motion — nothing is being tracked. */
const SETTLING_RATE_MIN = 0.15;
/** How far, in frames, the picture may run ahead of the scroll before holding. */
const LEAD_MAX_FRAMES = 12;
/** Hysteresis: the hold is released once the lead has closed back to this. */
const LEAD_RELEASE_FRAMES = 2;
/** How long "settling" lasts before the playhead is simply parked. */
const SETTLE_GRACE_MS = 600;
/**
 * Displacement, in seconds, beyond which no amount of playing will fix the
 * error and one seek is the cheaper answer.
 *
 * It must sit well ABOVE LEAD_MAX_FRAMES, and the first version did not: at
 * 1,0 s it equalled a 24-frame leash, so the seek always fired first and the
 * leash never ran at all. The picture then played a second ahead, jumped a
 * second back, and repeated — which a frame counter happily scores as high
 * cadence while the eye sees a rewind loop. 2,5 s is 60 frames, five times the
 * leash, so the two mechanisms cannot collide.
 */
const SYNC_GAP = 2.5;

type MotionState = "moving" | "settling" | "settled";

/**
 * v2 is NOT the shipped policy. It is opt-in via `?policy=v2`, and stays in the
 * tree because the measurement that rejected it is worth being able to repeat.
 *
 * Measured against v1 inside scene 05, sweeping the floor over 0,08 / 0,25 /
 * 0,50 / 0,75 / 1,00 and the leash over 10 / 12 / 24 / 36 / 120 frames:
 *
 *   1,00x  v2 wins — 52 pause/play cycles become 2, p95 66,7 -> 50,3 ms,
 *          target-to-screen error 3,1 -> 2,2 frames, duty 85% -> 100%.
 *   2,00x  a wash: better error and p99, slightly fewer unique frames.
 *   0,50x  v2 LOSES badly — 72 unique frames become 15, with a 4,6 s freeze.
 *   0,25x  v2 LOSES — 49 unique frames become 12, p50 167 -> 517 ms.
 *
 * The reason is structural, not a tuning miss. v1's overshoot branch pauses AND
 * seeks whenever the playhead runs past its target while moving, which quietly
 * makes it immune to arriving at a gesture already displaced — a backward jump,
 * a direction flip, a crossing. v2 refuses to seek while moving, so any lead it
 * inherits is worked off by the leash at the scroll's own speed, and at 0,5x a
 * 45-frame lead is 3,7 s of frozen picture. Every floor and leash combination
 * traded the same way: a better median for a far worse tail.
 *
 * So the aggressive resync in v1 is not the defect this round set out to remove.
 * It is the recovery mechanism, and it costs about 16 ms of p95 to keep.
 */
const legacyPolicy =
  !import.meta.env.DEV || new URLSearchParams(window.location.search).get("policy") !== "v2";
/** Sweep knobs for the validation pass; production uses the constants above. */
const movingRateMin = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("rateMin")) || MOVING_RATE_MIN
  : MOVING_RATE_MIN;
const leadMaxFrames = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get("lead")) || LEAD_MAX_FRAMES
  : LEAD_MAX_FRAMES;

/**
 * The whole journey rendered into ONE canvas from the five original masters.
 *
 * The five <video> elements are decoders only — none is ever visible, so a
 * boundary is a plain source switch on the next drawn frame: no crossfade, no
 * opacity change, no second video underneath, no poster. If the incoming
 * segment has not produced a frame yet, the canvas keeps the last good pixels
 * instead of clearing.
 *
 * Boundaries are computed in whole frames, never in accumulated seconds:
 * segment starts are 0 / 169 / 266 / 387 / 508 of 701.
 */
export function CanvasNarrative({ id, settle = 2, closing, hero, debug = false }: CanvasNarrativeProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  /** Reverse-order companion per segment. Same count, same order. */
  const revRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const heroRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLPreElement>(null);

  /** Where the scroll wants to be, in global frames. Written by ScrollTrigger. */
  const targetFrameRef = useRef(0);
  /** Where we actually are. Eased toward the target, frame-rate independent. */
  const renderFrameRef = useRef(0);
  const lastTsRef = useRef(0);
  /** Last target the scroll asked for, and when it last actually moved. */
  const lastTargetRef = useRef(0);
  const lastMoveAtRef = useRef(0);
  /** Previous tick's target, for the velocity estimate. */
  const prevTargetRef = useRef(0);
  const hasDrawnRef = useRef(false);
  const seekingRef = useRef<boolean[]>(SEGMENTS.map(() => false));
  const drawnSegRef = useRef(-1);
  const [preparing, setPreparing] = useState(true);
  /**
   * Set once, the first time a decoded VIDEO frame reaches the canvas. Distinct
   * from hasDrawnRef, which a resize deliberately clears — the poster must
   * never paint again after the footage has taken over.
   */
  const firstVideoFrameRef = useRef(false);
  /**
   * True once the opening segment has PRESENTED the intro frame — confirmed by
   * requestVideoFrameCallback reporting a mediaTime that lands on it, not by
   * readyState or by `seeked` alone. Until then the poster holds the screen.
   */
  const introConfirmedRef = useRef(false);

  const total = GLOBAL_DURATION + settle;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    // Assigned once the poster helper below exists; resizing before the footage
    // arrives has to repaint the still, because sizing a canvas clears it.
    let repaintPoster: (() => void) | null = null;

    const resize = () => {
      const r = section.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        hasDrawnRef.current = false;
        if (!firstVideoFrameRef.current) repaintPoster?.();
      }
    };
    resize();

    /**
     * Every segment is drawn with the SAME anchor: the frame is fitted by width
     * and anchored to the vertical centre of the 3876x2136 reference. Segment 3
     * is 3856x2148, so this keeps its horizontal field of view identical and
     * only trims the surplus height, instead of rescaling the whole picture.
     */
    let lastCrop = { sx: 0, sy: 0, sw: 0, sh: 0 };
    const drawSource = (source: CanvasImageSource, vw: number, vh: number) => {
      if (!vw || !vh) return false;
      const cw = canvas.width;
      const ch = canvas.height;
      // A transiently zero-sized canvas (layout not yet settled) would make
      // targetAr non-finite, which drawImage below silently no-ops on — but
      // without this guard the call still reports a successful draw and
      // permanently disables the poster fallback (see firstVideoFrameRef).
      if (!cw || !ch) return false;
      const targetAr = cw / ch;

      // cover, anchored at centre, computed from the source's own pixels
      let sw = vw;
      let sh = vw / targetAr;
      if (sh > vh) {
        sh = vh;
        sw = vh * targetAr;
      }
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      lastCrop = { sx, sy, sw, sh };
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
      hasDrawnRef.current = true;
      return true;
    };
    const draw = (v: HTMLVideoElement) => drawSource(v, v.videoWidth, v.videoHeight);

    /**
     * The opening still goes through drawImage on THIS canvas, not through an
     * <img> layered underneath it.
     *
     * An <img> with object-fit:cover is resampled by the compositor, the canvas
     * by Skia, and the two do not agree: measured against the canvas frame, a
     * layered poster lost 17.4% of its acutance at 1920x1058 and still 9.6% at
     * 2560x1411, which reads as the hero snapping into focus. Sharing one
     * drawImage path makes the resample identical, so the only difference left
     * between poster and first frame is AVIF quantisation (~45 dB).
     */
    const posterUrl = SEGMENTS[0].poster;
    let poster: HTMLImageElement | null = null;
    const paintPoster = () => {
      if (!poster || !poster.naturalWidth || firstVideoFrameRef.current) return;
      drawSource(poster, poster.naturalWidth, poster.naturalHeight);
      document.body.dataset.heroSource = "poster";
    };
    if (posterUrl) {
      poster = new Image();
      poster.decoding = "async";
      poster.src = posterUrl;
      if (poster.complete && poster.naturalWidth) paintPoster();
      else poster.addEventListener("load", paintPoster, { once: true });
    }
    repaintPoster = paintPoster;

    /**
     * A TRACK is one (segment, representation) pair — "segment 2 forward" or
     * "segment 2 reverse". Ten of them, indexed `seg * 2 + rep`, so every
     * per-element structure below is one flat array instead of two parallel
     * ones and there is no way to read the forward state of a reverse element.
     */
    const REP_FWD = 0;
    const REP_REV = 1;
    const TRACKS = SEGMENTS.length * 2;
    const trackOf = (seg: number, rep: number) => seg * 2 + rep;
    const segOf = (track: number) => track >> 1;
    const repOf = (track: number) => track & 1;
    const elementOf = (track: number) =>
      repOf(track) === REP_FWD ? videoRefs.current[segOf(track)] : revRefs.current[segOf(track)];

    /** Physical frames each file holds, once for the whole effect. */
    const physFrames = SEGMENTS.map((s) => mediaFrameCount(s.mediaFrames));

    /**
     * The PHYSICAL frame a representation must address to show a LOGICAL frame.
     *
     * This is the only place the two units meet in this file. `localFrame` comes
     * from locateFrame in 24 fps logical frames with the intro offset already
     * folded in; everything downstream of here — seekTo, presentedFrame, the
     * rate controller — is physical.
     *
     * The reverse file holds every frame the forward one does, so the mirror is
     * over the physical count. For scene 01 that means the frames behind the
     * editorial offset are simply never asked for in reverse; the offset lives
     * on the forward timeline and is not mirrored.
     */
    const frameFor = (seg: number, rep: number, localFrame: number) => {
      const physical = logicalFrameToMediaFrame(localFrame);
      return rep === REP_FWD
        ? physical
        : forwardFrameToReverseFrame(physical, physFrames[seg]);
    };

    /** A presented PHYSICAL frame, read back as the LOGICAL frame it shows. */
    const presentedLogical = (seg: number, rep: number, raw: number) =>
      raw < 0
        ? -1
        : mediaFrameToLogicalFrame(
            rep === REP_FWD ? raw : reverseFrameToForwardFrame(raw, physFrames[seg]),
          );

    const seeking: boolean[] = Array.from({ length: TRACKS }, () => false);
    const presentedFrame: number[] = Array.from({ length: TRACKS }, () => -1);
    const presentedTime: number[] = Array.from({ length: TRACKS }, () => -1);
    const presentedCount: number[] = Array.from({ length: TRACKS }, () => 0);
    const rvfcHandles: number[] = Array.from({ length: TRACKS }, () => 0);
    const seekedHandlers: { v: HTMLVideoElement; h: () => void }[] = [];
    /** Diagnostic listeners, attached only in development and removed with them. */
    const devListeners: { v: HTMLVideoElement; type: string; h: () => void }[] = [];

    /**
     * One persistent requestVideoFrameCallback loop per element, started once
     * and cancelled once. The callback writes state and nothing else — it never
     * captures a target, so a confirmation can never belong to a stale switch,
     * and no loop is created or torn down mid-gesture. That is what keeps the
     * "no per-target callbacks" rule true by construction rather than by
     * bookkeeping.
     */
    for (let t = 0; t < TRACKS; t++) {
      const v = elementOf(t);
      if (!v) continue;
      const onSeeked = () => {
        seeking[t] = false;
      };
      v.addEventListener("seeked", onSeeked);
      seekedHandlers.push({ v, h: onSeeked });
      if (typeof v.requestVideoFrameCallback !== "function") continue;
      const cb = (_now: number, meta: { mediaTime: number }) => {
        presentedTime[t] = meta.mediaTime;
        // Physical frame index: mediaTime belongs to the file, not the timeline.
        presentedFrame[t] = Math.floor(meta.mediaTime * MEDIA_FPS + 1e-4);
        presentedCount[t] += 1;
        if (import.meta.env.DEV) {
          // A seek is only paid off when a frame at (or past) the requested
          // position is actually on screen. `seeked` fires well before that.
          const p = sk.pending[t];
          if (p.at && Math.abs(presentedFrame[t] - p.frame) <= 1) {
            sk.latency.push(+(performance.now() - p.at).toFixed(1));
            sk.pending[t] = { at: 0, frame: -1 };
          }
        }
        rvfcHandles[t] = v.requestVideoFrameCallback(cb);
      };
      rvfcHandles[t] = v.requestVideoFrameCallback(cb);
    }

    /**
     * Seek accounting, development only.
     *
     * A seek is not done when `seeked` fires — that only says the playhead
     * moved. What matters is when a frame at the requested position reaches the
     * screen, which only requestVideoFrameCallback can say. The gap between the
     * two is the decoder's real cost and it is invisible to every other signal.
     *
     * `superseded` counts the requests dropped because the element was already
     * seeking: those are the ones that would form an unbounded queue if the
     * controller ever let them.
     */
    const sk = {
      started: 0,
      superseded: 0,
      redundant: 0,
      failed: 0,
      recoveries: () => recoveries,
      latency: [] as number[],
      pending: Array.from({ length: TRACKS }, () => ({ at: 0, frame: -1 })),
      /** Decoder saturation, sampled per gesture by the bench. */
      quality: () =>
        Array.from({ length: TRACKS }, (_, t) => {
          const v = elementOf(t);
          const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
          return q ? { t, dropped: q.droppedVideoFrames, total: q.totalVideoFrames } : null;
        }).filter(Boolean),
    };
    if (import.meta.env.DEV) {
      // Attached here rather than in the literal, so the property names are
      // minified away instead of shipping in the production bundle.
      (window as unknown as Record<string, unknown>).__cnSeek = Object.assign(sk, {
        rateMax: () => rateCeiling(),
        refreshHz: () => refreshHz,
      });
    }

    const seekTo = (track: number, mediaFrame: number) => {
      const v = elementOf(track);
      if (!v) return;
      if (seeking[track]) {
        sk.superseded += 1;
        return;
      }
      const t = frameToMediaTime(mediaFrame);
      if (Math.abs(v.currentTime - t) < EPS) {
        sk.redundant += 1;
        return;
      }
      seeking[track] = true;
      syncSeeks += 1;
      sk.started += 1;
      sk.pending[track] = { at: performance.now(), frame: mediaFrame };
      try {
        v.currentTime = t;
      } catch {
        seeking[track] = false;
        sk.failed += 1;
        sk.pending[track] = { at: 0, frame: -1 };
      }
    };

    /**
     * Arms a NON-ACTIVE track on the frame it will be asked for, so a crossing
     * or a reversal finds a confirmed frame waiting instead of a cold decoder.
     */
    const armedFor: number[] = Array.from({ length: TRACKS }, () => -1);
    /**
     * When each track was first warmed and first armed, so the boundary log can
     * say whether the incoming scene had time to be ready or was asked to
     * appear from cold.
     */
    const warmedAt: number[] = Array.from({ length: TRACKS }, () => 0);
    const armedAt: number[] = Array.from({ length: TRACKS }, () => 0);
    const arm = (track: number, mediaFrame: number, activeTrack: number) => {
      if (legacyHandover) return;
      if (track < 0 || track >= TRACKS || track === activeTrack) return;
      const v = elementOf(track);
      if (!v || v.readyState < 1 || seeking[track]) return;
      if (armedFor[track] === mediaFrame) return;
      armedFor[track] = mediaFrame;
      if (import.meta.env.DEV && !armedAt[track]) armedAt[track] = performance.now();
      seekTo(track, mediaFrame);
    };

    /**
     * Preload policy. Ten 4K decoders must never be live at once, so only the
     * tracks a gesture can plausibly need in the next moment are warmed:
     *
     *   the active track;
     *   the opposite representation of the SAME segment, for a reversal;
     *   the next segment in the direction of travel, in that direction's rep.
     *
     * Three or four warm decoders, everything else left at preload="none" and
     * paused. Warming is one-way and idempotent — a track that has been warmed
     * stays warmed, because dropping and reloading a 4K decoder mid-journey
     * costs far more than keeping it resident.
     */
    const warmed = new Set<number>();

    /**
     * NOT DONE, and the measurement is why. Warming is one-way: by scene 4 the
     * journey has touched every track and ten 1440p decoders are resident,
     * which looked like the obvious explanation for the stutter growing toward
     * the end. Releasing distant decoders (pause + preload="none" + load())
     * was tried and made things WORSE in the per-scene wheel bench — dropped
     * frames roughly doubled and scene 5 stopped presenting frames entirely,
     * because a released track that the gesture returns to has to refetch and
     * re-decode from cold mid-journey.
     *
     * So the accumulation is real but releasing is not the answer; the fix, if
     * one is needed, is fewer resident tracks by design (dropping the reverse
     * set on low-memory devices, say), not evicting them mid-gesture. See
     * per-scene-wheel.mjs to reproduce.
     */
    const warm = (track: number) => {
      if (track < 0 || track >= TRACKS || warmed.has(track)) return;
      const v = elementOf(track);
      if (!v) return;
      warmed.add(track);
      if (import.meta.env.DEV) warmedAt[track] = performance.now();
      v.preload = "auto";
      if (v.readyState < 2) {
        try {
          v.load();
        } catch {
          /* redundant */
        }
      }
    };

    /**
     * Playback-decision telemetry, development only.
     *
     * The native `play`/`pause` events are not enough: they say what the element
     * did, not what the controller asked for or why. Every command below is
     * logged at the decision site with its reason, so a gap in the visible-frame
     * cadence can be matched against the exact command that preceded it.
     */
    type PlaybackReason =
      | "moving"
      | "leash"
      | "settling"
      | "settling-converged"
      | "settled"
      | "near-target"
      | "scroll-settled"
      | "gap-forward"
      | "overshoot"
      | "preroll"
      | "preroll-cap"
      | "inactive-track";
    const pb = {
      events: [] as Record<string, unknown>[],
      plays: 0,
      pauses: 0,
      cycles: 0,
      pausedWhileMoving: 0,
      byReason: {} as Record<string, number>,
      pauseSpans: [] as number[],
    };
    const pausedAt: number[] = Array.from({ length: TRACKS }, () => 0);
    /** Mirrors `settled` from the tick, so the logger can classify a command. */
    let movingNow = false;
    const playbackLog = (
      cmd: "play" | "pause",
      reason: PlaybackReason,
      track: number,
      delta: number,
      v: HTMLVideoElement,
    ) => {
      if (!import.meta.env.DEV) return;
      const now = performance.now();
      pb.byReason[reason] = (pb.byReason[reason] ?? 0) + 1;
      if (cmd === "pause") {
        pb.pauses += 1;
        if (movingNow) pb.pausedWhileMoving += 1;
        pausedAt[track] = now;
      } else {
        pb.plays += 1;
        if (pausedAt[track]) {
          pb.cycles += 1;
          pb.pauseSpans.push(+(now - pausedAt[track]).toFixed(1));
          pausedAt[track] = 0;
        }
      }
      pb.events.push({
        t: +now.toFixed(1),
        cmd,
        reason,
        track,
        seg: segOf(track) + 1,
        rep: repOf(track) === REP_REV ? "rev" : "fwd",
        dir: direction,
        moving: movingNow,
        delta: +delta.toFixed(4),
        ct: +v.currentTime.toFixed(4),
        rate: +v.playbackRate.toFixed(3),
        vel: +targetVelocity.toFixed(3),
        presented: presentedFrame[track],
        wasAlready: cmd === "pause" ? v.paused : !v.paused,
        seeking: seeking[track],
        readyState: v.readyState,
      });
      // A long session must not grow without bound; the bench only ever reads
      // the window around the gesture it just drove.
      if (pb.events.length > 6000) pb.events.splice(0, 2000);
    };
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__cnPlayback = pb;
    }

    /**
     * Per-tick state trace, development only.
     *
     * "Not paused" is not the same as "moving on screen": an element playing at
     * 0,08x on a 24 fps source presents 1,9 frames per second and looks frozen.
     * Correlating a gap with the controller's decisions therefore needs the RATE
     * during the gap, not just the play/pause commands around it — so every tick
     * records what was commanded and what the element was actually doing.
     *
     * Parallel arrays rather than objects: this runs 60 times a second and must
     * not allocate.
     */
    const tk = {
      t: [] as number[],
      rate: [] as number[],
      paused: [] as number[],
      delta: [] as number[],
      vel: [] as number[],
      raw: [] as number[],
      moving: [] as number[],
      active: [] as number[],
      paint: [] as number[],
      pres: [] as number[],
      seek: [] as number[],
      hand: [] as number[],
      rs: [] as number[],
      net: [] as number[],
      ended: [] as number[],
      /** Media-element events, which the bare-<video> control never showed. */
      events: [] as { t: number; type: string; track: number }[],
    };
    /** Last gap the controller computed, so the trace can log it per tick. */
    let lastDelta = 0;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__cnTick = tk;
      // waiting/stalled/suspend are the events that separate "the controller
      // stopped it" from "the pipeline ran dry"; the plain <video> experiment
      // produced none of them, so their presence here would be the difference.
      for (const type of ["waiting", "stalled", "suspend", "playing", "ended", "error"]) {
        for (let t = 0; t < TRACKS; t++) {
          const el = elementOf(t);
          if (!el) continue;
          const h = () => {
            tk.events.push({ t: +performance.now().toFixed(1), type, track: t });
            if (tk.events.length > 4000) tk.events.splice(0, 1000);
          };
          el.addEventListener(type, h);
          devListeners.push({ v: el, type, h });
        }
      }
    }

    /**
     * Moves the playhead by PLAYING, not by seeking.
     *
     * Every master is a single GOP — one keyframe, at frame 0 — so a seek to
     * frame N costs a decode of N frames. Measured on this hardware: ~700 ms at
     * p95, which is why seek-per-frame scrubbing presented 4-6 frames per second
     * where continuous playback presents 24 with nothing dropped.
     *
     * So the scroll no longer says "show me frame N". It says how fast the
     * story should advance, and the decoder does what it is good at:
     *
     *   forward   playbackRate proportional to the gap. The picture tracks the
     *             gesture and the decoder never leaves streaming mode.
     *   backward  hold. Media elements cannot play in reverse, and seeking is
     *             the thing we are here to avoid. The frame stays put while the
     *             overlays — plain DOM — keep following the scroll exactly.
     *   resync    one seek, and only after the gesture has stopped. Scrolling
     *             back up to re-read a section does eventually resync, at the
     *             cost of a single seek nobody is mid-gesture to notice.
     *
     * Positioning before the intro handover stays a seek: three frames from the
     * keyframe is cheap, and playing there would put the soft opening frames on
     * screen, which is exactly what the intro offset exists to avoid.
     */

    /** True while a track is holding because it ran too far ahead of the scroll. */
    const leashed: boolean[] = Array.from({ length: TRACKS }, () => false);
    const setRate = (v: HTMLVideoElement, rate: number) => {
      if (Math.abs(v.playbackRate - rate) > 0.02) {
        v.playbackRate = rate;
        rateChanges += 1;
      }
    };
    const resume = (v: HTMLVideoElement, reason: "moving" | "settling", track: number, delta: number) => {
      if (!v.paused) return;
      playbackLog("play", reason, track, delta, v);
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    const drivePlayhead = (track: number, mediaFrame: number, state: MotionState) => {
      const v = elementOf(track);
      if (!v || v.readyState < 1) return;
      const settled = state === "settled";
      const want = frameToMediaTime(mediaFrame);
      const delta = want - v.currentTime;
      lastDelta = delta;

      if (!introConfirmedRef.current) {
        if (Math.abs(delta) >= EPS) seekTo(track, mediaFrame);
        return;
      }
      if (legacySeekMode || (repOf(track) === REP_REV && legacyReverseMode)) {
        if (Math.abs(delta) >= EPS) seekTo(track, mediaFrame);
        return;
      }

      if (!legacyPolicy) {
        if (state === "moving") {
          // Positive lead means the picture has outrun the scroll, which the
          // rate floor makes routine at low speed. The hold is the price of the
          // floor and is taken in one clear stretch rather than as chatter.
          const lead = -delta;
          // Recovery is SYMMETRIC, and it has to be. The leash can wait out a
          // lead the floor created, because that lead is small and closes at the
          // scroll's own speed. It cannot wait out a lead the playhead did not
          // create — a backward reposition, a direction flip, a crossing — and
          // an early version tried: parked 40 frames ahead at 0,5x it held the
          // picture for 3,3 s waiting for the scroll to arrive. Beyond SYNC_GAP,
          // in either direction, one seek is the only honest answer.
          if (Math.abs(delta) > SYNC_GAP && !seeking[track]) {
            leashed[track] = false;
            seekTo(track, mediaFrame);
            return;
          }
          if (leashed[track]) {
            if (lead > LEAD_RELEASE_FRAMES / FPS) {
              if (!v.paused) {
                playbackLog("pause", "leash", track, delta, v);
                v.pause();
              }
              return;
            }
            leashed[track] = false;
          } else if (lead >= leadMaxFrames / FPS) {
            leashed[track] = true;
            if (!v.paused) {
              playbackLog("pause", "leash", track, delta, v);
              v.pause();
            }
            return;
          }
          setRate(
            v,
            Math.min(rateCeiling(), Math.max(movingRateMin, targetVelocity + delta / RATE_TAU)),
          );
          resume(v, "moving", track, delta);
          return;
        }

        leashed[track] = false;

        if (state === "settling") {
          if (delta <= EPS) {
            if (!v.paused) {
              playbackLog("pause", "settling-converged", track, delta, v);
              v.pause();
            }
            return;
          }
          setRate(
            v,
            Math.min(rateCeiling(), Math.max(SETTLING_RATE_MIN, targetVelocity + delta / RATE_TAU)),
          );
          resume(v, "settling", track, delta);
          return;
        }

        if (!v.paused) {
          playbackLog("pause", "settled", track, delta, v);
          v.pause();
        }
        if (Math.abs(delta) >= RESYNC_GAP) seekTo(track, mediaFrame);
        return;
      }

      if (Math.abs(delta) < EPS) {
        if (!v.paused) {
          playbackLog("pause", settled ? "scroll-settled" : "near-target", track, delta, v);
          v.pause();
        }
        return;
      }

      if (delta > 0 && !seeking[track]) {
        /**
         * Recovery. The gesture has outrun the decoder by more than playing can
         * close, so stop trying: one seek lands near the target and the rate
         * controller takes over from there. Rate-limited, because a recovery
         * seek that has not landed yet cannot be improved by issuing another.
         */
        if (
          delta > (recoveryOverride || RECOVERY_GAP) &&
          performance.now() - lastRecoveryAt > RECOVERY_MIN_MS
        ) {
          lastRecoveryAt = performance.now();
          recoveries += 1;
          // Aim where the story will be when this seek lands, not where it
          // is now — the whole difference between a recovery that holds the
          // gesture and one that arrives already stale (see RECOVERY_LANDING_S).
          const lead = Math.min(
            RECOVERY_LEAD_MAX_FRAMES,
            Math.round(targetVelocity * MEDIA_FPS * RECOVERY_LANDING_S),
          );
          const ceiling = mediaFrameCount(SEGMENTS[segOf(track)].mediaFrames) - 1;
          seekTo(track, Math.min(ceiling, mediaFrame + lead));
          return;
        }
        /**
         * Feed-forward on the scroll's own velocity, with the gap only as a
         * correction.
         *
         * Rate from the gap alone has a blind spot exactly at a boundary: the
         * incoming segment enters with delta ~0, so it is commanded to crawl at
         * RATE_MIN and has to wait for the gap to build before it moves
         * properly. That sag right after each crossing is the hitch — not a
         * wrong frame, which is why the confirmation gate alone did not fix it.
         *
         * Seeding the rate with how fast the story is already advancing means a
         * new segment picks up at the speed the old one was running.
         */
        /**
         * Tail floor, from the settling trace of 2026-08-08: when a gesture
         * lands, targetVelocity collapses ahead of the remaining gap, so
         * vel + delta/TAU decays the rate to a 0.2-0.5x crawl exactly while
         * three to five frames are still owed — measured as 123-314 ms
         * inter-frame gaps right after every energetic stop, which is the
         * "travadinha" felt at the end of a fast scroll. While more than two
         * frames are owed the shot is still visibly in motion, and finishing
         * it slower than real time reads as a freeze; the floor holds 1x
         * until the debt is nearly settled, then the ordinary formula eases
         * the shot to rest. Steady slow scrolling never trips it: there the
         * equilibrium gap sits well under two frames.
         */
        const tailFloor = delta > 2 / FPS ? 1 : RATE_MIN;
        const rate = fixedRate
          ? fixedRate
          : Math.min(rateCeiling(), Math.max(tailFloor, targetVelocity + delta / RATE_TAU));
        rateChanges += Math.abs(v.playbackRate - rate) > 0.02 ? 1 : 0;
        if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
        if (v.paused) {
          playbackLog("play", "gap-forward", track, delta, v);
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
        return;
      }

      /**
       * The track has run PAST its own target.
       *
       * With reverse media this is no longer "the user scrolled up" — that case
       * now switches to the reverse track, which then plays forward like any
       * other. Overshoot here is transient: the rate overshot, or the gesture
       * stopped while the decoder was still streaming. Pausing is enough; a
       * seek only earns its cost once the gesture has settled and the error is
       * big enough to see.
       */
      if (!v.paused) {
        playbackLog("pause", "overshoot", track, delta, v);
        v.pause();
      }
      const threshold = settled ? RESYNC_GAP : EPS;
      if (Math.abs(delta) >= threshold) seekTo(track, mediaFrame);
    };

    /** When the current crossing began holding, 0 when no crossing is pending. */
    let handoverStartedAt = 0;
    /**
     * True once HANDOVER_MAX_MS has been reached for the crossing in
     * progress. Latched rather than re-armed: without this, resetting
     * handoverStartedAt to 0 when forcing let the very next tick treat the
     * still-unresolved crossing as a brand-new one and restart the whole
     * HANDOVER_MAX_MS wait, turning a one-time ceiling into a cycle that
     * repeated for as long as the decode stayed slow.
     */
    let handoverForced = false;
    /**
     * How fast the scroll is advancing the story, in footage-seconds per
     * wall-second — the same unit as playbackRate. Smoothed, because raw
     * wheel deltas are spiky enough to make the rate audible as pumping.
     */
    let targetVelocity = 0;
    /** Same estimate, signed — the direction detector needs to know which way. */
    let signedVelocity = 0;
    /** Seeks issued for synchronisation, counted for the bench. */
    let syncSeeks = 0;
    /** How often playbackRate is actually rewritten — a judder suspect. */
    let rateChanges = 0;
    /** When the last recovery seek was issued, and how many there have been. */
    let lastRecoveryAt = 0;
    let recoveries = 0;

    /**
     * Wheel governor state (see GOVERNOR_FRACTION). `backlog` is scroll the
     * visitor has asked for and not yet been given, in pixels, released by the
     * tick at a bounded rate.
     */
    let backlog = 0;
    let journeyActive = false;
    /**
     * Pixels per second the page may scroll: the presentable story rate
     * (frames/s the screen can show, over the media's own rate) times the
     * runway. Derived rather than fixed, so a 120 Hz panel is allowed to go
     * faster and a longer runway automatically permits more scrolling.
     */
    const governorBudget = () =>
      rateCeiling() * governorFraction * (SCROLL_VH_PER_SECOND / 100) * window.innerHeight;
    /**
     * Pixels of scrolling that equal one frame of story — the unit the floor
     * is expressed in. Derived from the runway rather than fixed, so changing
     * the runway cannot silently change what "one frame" costs.
     */
    const pxPerStoryFrame = () => ((SCROLL_VH_PER_SECOND / 100) * window.innerHeight) / FPS;
    /** Pre-rolls started, for the bench. */
    let prerollStarts = 0;

    /**
     * Direction state, with hysteresis.
     *
     * Wheel and trackpad deltas cross zero constantly at low speed; without a
     * dead zone the controller would flip representation several times a second
     * and pay a sync seek for each. Measured on this machine, a hand resting on
     * the trackpad produces |velocity| under ~1,2 frames/s, while a deliberate
     * reversal passes 8 frames/s within about 40 ms. DIR_MIN_VEL sits above the
     * noise floor and well under a real gesture; DIR_PERSIST_MS is shorter than
     * the ~90 ms it takes a reversal to become visible, so the switch is armed
     * before anyone could notice it was pending.
     */
    let direction = 1;
    let dirCandidate = 1;
    let dirCandidateSince = 0;
    let directionSwitches = 0;
    /** Bumped on every accepted direction change; stale switch work is dropped. */
    let switchGeneration = 0;
    /** When the pending direction change began, 0 when none is pending. */
    let dirSwitchStartedAt = 0;

    /**
     * Visible-frame telemetry.
     *
     * A frame counts as visually new only when the pair (track, media frame
     * actually drawn) changes. Summing requestVideoFrameCallback across every
     * element — including standby tracks nobody can see — produced 36,9 "fps"
     * from a 24 fps source, which is arithmetically impossible and was measuring
     * decoder chatter, not smoothness. The ceiling here is one new frame every
     * 41,67 ms at 1x, and the interval distribution is what tells you whether
     * the picture is even.
     */
    const vis = {
      rateChanges: () => rateChanges,
      syncSeeks: () => syncSeeks,
      prerolls: () => prerollStarts,
      newFrameAt: [] as number[],
      uniqueFrames: 0,
      redraws: 0,
      draws: 0,
      trackSwitches: 0,
      drawMs: [] as number[],
      byTrack: Array.from({ length: TRACKS }, () => 0),
    };
    /**
     * |target − screen| in global frames, sampled on every newly drawn frame.
     * A local, attached to the telemetry object only in development, so the
     * property name is minified away rather than shipped.
     */
    const lag: number[] = [];
    /** Which track produced each entry of newFrameAt, for boundary accounting. */
    const newFrameTrack: number[] = [];
    const boundaries: Record<string, unknown>[] = [];
    let lastVisibleKey = "";
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__cnVisible = Object.assign(vis, {
        lagFrames: lag,
        frameTrack: newFrameTrack,
        boundaries,
      });
    }

    /** Handover counters, read by the boundary bench. Written only at crossings. */
    const stats = { waits: 0, forced: 0, maxHoldMs: 0 };
    // Exposed for the bench only; the branch folds away in production so the
    // identifier never reaches the shipped bundle.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__cnHandover = stats;
    }

    // Feeds the SystemRail: one event per PRESENTED integer frame, never per
    // tick, so listeners pay nothing while the playhead is at rest.
    let lastEmittedGf = -1;

    const tick = () => {
      const now = performance.now();
      const isFirstTick = !lastTsRef.current;
      const dt = isFirstTick ? 0.016 : Math.min((now - lastTsRef.current) / 1000, 0.05);
      lastTsRef.current = now;

      // Hard-sync once, on the very first tick, instead of always ramping up
      // from 0: targetFrameRef is already correct by now (GSAP's onUpdate
      // fires from ScrollTrigger's initial position during setup, before the
      // ticker's first tick), but renderFrameRef otherwise starts at 0 and
      // has to damp its way up to it — which is exactly the mismatch a
      // reload with scroll position restored mid-journey exposes: the
      // anchor dot and SystemRail visibly ramp through the wrong state for
      // a beat before the damped catch-up lands.
      if (isFirstTick) {
        renderFrameRef.current = targetFrameRef.current;
        prevTargetRef.current = targetFrameRef.current;
        lastTargetRef.current = targetFrameRef.current;
      }

      /**
       * Release what the wheel asked for, at the rate the film can be shown.
       * Runs before the playhead reads the scroll, so the timeline sees the
       * governed position on this very tick rather than one late.
       */
      if (backlog !== 0) {
        const budget = governorBudget();
        const cap = budget * GOVERNOR_MAX_BACKLOG_S;
        if (Math.abs(backlog) > cap) backlog = Math.sign(backlog) * cap;
        const step = Math.sign(backlog) * Math.min(Math.abs(backlog), budget * dt);
        backlog -= step;
        // Under a pixel is beneath what a scroll call can express; keep it for
        // the next tick instead of losing it to rounding.
        if (Math.abs(step) >= 1) {
          /**
           * `behavior: "instant"` is load-bearing, not decoration. The base
           * stylesheet sets `scroll-behavior: smooth` on <html> for anchor
           * links, and a bare scrollBy() inherits it — so every one of these
           * sixty-per-second calls started a NEW smooth animation and
           * cancelled the last one before it had travelled, leaving the page
           * crawling at a fraction of the governed budget. Measured: ~200 px/s
           * delivered against a 1395 px/s budget, which reads exactly like the
           * "very slow scroll" it was reported as.
           *
           * Asking for instant here scrolls by the step this tick computed and
           * nothing else, which is the whole contract of the governor.
           */
          window.scrollTo({ top: window.scrollY + step, behavior: "instant" });
        } else backlog += step;
      }

      // Frame-rate independent damping. See DAMPING for why this value.
      const factor = 1 - Math.exp(-(dampOverride || DAMPING) * dt);
      renderFrameRef.current += (targetFrameRef.current - renderFrameRef.current) * factor;

      // "Settled" is about the SCROLL, not the playhead: the resync seek is
      // only allowed once the user has stopped moving, so it never lands in the
      // middle of a gesture.
      // Velocity needs the previous tick's target, not lastTargetRef — that one
      // only advances past MOVE_EPS_FRAMES and would inflate the delta.
      const instant = dt > 0 ? (targetFrameRef.current - prevTargetRef.current) / FPS / dt : 0;
      prevTargetRef.current = targetFrameRef.current;
      /**
       * Both representations play FORWARD inside their own file, so the rate is
       * driven by the magnitude of the scroll velocity regardless of which way
       * the story is going. The sign only chooses the representation.
       */
      signedVelocity = signedVelocity * 0.8 + instant * 0.2;
      targetVelocity = targetVelocity * 0.8 + Math.abs(instant) * 0.2;
      if (Math.abs(targetFrameRef.current - lastTargetRef.current) > MOVE_EPS_FRAMES) {
        lastTargetRef.current = targetFrameRef.current;
        lastMoveAtRef.current = now;
      }
      // Three states, not two. "settling" is the stretch right after the
      // gesture ends: the scroll has stopped but the playhead has not arrived,
      // and treating that as "settled" is what made the picture slam to a halt
      // instead of coming to rest.
      const sinceMove = now - lastMoveAtRef.current;
      const motion: MotionState =
        sinceMove <= SETTLE_MS
          ? "moving"
          : sinceMove <= SETTLE_MS + SETTLE_GRACE_MS
            ? "settling"
            : "settled";
      const settled = motion === "settled";
      movingNow = motion === "moving";
      if (settled) {
        targetVelocity = 0;
        signedVelocity = 0;
      }

      // Direction, with a dead zone and a persistence requirement. Inside the
      // dead zone the current direction simply stays, so wheel noise near zero
      // cannot cost a representation switch.
      const velFrames = signedVelocity * FPS;
      const wanted =
        velFrames > DIR_MIN_VEL_FRAMES ? 1 : velFrames < -DIR_MIN_VEL_FRAMES ? -1 : direction;
      if (wanted === direction) {
        dirCandidate = direction;
      } else if (wanted !== dirCandidate) {
        dirCandidate = wanted;
        dirCandidateSince = now;
      } else if (now - dirCandidateSince >= DIR_PERSIST_MS) {
        direction = wanted;
        directionSwitches += 1;
        switchGeneration += 1;
        dirSwitchStartedAt = now;
      }

      const gf = Math.max(0, Math.min(GLOBAL_FRAMES - 1, Math.round(renderFrameRef.current)));
      if (gf !== lastEmittedGf) {
        lastEmittedGf = gf;
        window.dispatchEvent(new CustomEvent("sonare:frame", { detail: { frame: gf } }));
      }
      const { index, localFrame } = locateFrame(gf);
      const rep = useReverseMedia && direction < 0 ? REP_REV : REP_FWD;
      const activeTrack = trackOf(index, rep);
      const activeFrame = frameFor(index, rep, localFrame);

      drivePlayhead(activeTrack, activeFrame, motion);

      const segStart = SEGMENT_START_FRAME[index];
      const segEnd = segStart + SEGMENTS[index].frames;

      /**
       * Pre-roll (see PREROLL_LEAD_FRAMES). Close to a boundary, moving toward
       * it, the incoming element is nudged into playback at RATE_MIN so the
       * crossing finds a hot pipeline. Conditions are deliberately narrow: a
       * confirmed intro, a real gesture, an element whose armed seek has
       * landed at (or near) its entry — a track parked elsewhere must not
       * start streaming from the wrong place.
       */
      let prerollTrack = -1;
      if (!prerollOff && introConfirmedRef.current && motion === "moving") {
        let candidate = -1;
        let entryMedia = -1;
        if (direction > 0 && index + 1 < SEGMENTS.length && gf >= segEnd - PREROLL_LEAD_FRAMES) {
          candidate = trackOf(index + 1, rep);
          entryMedia = frameFor(index + 1, rep, SEGMENTS[index + 1].offsetFrames);
        } else if (direction < 0 && index - 1 >= 0 && gf <= segStart + PREROLL_LEAD_FRAMES) {
          const prev = SEGMENTS[index - 1];
          candidate = trackOf(index - 1, rep);
          entryMedia = frameFor(index - 1, rep, prev.offsetFrames + prev.frames - 1);
        }
        if (candidate >= 0) {
          const pv2 = elementOf(candidate);
          const pf = presentedFrame[candidate];
          const cap = entryMedia + PREROLL_MAX_AHEAD_FRAMES * MEDIA_SCALE;
          if (pv2 && pv2.readyState >= 2 && !seeking[candidate] && pf >= 0) {
            if (pf > cap) {
              // The roll outran its allowance (a crawl approach): hold it.
              if (!pv2.paused) {
                playbackLog("pause", "preroll-cap", candidate, 0, pv2);
                pv2.pause();
              }
            } else if (pf >= entryMedia - PREROLL_MAX_AHEAD_FRAMES * MEDIA_SCALE) {
              prerollTrack = candidate;
              if (pv2.paused) {
                setRate(pv2, RATE_MIN);
                playbackLog("play", "preroll", candidate, 0, pv2);
                const p = pv2.play();
                if (p && typeof p.catch === "function") p.catch(() => {});
                prerollStarts += 1;
              }
            }
          }
        }
      }

      // Only the active track may advance — with one exception: a pre-rolling
      // track is deliberately creeping at the floor rate so the next crossing
      // is a rate change instead of a pipeline start. Anything else left
      // playing would drift away from where the gesture expects to find it.
      for (let t = 0; t < TRACKS; t++) {
        const other = elementOf(t);
        if (t !== activeTrack && t !== prerollTrack && other && !other.paused) {
          playbackLog("pause", "inactive-track", t, 0, other);
          other.pause();
        }
      }

      warm(activeTrack);

      // The opposite representation of THIS segment, armed where a reversal
      // would land — this is what makes the first reversal cost one seek that
      // has already been paid before the user asks for it.
      if (useReverseMedia && !standbyOff) {
        const oppRep = rep === REP_FWD ? REP_REV : REP_FWD;
        const oppTrack = trackOf(index, oppRep);
        warm(oppTrack);
        /**
         * Re-arm the standby representation only when it has drifted out of
         * reach, never every tick.
         *
         * localFrame moves continuously, so arming it on the exact current
         * frame issued a seek on every frame of a gesture — measured at 80
         * seeks during a single slow scroll. The standby only has to be CLOSE
         * enough that a reversal lands inside the handover's lag tolerance;
         * from there the rate controller closes the rest without a seek.
         */
        const oppLocal = presentedLogical(index, oppRep, presentedFrame[oppTrack]);
        const adrift = oppLocal < 0 || Math.abs(oppLocal - localFrame) > ARM_REFRESH_FRAMES;
        // Mid-sweep the standby can only be armed onto positions the sweep
        // has already left behind, and each of those seeks competes with the
        // visible track's decode. Above the same velocity line the recovery
        // uses, standby chasing stops; the first reversal after a flick pays
        // one seek, which the handover gate already absorbs.
        if (adrift && !seeking[oppTrack] && targetVelocity < RECOVERY_MAX_VEL) {
          armedFor[oppTrack] = -1;
          arm(oppTrack, frameFor(index, oppRep, localFrame), activeTrack);
        }
      }

      // The next segment in the direction of travel, in the representation that
      // direction will be using.
      if (direction > 0 && gf >= segEnd - PRELOAD_LEAD_FRAMES && index + 1 < SEGMENTS.length) {
        const next = trackOf(index + 1, rep);
        warm(next);
        arm(next, frameFor(index + 1, rep, SEGMENTS[index + 1].offsetFrames), activeTrack);
      }
      if (direction < 0 && gf <= segStart + PRELOAD_LEAD_FRAMES && index - 1 >= 0) {
        const prev = SEGMENTS[index - 1];
        const prevLocal = prev.offsetFrames + prev.frames - 1;
        const prevTrack = trackOf(index - 1, rep);
        warm(prevTrack);
        arm(prevTrack, frameFor(index - 1, rep, prevLocal), activeTrack);
      }

      /**
       * Boundary handover.
       *
       * readyState >= 2 only promises that SOME frame of that element is
       * decodable. At a crossing the element the scroll has just moved into has
       * usually decoded nothing at the requested position yet, so switching on
       * readyState paints whatever it happens to hold — most often its cold
       * frame 0 — and that mismatch is the hitch felt at 01→02 and 02→03.
       *
       * The rule instead: the incoming segment must have PRESENTED a frame at
       * the position being asked for. Until then the canvas keeps painting the
       * outgoing segment, which is paused and therefore holding a valid frame.
       * No crossfade, no clear — the picture simply does not move for the few
       * milliseconds the decoder needs, and then continues from the right frame.
       *
       * The same rule runs in reverse: coming back, the current segment stays on
       * screen until the previous one confirms its destination frame.
       *
       * HANDOVER_MAX_MS is a floor under the worst case only. If an element
       * somehow never confirms, holding forever would be a frozen hero, so the
       * switch is forced — still gated on readyState, so it can only ever draw a
       * real decoded frame from the correct file.
       */
      const drawnTrack = drawnSegRef.current;
      let paintTrack = activeTrack;
      let handover: "estável" | "aguardando" | "forçado" = "estável";
      if (drawnTrack >= 0 && drawnTrack !== activeTrack && !legacyHandover) {
        /**
         * One rule now covers both kinds of switch — crossing a boundary and
         * reversing direction — because both reduce to the same question: has
         * the incoming track presented the moment of the STORY we are asking
         * for? Comparing in story frames rather than media frames is what lets
         * a forward and a reverse element be judged by the same test.
         *
         * The tolerance is asymmetric on purpose. Being behind is the ordinary
         * state of this controller — the picture always trails the gesture
         * while playback catches up — and waiting for that to close costs
         * presented frames for nothing. Being AHEAD is different: it can only
         * mean the element is parked where some earlier visit left it, which is
         * exactly the wrong frame this gate exists to keep off screen.
         */
        const inRep = repOf(drawnTrack) === repOf(activeTrack) ? repOf(activeTrack) : rep;
        void inRep;
        const raw = presentedFrame[activeTrack];
        const presentedLocal = presentedLogical(index, rep, raw);
        // Positive means the incoming track is behind, in story terms, whichever
        // way the story is currently running.
        const storyLag = (localFrame - presentedLocal) * direction;
        const confirmed =
          raw >= 0 && storyLag <= HANDOVER_LAG_FRAMES && storyLag >= -HANDOVER_AHEAD_FRAMES;

        if (!handoverStartedAt) handoverStartedAt = now;
        if (confirmed) {
          stats.maxHoldMs = Math.max(stats.maxHoldMs, now - handoverStartedAt);
          handoverStartedAt = 0;
          dirSwitchStartedAt = 0;
          handoverForced = false;
        } else if (handoverForced || now - handoverStartedAt > HANDOVER_MAX_MS) {
          if (!handoverForced) stats.forced += 1;
          handover = "forçado";
          handoverForced = true;
          dirSwitchStartedAt = 0;
        } else {
          const held = elementOf(drawnTrack);
          if (held && held.readyState >= 2) {
            paintTrack = drawnTrack;
            handover = "aguardando";
            stats.waits += 1;
          }
        }
      } else {
        handoverStartedAt = 0;
        handoverForced = false;
      }

      /**
       * The dissolve at 04 -> 05 (see SEAM_FADE_FRAMES). Only while the
       * handover is settled: mid-crossing the gate may still be painting the
       * outgoing scene, and blending it with itself would do nothing but cost
       * a second drawImage.
       */
      let seamAlpha = -1;
      let seamUnder: HTMLVideoElement | null = null;
      if (seamOn && SEAM_AT.has(index) && paintTrack === activeTrack) {
        const into = gf - SEGMENT_START_FRAME[index];
        if (into >= 0 && into < SEAM_FADE_FRAMES) {
          const prev = elementOf(trackOf(index - 1, rep));
          if (prev && prev.readyState >= 2) {
            seamAlpha = (into + 1) / (SEAM_FADE_FRAMES + 1);
            seamUnder = prev;
          }
        }
      }

      const v = elementOf(activeTrack);
      const pv = elementOf(paintTrack);
      // The very first video draw is gated on introConfirmedRef, not merely on
      // readyState. readyState only promises "some frame is decodable"; it says
      // nothing about WHICH one, so drawing on it can put frame 0 on screen for
      // a beat before the seek to the intro frame lands.
      const mayDraw = firstVideoFrameRef.current || introConfirmedRef.current;
      if (pv && pv.readyState >= 2 && mayDraw) {
        // The identity of what is on screen: which decoder, and which frame of
        // it. Only a change here is a frame the viewer can actually perceive.
        const key = `${paintTrack}:${presentedFrame[paintTrack]}`;
        const isNew = key !== lastVisibleKey;
        const d0 = performance.now();
        if (surfaceNative) {
          // The element itself is the surface. Everything else about the frame
          // — which track, which media frame, when it became visible — is
          // recorded by the same code below, so the two modes are comparable.
          for (let t = 0; t < TRACKS; t++) {
            const el = elementOf(t);
            if (el) el.style.opacity = t === paintTrack ? "1" : "0";
          }
          if (!firstVideoFrameRef.current) {
            firstVideoFrameRef.current = true;
            document.body.dataset.heroSource = "video";
          }
        } else {
          // The outgoing scene underneath, the incoming ramping over it. Both
          // go through the same cover crop, so nothing shifts during the fade.
          if (seamUnder) draw(seamUnder);
          if (seamAlpha >= 0) ctx.globalAlpha = seamAlpha;
          const painted = draw(pv);
          ctx.globalAlpha = 1;
          if (painted && !firstVideoFrameRef.current) {
            firstVideoFrameRef.current = true;
            document.body.dataset.heroSource = "video";
          }
        }
        vis.draws += 1;
        vis.drawMs.push(performance.now() - d0);
        if (isNew) {
          if (lastVisibleKey && lastVisibleKey.split(":")[0] !== String(paintTrack)) {
            vis.trackSwitches += 1;
          }
          const prevTrack = lastVisibleKey ? Number(lastVisibleKey.split(":")[0]) : -1;
          lastVisibleKey = key;
          vis.uniqueFrames += 1;
          vis.byTrack[paintTrack] += 1;
          vis.newFrameAt.push(now);
          if (import.meta.env.DEV) {
            newFrameTrack.push(paintTrack);
            /**
             * A crossing, recorded from the only vantage point that matters:
             * the canvas. Everything else — readyState, `seeked`, even rVFC on
             * the incoming element — can be true while the viewer is still
             * looking at the outgoing scene. `heldMs` is that: how long the last
             * picture of the old scene stayed on screen, which is exactly the
             * hitch being hunted.
             */
            if (prevTrack >= 0 && segOf(prevTrack) !== segOf(paintTrack)) {
              const lastOld = (() => {
                for (let i = vis.newFrameAt.length - 2; i >= 0; i--) {
                  if (newFrameTrack[i] === prevTrack) return vis.newFrameAt[i];
                }
                return now;
              })();
              boundaries.push({
                t: +now.toFixed(1),
                from: segOf(prevTrack) + 1,
                to: segOf(paintTrack) + 1,
                dir: direction > 0 ? "desce" : "sobe",
                rep: repOf(paintTrack) === REP_REV ? "rev" : "fwd",
                heldMs: +(now - lastOld).toFixed(1),
                warmLeadMs: warmedAt[paintTrack] ? +(now - warmedAt[paintTrack]).toFixed(0) : null,
                armLeadMs: armedAt[paintTrack] ? +(now - armedAt[paintTrack]).toFixed(0) : null,
                presented: presentedFrame[paintTrack],
                wanted: activeFrame,
                readyState: pv.readyState,
                waits: stats.waits,
                forced: stats.forced,
                vel: +targetVelocity.toFixed(2),
              });
            }
          }
          // Target-to-screen error, in global frames: where the scroll asked to
          // be, against the frame that just reached the canvas. A fix that only
          // makes the cadence even by lagging further behind is not a fix.
          if (import.meta.env.DEV) {
            const ps = segOf(paintTrack);
            const pfwd = presentedLogical(ps, repOf(paintTrack), presentedFrame[paintTrack]);
            if (pfwd >= 0) {
              const globalDrawn = SEGMENT_START_FRAME[ps] + (pfwd - SEGMENTS[ps].offsetFrames);
              // Signed: positive means the screen is BEHIND the scroll, negative
              // means the rate floor has pushed the picture ahead of it. The
              // sign is the whole point once there is a floor.
              lag.push(+(targetFrameRef.current - globalDrawn).toFixed(2));
            }
          }
        } else {
          vis.redraws += 1;
        }
        drawnSegRef.current = paintTrack;
      }
      // else: keep the poster / last good frame — never clear, never flash.

      if (import.meta.env.DEV) {
        tk.t.push(+now.toFixed(1));
        tk.rate.push(v ? +v.playbackRate.toFixed(3) : 0);
        tk.paused.push(v && v.paused ? 1 : 0);
        tk.delta.push(+lastDelta.toFixed(4));
        tk.vel.push(+targetVelocity.toFixed(3));
        tk.raw.push(+(instant * FPS).toFixed(2));
        // 2 moving, 1 settling, 0 settled — the bench needs the middle state.
        tk.moving.push(motion === "moving" ? 2 : motion === "settling" ? 1 : 0);
        tk.active.push(activeTrack);
        tk.paint.push(paintTrack);
        tk.pres.push(presentedFrame[paintTrack]);
        tk.seek.push(seeking[activeTrack] ? 1 : 0);
        tk.hand.push(handover === "estável" ? 0 : handover === "aguardando" ? 1 : 2);
        tk.rs.push(v ? v.readyState : -1);
        tk.net.push(v ? v.networkState : -1);
        tk.ended.push(v && v.ended ? 1 : 0);
        if (tk.t.length > 40000) {
          for (const a of [tk.t, tk.rate, tk.paused, tk.delta, tk.vel, tk.raw, tk.moving,
            tk.active, tk.paint, tk.pres, tk.seek, tk.hand, tk.rs, tk.net, tk.ended]) {
            a.splice(0, 10000);
          }
        }
      }

      if ((debug || hudFlag) && hudRef.current) {
        const cs = canvas.getBoundingClientRect();
        hudRef.current.textContent =
          `globalFrame   ${gf} / ${GLOBAL_FRAMES - 1}\n` +
          `direção       ${direction > 0 ? "▼ down" : "▲ up"}   trocas ${directionSwitches}` +
          `${dirSwitchStartedAt ? `   trocando ha ${Math.round(now - dirSwitchStartedAt)} ms` : ""}\n` +
          `velocidade    bruta ${(instant * FPS).toFixed(2)}  suav ${(signedVelocity * FPS).toFixed(2)} frames/s` +
          `   |v| ${targetVelocity.toFixed(3)}\n` +
          `estado        ${motion}${legacyPolicy ? "  (política v1)" : ""}` +
          `   piso ${movingRateMin}   coleira ${leadMaxFrames}f` +
          `   adiantado ${(-lastDelta * FPS).toFixed(1)}f\n` +
          `seg pedido    ${index + 1}/5  ${SEGMENTS[index].id}\n` +
          `seg desenhado ${segOf(paintTrack) + 1}/5  ${SEGMENTS[segOf(paintTrack)].id}` +
          `${paintTrack !== activeTrack ? "   <<< SEGURANDO" : ""}\n` +
          `representação ${repOf(activeTrack) === REP_REV ? "REVERSE" : "normal"}` +
          `   desenhada ${repOf(paintTrack) === REP_REV ? "REVERSE" : "normal"}\n` +
          `frame lógico  ${localFrame} / ${SEGMENTS[index].mediaFrames - 1}   (${FPS} fps editorial)\n` +
          `frame físico  ${activeFrame} / ${physFrames[index] - 1}   mídia ${MEDIA_FPS} fps` +
          `   no reverso ${forwardFrameToReverseFrame(activeFrame, physFrames[index])}\n` +
          `handover      ${handover}${handoverStartedAt ? `   ha ${Math.round(now - handoverStartedAt)} ms` : ""}` +
          `   holds ${stats.waits}  forçados ${stats.forced}\n` +
          `entrada conf. frame ${presentedFrame[activeTrack]}  t ${presentedTime[activeTrack] >= 0 ? presentedTime[activeTrack].toFixed(4) : "-"}  (pedido ${activeFrame})\n` +
          `apresentados  fwd ${presentedCount[trackOf(index, REP_FWD)]}   rev ${presentedCount[trackOf(index, REP_REV)]}   seeks sync ${syncSeeks}\n` +
          `source        ${(repOf(activeTrack) === REP_REV ? SEGMENTS[index].reverseSrc : SEGMENTS[index].src).split("/").pop()}\n` +
          `currentTime   ${v ? v.currentTime.toFixed(4) : "-"}   rate ${v ? v.playbackRate.toFixed(3) : "-"}\n` +
          `readyState    ${v ? v.readyState : "-"}   seeking ${v ? v.seeking : "-"}   pausado ${v ? v.paused : "-"}\n` +
          `crop  sx ${lastCrop.sx.toFixed(1)}  sy ${lastCrop.sy.toFixed(1)}  sw ${lastCrop.sw.toFixed(1)}  sh ${lastCrop.sh.toFixed(1)}\n` +
          `native        ${v ? v.videoWidth : "-"}x${v ? v.videoHeight : "-"}\n` +
          `canvas        ${canvas.width}x${canvas.height}\n` +
          `client        ${Math.round(cs.width)}x${Math.round(cs.height)}\n` +
          `devicePixelRatio ${window.devicePixelRatio}\n` +
          `target/render ${targetFrameRef.current.toFixed(2)} / ${renderFrameRef.current.toFixed(2)}`;
      }
    };

    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    window.addEventListener("resize", resize);

    /**
     * The governor's intake. Only wheel input is intercepted: keyboard, touch
     * and the scrollbar all produce continuous motion the pipeline can already
     * follow, and hijacking them would cost accessibility for nothing.
     *
     * ctrl+wheel is browser zoom and must pass through untouched.
     */
    const onWheel = (event: WheelEvent) => {
      if (governorOff || !journeyActive || event.ctrlKey) return;
      // deltaMode 1 is lines, 2 is pages; normalise both to pixels.
      const px =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * window.innerHeight
            : event.deltaY;
      event.preventDefault();
      /**
       * The floor raises the PENDING TOTAL to one visible step — it does not
       * inflate each event.
       *
       * The first version added `max(|px|, floor)` per event, which was wrong
       * in exactly the way that matters: a trackpad emits tens of events a
       * second, so a floor of three frames turned a gentle glide into
       * thousands of pixels per second of demand, far past what the screen can
       * present. The backlog saturated, the film ran pinned at the ceiling,
       * and the stutter the governor exists to prevent came back — reported
       * immediately, and correctly, as the max having regressed.
       *
       * Topping up the BACKLOG instead gives the floor only to a gesture that
       * would otherwise be too small to see: a stream of small events still
       * accumulates at its own true rate, because after the first event the
       * backlog is already above the floor and the clamp stops applying.
       */
      backlog += px;
      const floor = GOVERNOR_MIN_STEP_FRAMES * pxPerStoryFrame();
      if (backlog !== 0 && Math.abs(backlog) < floor) backlog = Math.sign(backlog) * floor;
    };
    window.addEventListener("wheel", onWheel, { passive: false });

    let journeyTrigger: ScrollTrigger | null = null;

    const ctxGsap = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${Math.round(total * (SCROLL_VH_PER_SECOND / 100) * window.innerHeight)}`,
          pin: true,
          scrub: scrubOverride || SCRUB,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          // First on the page and the longest runway on it, so this must
          // re-measure before anything below can know where it sits. See
          // scrollOrder — the whole point is that the order stops depending on
          // which effect happens to mount first.
          refreshPriority: REFRESH_JOURNEY,
          // The governor may only intercept while the film owns the screen.
          // Everywhere else on the page the wheel stays native, and any
          // backlog is dropped on the way out so leaving never coasts.
          onToggle: (self) => {
            journeyActive = self.isActive;
            if (!self.isActive) backlog = 0;
          },
        },
      });
      tl.to({}, { duration: total }, 0);
      journeyTrigger = tl.scrollTrigger ?? null;

      // The scroll only ever records intent, in frames.
      tl.eventCallback("onUpdate", () => {
        const t = tl.time();
        targetFrameRef.current = Math.max(
          0,
          Math.min(GLOBAL_FRAMES - 1, (t / GLOBAL_DURATION) * (GLOBAL_FRAMES - 1)),
        );
        if (railFillRef.current) {
          railFillRef.current.style.transform = `scaleY(${Math.min(1, t / total)})`;
        }
      });

      if (heroRef.current) {
        tl.to(heroRef.current, { opacity: 0, y: -36, duration: 1.1, ease: "power1.in" }, 0.9);
        tl.set(heroRef.current, { pointerEvents: "none" }, 1.4);
      }

      OVERLAYS.forEach((o) => {
        const el = overlayRefs.current[o.id];
        if (!el) return;
        const rise = o.position.startsWith("top") ? -18 : 22;
        tl.fromTo(
          el,
          { opacity: 0, y: rise },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
          o.globalStart,
        );
        tl.to(
          el,
          { opacity: 0, y: -rise * 0.6, duration: 0.38, ease: "power1.in" },
          Math.max(o.globalEnd - 0.38, o.globalStart + 0.55),
        );
      });

      if (closing && closingRef.current) {
        if (scrimRef.current) {
          tl.fromTo(scrimRef.current, { opacity: 0 }, { opacity: 1, duration: 1 }, GLOBAL_DURATION - 0.5);
        }
        tl.set(closingRef.current, { pointerEvents: "auto" }, GLOBAL_DURATION);
        tl.fromTo(
          closingRef.current,
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
          GLOBAL_DURATION - 0.1,
        );
      }
    }, section);

    /**
     * Chapter navigation from the SystemRail. The rail speaks in frames; this
     * translates to the scroll position that produces that frame and lets the
     * scrub pipeline do the rest, so a click travels through exactly the same
     * path as a gesture — damping, direction logic, handovers and all.
     */
    const onSeek = (event: Event) => {
      const st = journeyTrigger;
      if (!st) return;
      const frame = (event as CustomEvent<{ frame: number }>).detail.frame;
      const clamped = Math.max(0, Math.min(GLOBAL_FRAMES - 1, frame));
      const seconds = (clamped / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION;
      const y = st.start + (seconds / total) * (st.end - st.start);
      gsap.to(window, { scrollTo: y, duration: 1.2, ease: "power2.inOut", overwrite: "auto" });
    };
    window.addEventListener("sonare:seek", onSeek as EventListener);

    /**
     * Handover gate for the opening frame.
     *
     * Three conditions, in order, and none of them is sufficient alone:
     *   readyState >= 2  a frame is decodable — but not necessarily ours;
     *   seeked           the playhead reached (offset + 0.5) / FPS;
     *   rVFC mediaTime   a frame was actually PRESENTED, and its media time
     *                    floors to the intro frame index.
     *
     * The last one is the only real proof, so it is what flips the gate. If the
     * browser has no requestVideoFrameCallback, `seeked` at the right time is
     * the strongest signal available and stands in for it.
     */
    const intro = videoRefs.current[0];
    // The editorial offset is 3 LOGICAL frames; on 48 fps media that is
    // physical frame 6, and the gate has to be armed on the physical one or it
    // opens 125 ms early and puts the soft opening frames back on screen.
    const introFrame = logicalFrameToMediaFrame(SEGMENTS[0].offsetFrames);
    let introHandle = 0;
    const onIntroSeeked = () => {
      if (intro && intro.currentTime >= introFrame / MEDIA_FPS - EPS) {
        introConfirmedRef.current = true;
      }
    };
    if (intro) {
      if (typeof intro.requestVideoFrameCallback === "function") {
        const onIntroFrame = (_now: number, meta: { mediaTime: number }) => {
          // +1e-4 absorbs the float error in mediaTime at a frame boundary.
          if (Math.floor(meta.mediaTime * MEDIA_FPS + 1e-4) >= introFrame) {
            introConfirmedRef.current = true;
          } else {
            introHandle = intro.requestVideoFrameCallback(onIntroFrame);
          }
        };
        introHandle = intro.requestVideoFrameCallback(onIntroFrame);
      } else {
        intro.addEventListener("seeked", onIntroSeeked);
      }
    }

    const first = videoRefs.current[0];
    const openGate = () => setPreparing(false);
    if (first && first.readyState >= 3) openGate();
    else if (first) {
      first.addEventListener("canplay", openGate, { once: true });
      first.addEventListener("canplaythrough", openGate, { once: true });
    } else openGate();

    /**
     * Idle prefetch of the rest of the journey, network-aware.
     *
     * On localhost every byte is a disk read, but on the deployed CDN the
     * first crossing used to be the first time scene 02's megabytes were
     * asked for — a network stall parked in the middle of the experience.
     * Once the opening scene can play through, the remaining files are
     * fetched ONE AT A TIME, at low priority, during browser idle, purely to
     * land in the HTTP cache: when warm() later calls load(), the bytes are
     * already local. Forward files first in journey order, then the reverse
     * set, since scrolling down is the first thing every visitor does.
     *
     * Skipped entirely on data-saver and constrained connections — the same
     * rule pickMediaVariant applies. Effective on the CDN only if the
     * responses are cacheable, which public/_headers guarantees by pinning
     * /media/web/* as immutable.
     */
    const prefetchAbort = new AbortController();
    const startPrefetch = () => {
      if (!prefetchOn) return;
      type Conn = { saveData?: boolean; effectiveType?: string };
      const conn = (navigator as Navigator & { connection?: Conn }).connection;
      if (conn?.saveData || /(^|-)2g|3g/.test(conn?.effectiveType ?? "")) return;
      const seen = new Set<string>();
      const urls: string[] = [];
      const push = (u: string) => {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      };
      SEGMENTS.slice(1).forEach((s) => push(s.src));
      SEGMENTS.forEach((s) => push(s.reverseSrc));
      const idle = (cb: () => void) =>
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(() => cb(), { timeout: 4000 })
          : window.setTimeout(cb, 1200);
      /**
       * The prefetch only runs while the journey is AT REST, and it never
       * holds a file in memory.
       *
       * Both rules are corrections of the first version, which fetched
       * back-to-back from the moment scene 01 could play and read each
       * response with arrayBuffer(). Measured per scene against wheel input,
       * that cost roughly double the dropped frames from scene 02 onward —
       * 7.8% against 3.5%, 8.8% against 4.3% — while scene 01 was untouched,
       * because by then the prefetch had not started. The transfer competes
       * with the decoder for the same budget, and arrayBuffer() adds tens of
       * megabytes of allocation per scene on top, exactly while someone is
       * scrolling.
       *
       * So: wait for stillness, and stream the body to nowhere. The cache is
       * filled either way — that was always the only goal.
       */
      const SCROLL_IDLE_MS = 1200;
      const pump = () => {
        if (prefetchAbort.signal.aborted) return;
        if (performance.now() - lastMoveAtRef.current < SCROLL_IDLE_MS) {
          window.setTimeout(pump, 600);
          return;
        }
        const next = urls.shift();
        if (!next) return;
        fetch(next, { signal: prefetchAbort.signal, priority: "low" } as RequestInit)
          .then(async (r) => {
            const reader = r.ok && r.body ? r.body.getReader() : null;
            if (!reader) return;
            for (;;) {
              const { done } = await reader.read();
              if (done || prefetchAbort.signal.aborted) break;
            }
          })
          .catch(() => {})
          .then(() => {
            if (!prefetchAbort.signal.aborted) idle(pump);
          });
      };
      idle(pump);
    };
    if (first && first.readyState >= 4) startPrefetch();
    else if (first) first.addEventListener("canplaythrough", startPrefetch, { once: true });

    // Sample the panel before the first gesture can ask for a rate.
    measureRefresh();
    warm(0);
    warm(1);
    ScrollTrigger.refresh();
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 250);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", resize);
      if (poster) poster.removeEventListener("load", paintPoster);
      // One cancel per track, matching the one loop started per track.
      for (let t = 0; t < TRACKS; t++) {
        const vv = elementOf(t);
        if (vv && rvfcHandles[t] && typeof vv.cancelVideoFrameCallback === "function") {
          vv.cancelVideoFrameCallback(rvfcHandles[t]);
        }
      }
      if (intro) {
        intro.removeEventListener("seeked", onIntroSeeked);
        if (introHandle && typeof intro.cancelVideoFrameCallback === "function") {
          intro.cancelVideoFrameCallback(introHandle);
        }
      }
      delete document.body.dataset.heroSource;
      window.removeEventListener("sonare:seek", onSeek as EventListener);
      gsap.ticker.remove(tick);
      seekedHandlers.forEach((e) => e && e.v.removeEventListener("seeked", e.h));
      devListeners.forEach((e) => e && e.v.removeEventListener(e.type, e.h));
      window.removeEventListener("wheel", onWheel);
      prefetchAbort.abort();
      if (first) {
        first.removeEventListener("canplay", openGate);
        first.removeEventListener("canplaythrough", openGate);
        first.removeEventListener("canplaythrough", startPrefetch);
      }
      ctxGsap.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={sectionRef} id={id} className="relative h-screen w-full overflow-hidden bg-sonare-black">
      {/* The only visible surface. It carries the opening still first and the
          footage afterwards, through the same drawImage call, so the handover
          has no scale, crop, fade or colour step to give itself away. */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[2] h-full w-full" aria-hidden="true" />

      {/* Decoders, two per segment: the footage and the same footage reversed.
          Never displayed — the canvas is the only visible surface. Everything
          starts at preload="none" except the opening segment; the controller
          promotes exactly the tracks a gesture can reach next, so four 4K
          decoders are resident at most, never ten. */}
      {SEGMENTS.map((seg, i) => (
        <video
          key={seg.id}
          ref={(el) => {
            videoRefs.current[i] = el;
          }}
          src={seg.src}
          muted
          playsInline
          preload={i === 0 ? "auto" : "none"}
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          className={
            surfaceNative
              ? "pointer-events-none absolute inset-0 z-[3] h-full w-full object-cover opacity-0"
              : "pointer-events-none absolute h-px w-px opacity-0"
          }
          style={surfaceNative ? undefined : { left: -9999, top: -9999 }}
        />
      ))}
      {SEGMENTS.map((seg, i) => (
        <video
          key={`${seg.id}-rev`}
          ref={(el) => {
            revRefs.current[i] = el;
          }}
          src={seg.reverseSrc}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          className={
            surfaceNative
              ? "pointer-events-none absolute inset-0 z-[3] h-full w-full object-cover opacity-0"
              : "pointer-events-none absolute h-px w-px opacity-0"
          }
          style={surfaceNative ? undefined : { left: -9999, top: -9999 }}
        />
      ))}

      {closing && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-black/45 opacity-0"
        />
      )}

      {preparing && (
        <div
          className="pointer-events-none absolute bottom-8 right-8 z-40 flex items-center gap-2.5 rounded-full border border-white/12 bg-black/45 px-4 py-2 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" className="block h-1.5 w-1.5 animate-pulse rounded-full bg-sonare-gold" />
          <span className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-sonare-silver">
            Preparando a cena
          </span>
        </div>
      )}

      {(debug || hudFlag) && (
        <pre
          ref={hudRef}
          className="pointer-events-none absolute left-4 top-20 z-50 m-0 rounded-md bg-black/80 px-4 py-3 font-mono text-[11px] leading-relaxed text-green-300"
        />
      )}

      {hero && (
        <div ref={heroRef} className="absolute inset-0 z-30">
          {hero}
        </div>
      )}

      {!debug &&
        OVERLAYS.map((o) => (
          <OverlayCard
            key={o.id}
            overlay={o}
            style={{ opacity: 0 }}
            refCallback={(el) => {
              overlayRefs.current[o.id] = el;
            }}
          />
        ))}

      {closing && (
        <div
          ref={closingRef}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center opacity-0"
        >
          {closing}
        </div>
      )}

      <SystemRail fillRef={railFillRef} />
    </section>
  );
}
