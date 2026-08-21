import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, Observer, ScrollTrigger } from "../lib/gsap";
import {
  FPS,
  frameToMediaTime,
  MOBILE_GLOBAL_DURATION,
  MOBILE_GLOBAL_FRAMES,
  MOBILE_POSTER,
  MOBILE_SCROLL_VH_PER_SECOND,
  MOBILE_SEGMENT_START_FRAME,
  MOBILE_SEGMENTS,
  OVERLAYS,
} from "../content/timeline";
import { REFRESH_JOURNEY } from "../lib/scrollOrder";
import { createScrubEngine, FORWARD_SEEK_GAP, type ScrubEngine } from "../lib/scrubEngine";
import { OverlayCard } from "./OverlayCard";

/**
 * The journey on a phone: one pinned frame, the scroll driving global time.
 *
 * This replaces a fallback that played the scenes as separate
 * autoplaying sections. That fallback was honest about what had been validated
 * — it was written before the film had ever run on a handset — but it broke the
 * one thing the piece is about. The visitor was not moving through a house; the
 * visitor was watching clips that happened to be stacked vertically, each
 * running on its own clock at its own speed regardless of the gesture.
 *
 * WHAT IS BORROWED FROM DESKTOP AND WHAT IS NOT. The scroll-to-time mapping,
 * the scrub engine and the overlay timeline are the same, so the narrative and
 * the equipment captions stay identical across the two modes. Four desktop
 * mechanisms are deliberately absent:
 *
 *   the canvas          Desktop composites through one so a poster, ten tracks
 *                       and their seam fades can hand over with no scale, crop
 *                       or colour step between them. Here there are five
 *                       forward tracks and one crossfade rule, and drawImage
 *                       per presented frame is a cost a phone pays in battery
 *                       for a seam it would not have shown anyway.
 *   reverse tracks      Doubling the bytes to make scrolling up stream instead
 *                       of seek is a trade worth making at 4K. At 720x1280 with
 *                       a keyframe every six frames, it is not.
 *   the wheel governor  There is no wheel. Its touch equivalent would be
 *                       hijacking the scroll, which costs more than it buys.
 *   the chapter rail    Screen space a phone does not have to spend.
 *
 * FLINGS ARE NOT FOUGHT, THEY ARE ABSORBED. A touch fling moves at 2000-4000
 * px/s, well past what any runway length can hold under the presentation
 * ceiling (see MOBILE_SCROLL_VH_PER_SECOND). Two things already in the pipeline
 * catch it: ScrollTrigger's scrub damping plays the jump out over its own time
 * constant, and past the scrub engine's forward gap the engine stops chasing
 * and seeks. A flick therefore reads as travelling forward quickly.
 *
 * ONE PROPERTY WORTH NAMING: scrubbing survives blocked autoplay. Seeking a
 * loaded video paints that frame without ever calling play(), so a phone in Low
 * Power Mode — where the old per-scene mode showed nothing but its own black
 * background — still gets the whole film here.
 */

type Props = {
  id?: string;
  /** Extra scroll runway held past MOBILE_GLOBAL_DURATION, in seconds — see CanvasNarrative. */
  settle?: number;
  closing?: ReactNode;
  hero?: ReactNode;
};

/**
 * ScrollTrigger catch-up, in seconds — half of desktop's 1.1, because the
 * gestures are not comparable.
 *
 * A wheel is discrete: ~100 px arriving in one jump every few tens of ms, so
 * damping is what turns a staircase into movement and a long constant is a
 * feature. A drag is continuous and, worse, the finger is ON the picture — at
 * 1.0 the frame the visitor is dragging visibly trails their thumb and arrives
 * after they stop, which reads as the film responding to the scroll rather than
 * being driven by it.
 *
 * Not lower than this, though. The constant is also what absorbs a fling: it
 * spreads the jump over its own time so the scrub engine sees a ramp instead of
 * a teleport. Measured at 0.5 the presented step stays at one frame per
 * animation frame, which is the whole budget there is.
 */
const SCRUB = 0.5;

/**
 * How close the incoming track must be to the boundary frame before the swap.
 * Two frames: one for the rounding between logical frames and media time, one
 * of slack so a decoder that lands a frame early still satisfies the gate.
 */
const HANDOVER_TOL = 2 / 24;

/**
 * Longest the gate may hold the outgoing frame. The gate exists to cover the
 * few milliseconds a decoder needs, not to freeze the picture: past this the
 * swap happens regardless and the incoming track catches up on screen, which
 * is a worse frame for an instant and a better one than a stall.
 */
const HANDOVER_MAX_MS = 220;

/**
 * How far ahead a track is promoted from preload="none" to "auto", in logical
 * frames. 72 is three seconds of footage — at the deliberate reading pace the
 * runway is tuned for, about two seconds of wall clock, which is enough of a
 * head start on a mobile connection to have the boundary frame decodable by
 * the time the gate asks for it.
 */
const PRELOAD_LEAD_FRAMES = 72;

/**
 * Length of each seam dissolve, in logical frames, driven by scroll POSITION
 * rather than wall clock so it plays and reverses with the gesture.
 *
 * Longer than desktop's flat 3, and the reason is a property these two seams
 * have that desktop's do not: the INCOMING scene is nearly still. Measured
 * between its own first two frames, scene 03 opens at 36.5 dB and scene 04 at
 * 56.1 dB — the second is essentially a frozen frame. That cuts both ways.
 * It is why the step is so visible (there is no motion for it to hide behind)
 * and it is also why a long dissolve is safe here: cross-fading two nearly
 * identical stills cannot ghost, because neither picture is moving during the
 * fade. Desktop's 3 frames were chosen over footage that IS moving, where a
 * long blend would smear.
 *
 * Only one seam still needs it. 02 -> 03 was the other, and it is now a
 * straight cut again: the four interpolated frames appended to scene 02 put
 * the join within about a decibel of the camera's own per-frame travel, and a
 * dissolve over a seam that is genuinely continuous only softens something
 * that did not need softening.
 */
const SEAM_FADE_FRAMES: Record<number, number> = { 3: 10 };

/**
 * Scene INDEXES whose start is dissolved rather than cut.
 *
 * Measured the way CanvasNarrative measures its own seams, which is the only
 * fair yardstick: a jump matters in proportion to the motion it has to hide
 * behind, so each seam is compared against the step the INCOMING scene takes
 * between its own first two frames.
 *
 *   01 -> 02   seam 34.0 dB vs own step 26.0 — 8.0 dB BETTER than the motion
 *              around it. Scene 02 opens on a push-in, and the join is
 *              cleaner than one frame of that push. Cut, and invisible.
 *   02 -> 03   seam 29.5 dB vs the bridged scene 02's own closing steps of
 *              31.5 / 30.4 / 30.9 — about a decibel adrift, i.e. one more
 *              frame of the same camera travel. Cut. This one was 25.5 dB
 *              and 10.9 adrift until four interpolated frames were appended
 *              to scene 02 to fill a real hole in the camera path; see
 *              tools/make-mobile.sh.
 *   03 -> 04   seam 33.8 dB vs own step 56.1 — 22 dB adrift, and now the only
 *              one left. Scene 04 opens nearly frozen; against a picture that
 *              still, even a mild step reads as a pop. This is the seam the
 *              raw numbers flatter and the eye does not, and unlike 02 -> 03
 *              it is not a position offset at all: a translation search over
 *              +/-12 px in both axes finds its optimum at exactly dx=0, dy=0,
 *              so there is no hole to bridge and nothing to align.
 */
const SEAM_AT = new Set([3]);

/**
 * Smoothstep on the dissolve, which is what buys the extra length for free.
 *
 * A linear fade spends as long near 50/50 as it does anywhere else, and 50/50
 * is the one mixture that reads as a double image if the visitor happens to
 * stop there — the risk that normally argues against a long dissolve. This
 * curve is flat at both ends and steepest in the middle, so it eases in and
 * out of the blend and crosses the ambiguous centre half again as fast as a
 * linear ramp would. The window gets longer where it helps and shorter where
 * it hurts.
 */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** `?seam=off` restores the hard cut, for comparing the two by hand. */
const seamOn =
  !import.meta.env.DEV || new URLSearchParams(window.location.search).get("seam") !== "off";

/**
 * The touch governor — the wheel governor from CanvasNarrative, ported to the
 * one input a phone has.
 *
 * Same premise, and it is arithmetic rather than taste: a screen refreshing at
 * R Hz showing 24 fps media can present at most R/24 times real time, and a
 * gesture that asks for more cannot be answered — the playhead runs to the
 * ceiling, arrives, stops, repeats. Measured here on a violent flick: peak
 * 8880 px/s, single steps of 44 and 66 frames. Those are the seek path opening
 * up because the scrub could no longer be caught by playing.
 *
 * So the INPUT is capped, exactly as on desktop: the gesture is swallowed into
 * a backlog and released into the scroll at a rate the presentation path can
 * sustain. Capping the input rather than the picture is what keeps the film,
 * the captions and the scroll position agreeing with each other.
 *
 * WHAT COULD NOT BE PORTED IS THE INTERCEPTION. Desktop calls preventDefault on
 * wheel events. The touch equivalent kills native scrolling outright, momentum
 * and all, so the governor has to own the gesture completely — hence Observer
 * with preventDefault, enabled only while the film is pinned. Everywhere else
 * on the page the scroll stays native and untouched.
 *
 * The trade this makes is smaller on a phone than it first appears. The section
 * is PINNED: nothing on screen tracks the finger one-to-one, so there is no
 * direct-manipulation contract to break. The only feedback a gesture has here
 * is the film advancing, which is precisely the thing being metered.
 */
const GOVERNOR_FRACTION = 1.0;

/**
 * Hard cap on the story rate the governor will permit, ABOVE what the refresh
 * measurement alone would allow — and the reason mobile needs one where
 * desktop does not.
 *
 * Desktop derives its ceiling as refreshHz / 24 and stops there, because on a
 * desktop the screen genuinely is the binding constraint: a machine with
 * hardware H.264 decode will feed 4K frames faster than a 60 Hz panel can show
 * them. A phone inverts that. Here the panel is often 120 Hz — which the
 * formula reads as licence for a 3x story rate, i.e. 72 decoded frames per
 * second — while the decoder is simultaneously holding four stacked video
 * elements alive and losing cycles to the compositor and the scroll. Decode,
 * not presentation, is what runs out first, and asking for 3x is exactly the
 * "frames that cannot be presented" case the desktop note warns about: the
 * playhead runs to the ceiling, arrives, stops, repeats. That burst-pause is
 * the stutter, and the frames it skips are the scrub engine falling off its
 * play path into seeks.
 *
 * 2x is still double real time — fast enough that a deliberate scroll never
 * feels held back — and it is a rate a phone can actually sustain.
 */
const MOBILE_RATE_CEILING = 2;

/**
 * Ceiling on the backlog, as a share of the scrub engine's forward-seek gap.
 *
 * Not a free number, and the previous 0.9 seconds was: banked story seconds
 * come out as rateCeiling x this value, so 0.9 let a single swipe bank
 * 2.5 x 0.9 = 2.25 s of story on a 60 Hz phone and 2.7 s on a 120 Hz one.
 * FORWARD_SEEK_GAP is 1.5 s. Every fast swipe therefore handed the scrub
 * engine a gap it is documented to answer by seeking rather than playing —
 * the governor was reliably pushing the picture onto the expensive path it
 * exists to keep it off.
 *
 * Expressed against that gap instead, so the two cannot drift apart: the
 * banked surplus stays at 2/3 of the distance the engine will still absorb by
 * playing. At the 2x ceiling above that is 0.5 s of scrolling — a swipe still
 * coasts, it just cannot coast past the point where coasting turns into a
 * jump.
 */
const GOVERNOR_BACKLOG_OF_SEEK_GAP = 2 / 3;

/** Refresh rates outside this band are a bad measurement, not a real display. */
const REFRESH_MIN_HZ = 50;
const REFRESH_MAX_HZ = 240;
const REFRESH_FALLBACK_HZ = 60;

/**
 * `?governor=off` restores the raw gesture; `?governor=0.8` scales the budget,
 * matching the numeric override CanvasNarrative already accepts.
 *
 * The numeric form exists because this is the one tuning number that cannot be
 * settled from a desk: it is bounded by the decoder in the visitor's hand, and
 * phones differ by more than desktops do. Comparing two values on the actual
 * device is a query string rather than a rebuild.
 */
const governorParam = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("governor")
  : null;
const governorFraction = Number(governorParam) || GOVERNOR_FRACTION;

/**
 * iOS gets no governor, and the reason is a platform limit rather than a
 * preference.
 *
 * The governor's whole method is: call preventDefault on the touch so the page
 * does not scroll itself, then hand the scroll back with window.scrollTo at a
 * metered rate. That second half is what WebKit will not honour. Safari drives
 * scrolling on the compositor, and while a finger is down on a gesture the page
 * has claimed, main-thread scroll writes are unreliable — they land late, or
 * not until the touch ends. So the first half succeeds and the second fails,
 * which is not a slow film: it is a page that does not move while you drag it.
 *
 * Every WebKit browser on iOS inherits this, Chrome and Firefox included, which
 * is why the test is the platform and not the brand. iPadOS reports itself as
 * a Mac, hence the touch-points check.
 *
 * Losing the governor there costs less than it looks. Its job is to stop a
 * fling asking for more frames per second than the decoder can present, and two
 * other things in this pipeline already absorb a fling on their own —
 * ScrollTrigger's scrub damping spreads the jump over its own time constant,
 * and past FORWARD_SEEK_GAP the scrub engine stops chasing and seeks. The film
 * may travel faster than ideal during a violent flick. That is a quality
 * problem, and a page that will not scroll is not.
 *
 * This is the same path `?governor=off` has always taken, so it is a mode that
 * has been exercised rather than a new one invented for this.
 */
const isWebKitTouch =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const governorOff = governorParam === "off" || isWebKitTouch;

/**
 * The picture fills the screen, and that is the only framing there is.
 *
 * This carried two alternatives for a while — `?frame=45` and `?frame=169`,
 * which gave screen height back in exchange for seeing more of the room. They
 * existed to settle a question the LANDSCAPE media posed: with a 16:9 frame
 * filling a portrait screen, object-fit: cover decided the visible field from
 * the screen's ratio alone and discarded about three quarters of every shot,
 * and no crop of the file could change that. Framing the footage vertically in
 * the first place answered it instead, so the alternatives went out with the
 * media they pointed at. See docs/portrait-mobile-spec.md.
 */
const VIDEO_BOX = "absolute inset-0 z-[2]";
/** svh, not lvh: the frame may run under the address bar, the words may not. */
const COPY_BOX = "absolute inset-x-0 top-0 z-30 h-[100svh]";

export function MobileNarrative({ id, settle = 2, closing, hero }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const heroRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  /** Where the scroll wants to be, in global logical frames. Written by ScrollTrigger. */
  const targetFrameRef = useRef(0);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const total = MOBILE_GLOBAL_DURATION + settle;

    /** The track currently on screen. Only this one is ever targeted at the scroll. */
    let active = 0;
    /** Non-null while the gate is holding the outgoing frame for an incoming one. */
    let gate: { to: number; since: number } | null = null;
    /** True while a seam dissolve is on screen, so it can be cleared exactly once. */
    let dissolving = false;

    /**
     * Governor state. `backlog` is scroll the visitor has asked for and not yet
     * been given, in pixels, released by the ticker at a bounded rate.
     */
    let backlog = 0;
    let journeyActive = false;

    /**
     * The display's own rate, measured rather than assumed — a 120 Hz phone may
     * present twice the story a 60 Hz one can, and half the handsets this will
     * run on are 120 Hz. Median of the first frame gaps, so one hitch during
     * startup cannot decide the budget for the whole session.
     */
    let refreshHz = REFRESH_FALLBACK_HZ;
    const gaps: number[] = [];
    let lastFrameAt = 0;
    const measureRefresh = (time: number) => {
      if (lastFrameAt) gaps.push(time - lastFrameAt);
      lastFrameAt = time;
      if (gaps.length < 24) return;
      gaps.sort((a, b) => a - b);
      const hz = 1000 / gaps[gaps.length >> 1];
      if (hz >= REFRESH_MIN_HZ && hz <= REFRESH_MAX_HZ) refreshHz = Math.round(hz);
      gsap.ticker.remove(measureRefresh);
    };
    gsap.ticker.add(measureRefresh);

    /**
     * Story rate the film may advance at, in multiples of real time. Never
     * below 1 — the story has to be able to advance at least at its own pace
     * even on a slow panel — and never above MOBILE_RATE_CEILING, which is
     * where a phone's decoder gives out well before its screen does.
     */
    const rateCeiling = () =>
      Math.min(MOBILE_RATE_CEILING, Math.max(1, refreshHz / FPS));

    /**
     * The scrub engines, ceilinged by the SAME function the governor spends
     * against.
     *
     * They have to come from one place. The governor decides how fast the
     * story may be asked to advance and the engine decides how fast the
     * picture is allowed to chase it; if the second is the larger of the two,
     * the extra is not headroom, it is licence to overshoot a target the
     * governor was never going to move that fast — and every overshoot on a
     * phone is paid for backwards, where there are no reverse companions to
     * play through. One function, read live, keeps them from disagreeing.
     */
    const engines: (ScrubEngine | null)[] = MOBILE_SEGMENTS.map((seg, i) => {
      const el = videoRefs.current[i];
      return el ? createScrubEngine(el, seg.duration, { rateCeiling }) : null;
    });

    /** Pixels of scrolling that equal one second of story, from the runway. */
    const pxPerStorySecond = () => (MOBILE_SCROLL_VH_PER_SECOND / 100) * window.innerHeight;

    /**
     * Pixels per second the page may scroll: the sustainable story rate times
     * the runway. Derived rather than fixed, so a longer runway automatically
     * permits more scrolling.
     */
    const governorBudget = () => rateCeiling() * governorFraction * pxPerStorySecond();

    /**
     * Pixels of banked gesture the governor will hold. Expressed through the
     * scrub engine's own threshold so the two stay tied together — see
     * GOVERNOR_BACKLOG_OF_SEEK_GAP.
     */
    const backlogCap = () =>
      FORWARD_SEEK_GAP * GOVERNOR_BACKLOG_OF_SEEK_GAP * pxPerStorySecond();

    /**
     * The gesture, swallowed. Enabled only while the film owns the screen — the
     * rest of the page keeps its native scrolling, momentum included.
     *
     * deltaY is inverted on the way in because Observer reports finger travel
     * and the page scrolls the other way, the same conversion normalizeScroll
     * makes for its own momentum.
     */
    const observer = governorOff
      ? null
      : Observer.create({
          target: window,
          type: "touch",
          preventDefault: true,
          onChangeY: (self) => {
            backlog += -self.deltaY;
          },
        });
    observer?.disable();

    videoRefs.current.forEach((el, i) => {
      if (el) el.style.opacity = i === 0 ? "1" : "0";
    });

    /** Global logical frame -> which segment holds it, and where inside it. */
    const locate = (globalFrame: number) => {
      let index = 0;
      for (let i = MOBILE_SEGMENTS.length - 1; i >= 0; i--) {
        if (globalFrame >= MOBILE_SEGMENT_START_FRAME[i]) {
          index = i;
          break;
        }
      }
      const local = Math.min(
        Math.max(globalFrame - MOBILE_SEGMENT_START_FRAME[index], 0),
        MOBILE_SEGMENTS[index].frames - 1,
      );
      return { index, local };
    };

    /** Bring a track's data in without disturbing whatever it is already doing. */
    const warm = (i: number) => {
      const el = videoRefs.current[i];
      if (!el || el.preload === "auto") return;
      el.preload = "auto";
      // Chrome starts fetching on the attribute alone; Safari wants the nudge,
      // and it is only safe while the element holds no frames to throw away.
      if (el.readyState === 0) el.load();
    };

    /**
     * Write the stack's opacities: the active track at full, everything else
     * hidden, except during a seam dissolve where the outgoing track is still
     * underneath.
     *
     * Which of the two carries the alpha is decided by DOM order, not by which
     * is arriving: these are stacked elements, so the LATER one paints on top
     * and is the only one whose opacity the eye can see change. Travelling
     * forward that is the incoming track, which fades up; travelling backwards
     * it is the outgoing one, which fades down. Fading the wrong one would
     * simply do nothing, which is the sort of bug that looks like the dissolve
     * "not working" on one scroll direction only.
     */
    const paint = (i: number, under: number, alpha: number) => {
      videoRefs.current.forEach((el, j) => {
        if (!el) return;
        if (under < 0) {
          el.style.opacity = j === i ? "1" : "0";
          return;
        }
        const top = Math.max(i, under);
        if (j === i) el.style.opacity = i === top ? String(alpha) : "1";
        else if (j === under) el.style.opacity = under === top ? String(1 - alpha) : "1";
        else el.style.opacity = "0";
      });
    };

    /**
     * Decide and write this frame's opacities, dissolve included.
     *
     * Both the crossing and the steady state come through here, and they have
     * to: the crossing lands INSIDE the dissolve window, so a hard paint there
     * would show the incoming scene whole for one tick before the fade started
     * — a flash of exactly the cut the dissolve exists to remove.
     *
     * `force` is what keeps the steady state cheap. Opacity is only rewritten
     * while the dissolve is actually changing, or once on the way out of one;
     * holding a scene does not need four style writes sixty times a second.
     */
    const paintFor = (i: number, target: number, force = false) => {
      let under = -1;
      let alpha = 1;
      const fade = SEAM_FADE_FRAMES[i];
      if (seamOn && SEAM_AT.has(i) && fade) {
        const into = target - MOBILE_SEGMENT_START_FRAME[i];
        if (into >= 0 && into < fade) {
          const prev = i - 1;
          const prevEl = prev >= 0 ? videoRefs.current[prev] : null;
          /**
           * Only dissolve from a track that genuinely handed over — one
           * parked on its own last frame. Arrive here by a jump instead and
           * the previous element is sitting on unrelated footage, where
           * fading from it is worse than the cut it replaces.
           */
          if (
            prevEl &&
            prevEl.readyState >= 2 &&
            prevEl.currentTime >= frameToMediaTime(MOBILE_SEGMENTS[prev].frames - 1) - fade / FPS
          ) {
            under = prev;
            alpha = smoothstep((into + 1) / (fade + 1));
          }
        }
      }
      if (under >= 0) {
        paint(i, under, alpha);
        dissolving = true;
      } else if (dissolving || force) {
        paint(i, -1, 1);
        dissolving = false;
      }
    };

    const show = (i: number, target: number) => {
      /**
       * Carry the outgoing engine's velocity into the incoming one.
       *
       * Each scene owns its engine, so without this the new one starts at
       * zero and the rate loses its feed-forward term for the ~170 ms it
       * takes to rebuild — a sag in the picture at exactly the moment a scene
       * begins, which is felt as a hitch at the join rather than as a wrong
       * frame. Seeded here, the incoming scene picks up at the speed the
       * outgoing one was running.
       */
      const from = engines[active];
      const to = engines[i];
      if (from && to && i !== active) to.seedVelocity(from.velocity());
      active = i;
      gate = null;
      paintFor(i, target, true);
    };

    const drive = (_time: number, deltaMs: number) => {
      // Release whatever the gesture asked for, at the governed rate.
      if (journeyActive && backlog !== 0) {
        const budget = governorBudget();
        const cap = backlogCap();
        if (Math.abs(backlog) > cap) backlog = Math.sign(backlog) * cap;
        const step = Math.sign(backlog) * Math.min(Math.abs(backlog), (budget * deltaMs) / 1000);
        backlog -= step;
        // Under a pixel is beneath what a scroll call can express; keep it for
        // the next tick instead of losing it to rounding.
        if (Math.abs(step) >= 1) {
          /**
           * `behavior: "instant"` is load-bearing, and CanvasNarrative paid for
           * this lesson already: the base stylesheet sets `scroll-behavior:
           * smooth` on <html> for anchor links, so a bare scroll call inherits
           * it and every one of these sixty-per-second calls starts a NEW
           * smooth animation, cancelling the last before it has travelled.
           * Measured there at ~200 px/s delivered against a 1395 px/s budget.
           */
          window.scrollTo({ top: window.scrollY + step, behavior: "instant" });
        } else backlog += step;
      }

      const target = targetFrameRef.current;
      const { index, local } = locate(Math.floor(target));
      // Keep the fractional part: the engine quantizes to whole frames itself,
      // and handing it the rounded value first would quantize twice.
      const fraction = target - Math.floor(target);
      const seconds = frameToMediaTime(Math.min(local + fraction, MOBILE_SEGMENTS[index].frames - 1));

      engines[index]?.setTarget(seconds);

      // The next track is warmed from inside the current one, never at the
      // boundary — a fetch started at the moment it is needed is already late.
      const nextStart = MOBILE_SEGMENT_START_FRAME[index + 1];
      if (nextStart !== undefined && target > nextStart - PRELOAD_LEAD_FRAMES) warm(index + 1);
      warm(index);

      if (index === active) {
        gate = null;
        // The seam dissolve, driven by scroll POSITION so it plays and
        // reverses with the gesture instead of running on its own clock.
        paintFor(index, target);
        return;
      }

      // A different track owns this frame. Target it while it is still hidden,
      // and hold the outgoing picture until it can actually show the frame.
      const el = videoRefs.current[index];
      warm(index);
      if (!el) return show(index, target);

      const now = performance.now();
      if (!gate || gate.to !== index) gate = { to: index, since: now };

      // Mirrors CanvasNarrative's forced handover: past HANDOVER_MAX_MS the
      // swap stops waiting for an exact frame match, but it still never shows
      // a track that has decoded nothing — readyState < 2 there just holds
      // the outgoing picture one more tick instead of flashing a blank frame.
      const landed = el.readyState >= 2 && Math.abs(el.currentTime - seconds) < HANDOVER_TOL;
      const forced = now - gate.since > HANDOVER_MAX_MS && el.readyState >= 2;
      if (landed || forced) show(index, target);
    };

    gsap.ticker.add(drive);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () =>
            `+=${Math.round(total * (MOBILE_SCROLL_VH_PER_SECOND / 100) * window.innerHeight)}`,
          pin: true,
          // pinType is deliberately LEFT ALONE, which resolves to position:
          // fixed for a viewport scroller — the same thing desktop pins with.
          //
          // This carried `pinType: "transform"` for one round, on the theory
          // that a fixed element would fight the collapsing URL bar. It made
          // the pin visibly shudder on every downward swipe, and the mechanism
          // is worth writing down because the theory sounded reasonable:
          // touch scrolling is driven by the compositor, while a counter
          // translation can only be written from the main thread, so the pinned
          // frame travels with the finger for a frame and is yanked back on the
          // next one. position:fixed never moves in the first place, so there is
          // nothing to correct and nothing to see.
          //
          // Both halves of the original worry were also unfounded. The section
          // is sized in svh — the SMALL viewport height — so it measures the
          // same whether the URL bar is showing or not, and ScrollTrigger
          // already discards the resize events a mobile URL bar fires
          // (_ignoreMobileResize, set from its own touch detection).
          scrub: SCRUB,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          // Same position in the document as the desktop journey, and the same
          // obligation to everything under it — see scrollOrder.
          refreshPriority: REFRESH_JOURNEY,
          // The governor may only intercept while the film owns the screen.
          // Anywhere else the gesture stays native, and the backlog is dropped
          // on the way out so leaving the section never coasts.
          onToggle: (self) => {
            journeyActive = self.isActive;
            if (self.isActive) {
              observer?.enable();
            } else {
              observer?.disable();
              backlog = 0;
            }
          },
        },
      });
      tl.to({}, { duration: total }, 0);

      tl.eventCallback("onUpdate", () => {
        const t = tl.time();
        targetFrameRef.current = Math.max(
          0,
          Math.min(MOBILE_GLOBAL_FRAMES - 1, (t / MOBILE_GLOBAL_DURATION) * (MOBILE_GLOBAL_FRAMES - 1)),
        );
      });

      if (heroRef.current) {
        tl.to(heroRef.current, { opacity: 0, y: -28, duration: 1.1, ease: "power1.in" }, 0.9);
        tl.set(heroRef.current, { pointerEvents: "none" }, 1.4);
      }

      // Same copy and easing as desktop, but mobile's four scenes run at
      // different durations and cut points (see MOBILE_SEGMENTS), so a
      // caption whose equipment moved to a different moment carries its own
      // globalStartMobile/globalEndMobile — falling back to desktop's timing
      // for the ones that did not need to move.
      OVERLAYS.forEach((o) => {
        const el = overlayRefs.current[o.id];
        if (!el) return;
        const position = o.positionMobile ?? o.position;
        const rise = position.startsWith("top") ? -18 : 22;
        const start = o.globalStartMobile ?? o.globalStart;
        const end = o.globalEndMobile ?? o.globalEnd;
        tl.fromTo(
          el,
          { opacity: 0, y: rise },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
          start,
        );
        tl.to(
          el,
          { opacity: 0, y: -rise * 0.6, duration: 0.38, ease: "power1.in" },
          Math.max(end - 0.38, start + 0.55),
        );
      });

      if (closing && closingRef.current) {
        if (scrimRef.current) {
          tl.fromTo(
            scrimRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 1 },
            MOBILE_GLOBAL_DURATION - 0.5,
          );
        }
        tl.set(closingRef.current, { pointerEvents: "auto" }, MOBILE_GLOBAL_DURATION);
        tl.fromTo(
          closingRef.current,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
          MOBILE_GLOBAL_DURATION - 0.1,
        );
      }
    }, section);

    // The pin is measured against a viewport a phone changes by scrolling, so
    // the first measurement is taken before the address bar has settled.
    ScrollTrigger.refresh();
    const settleTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);

    return () => {
      window.clearTimeout(settleTimer);
      gsap.ticker.remove(drive);
      gsap.ticker.remove(measureRefresh);
      // Kill, not disable: a live Observer left behind would keep swallowing
      // touchmove on a page that no longer has a film to govern.
      observer?.kill();
      engines.forEach((e) => e?.destroy());
      ctx.revert();
    };
    // Built once. `closing` and `hero` are JSX, so they are a new object on
    // every render of the page above — listing them would tear the pin down and
    // rebuild it mid-scroll for a value the effect only ever reads as truthy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * lvh for the frame, svh for the copy — the two are not the same question.
   *
   * A phone's address bar retracts as you scroll, and the viewport grows by its
   * height when it does. Sized in svh the pinned frame is the height of the
   * SMALL viewport, so the moment the bar goes away it is 60-90 px short and the
   * page's own black shows through underneath it. lvh is the height with the bar
   * hidden, so the picture always reaches the bottom edge; when the bar is
   * showing the surplus is simply behind it, and object-cover has been cropping
   * this footage all along.
   *
   * lvh keeps what svh was chosen for here. Both are constants — only dvh tracks
   * the bar live — so the pin still measures the same value on every refresh and
   * ScrollTrigger has nothing to thrash against.
   *
   * The copy cannot follow the frame out there, though: anything anchored to the
   * bottom of an lvh box sits behind the address bar whenever it is showing. So
   * the captions, the hero and the closing get their own svh layer, which is the
   * part of the screen that is visible in every state. The scrim is not in it —
   * it belongs to the picture and has to reach the same bottom edge.
   */
  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative h-[100lvh] w-full overflow-hidden bg-sonare-black"
    >
      {/* Four forward tracks, stacked. Opacity is written imperatively by the
          handover, so a scene change costs no React render. The poster carries
          the opening frame until scene 01 has one of its own — without it the
          hero opens on the section's own black. */}
      <div className={`overflow-hidden bg-sonare-black ${VIDEO_BOX}`}>
        {MOBILE_SEGMENTS.map((seg, i) => (
          <video
            key={seg.id}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            src={seg.mobileSrc}
            poster={i === 0 ? MOBILE_POSTER : undefined}
            muted
            playsInline
            preload={i === 0 ? "auto" : "none"}
            aria-hidden="true"
            tabIndex={-1}
            disablePictureInPicture
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: i === 0 ? 1 : 0 }}
          />
        ))}
      </div>

      {closing && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-black/45 opacity-0"
        />
      )}

      {/* Everything with words in it. In full-bleed it lies over the picture,
          bounded by the always-visible height; in the framed modes it owns the
          screen below the picture instead, which is the whole point of giving
          the height back.

          pointer-events are off on the layer and switched back on per child, so
          this box cannot swallow a tap meant for the page — the hero already
          hands its own back to the timeline at 1.4s. */}
      <div className={`pointer-events-none ${COPY_BOX}`}>
        {hero && (
          <div ref={heroRef} className="pointer-events-auto absolute inset-0">
            {hero}
          </div>
        )}

        {OVERLAYS.map((o) => (
          <OverlayCard
            key={o.id}
            overlay={{ ...o, position: o.positionMobile ?? o.position }}
            compact
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
      </div>
    </section>
  );
}
