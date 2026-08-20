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
 * This replaces a fallback that played the five scenes as five separate
 * autoplaying sections. That fallback was honest about what had been validated
 * — it was written before the film had ever run on a handset — but it broke the
 * one thing the piece is about. The visitor was not moving through a house; the
 * visitor was watching five clips that happened to be stacked vertically, each
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
 *                       of seek is a trade worth making at 4K. At 720x1440 with
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
const governorOff = governorParam === "off";
const governorFraction = Number(governorParam) || GOVERNOR_FRACTION;

/**
 * How much of the screen the picture takes, and therefore how much of the room
 * you get to see. `?frame=45` and `?frame=169` in development.
 *
 * THESE ARE THE ONLY THREE ANSWERS THERE ARE, and the reason is worth stating
 * because "zoom out a bit" sounds like a setting and is not one. With the
 * picture filling the height of a portrait screen, object-fit: cover decides the
 * visible horizontal field from the screen's aspect ratio alone — about 26% of
 * a 16:9 frame on a 430x932 phone — and cropping the FILE wider cannot change
 * that, because the surplus is exactly what cover throws away. The only way to
 * see more of the room is for the picture to stop filling the height. So each
 * option below is a different answer to one question: how much screen to give
 * back in exchange for how much more scene.
 *
 * Counter-intuitively the wider framings are also the LIGHTER ones — 16,6 MB
 * for the whole 4:5 set and 11,8 MB for 16:9, against 22,19 MB for full-bleed —
 * because a shorter box needs fewer rows of pixels to fill it sharply.
 *
 * FULL IS STILL THE DEFAULT, deliberately. Only its media lives in public/; the
 * other two are served from media-comparison/ the same way ?temporalMedia=48 is,
 * so they resolve while developing and cannot reach a build. Promoting whichever
 * wins is a separate, explicit step — moving five files and changing the default
 * here — rather than something that happens by leaving a flag switched on.
 */
type FrameMode = {
  id: string;
  /** Share of the 3840px master visible on a 430px-wide phone. */
  field: string;
  src: (index: number) => string;
  /** The picture's box inside the pinned section. */
  videoBox: string;
  /** Where the captions, the hero and the closing live. */
  copyBox: string;
};

const scene = (index: number) => String(index).padStart(2, "0");

const FRAMES: Record<string, FrameMode> = {
  full: {
    id: "full",
    field: "26%",
    src: (i) => MOBILE_SEGMENTS[i - 1].mobileSrc,
    videoBox: "absolute inset-0 z-[2]",
    // svh, not lvh: the frame may run under the address bar, the words may not.
    copyBox: "absolute inset-x-0 top-0 z-30 h-[100svh]",
  },
  45: {
    id: "45",
    field: "45%",
    src: (i) => `/media-comparison/framing/scene-${scene(i)}-4x5.mp4`,
    // 4:5 at full width is 125vw tall, which is where the copy then starts.
    videoBox: "absolute inset-x-0 top-0 z-[2] h-[125vw]",
    copyBox: "absolute inset-x-0 bottom-0 top-[125vw] z-30",
  },
  169: {
    id: "169",
    field: "100%",
    src: (i) => `/media-comparison/framing/scene-${scene(i)}-16x9.mp4`,
    videoBox: "absolute inset-x-0 top-0 z-[2] h-[56.25vw]",
    copyBox: "absolute inset-x-0 bottom-0 top-[56.25vw] z-30",
  },
};

const frameFlag = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("frame")
  : null;
const FRAME = (frameFlag && FRAMES[frameFlag]) || FRAMES.full;

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
    const engines: (ScrubEngine | null)[] = MOBILE_SEGMENTS.map((seg, i) => {
      const el = videoRefs.current[i];
      return el ? createScrubEngine(el, seg.duration) : null;
    });

    /** The track currently on screen. Only this one is ever targeted at the scroll. */
    let active = 0;
    /** Non-null while the gate is holding the outgoing frame for an incoming one. */
    let gate: { to: number; since: number } | null = null;

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

    const show = (i: number) => {
      videoRefs.current.forEach((el, j) => {
        if (el) el.style.opacity = j === i ? "1" : "0";
      });
      active = i;
      gate = null;
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
        return;
      }

      // A different track owns this frame. Target it while it is still hidden,
      // and hold the outgoing picture until it can actually show the frame.
      const el = videoRefs.current[index];
      warm(index);
      if (!el) return show(index);

      const now = performance.now();
      if (!gate || gate.to !== index) gate = { to: index, since: now };

      // Mirrors CanvasNarrative's forced handover: past HANDOVER_MAX_MS the
      // swap stops waiting for an exact frame match, but it still never shows
      // a track that has decoded nothing — readyState < 2 there just holds
      // the outgoing picture one more tick instead of flashing a blank frame.
      const landed = el.readyState >= 2 && Math.abs(el.currentTime - seconds) < HANDOVER_TOL;
      const forced = now - gate.since > HANDOVER_MAX_MS && el.readyState >= 2;
      if (landed || forced) show(index);
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
      <div className={`overflow-hidden bg-sonare-black ${FRAME.videoBox}`}>
        {MOBILE_SEGMENTS.map((seg, i) => (
          <video
            key={seg.id}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            src={FRAME.src(i + 1)}
            poster={i === 0 && FRAME.id === "full" ? MOBILE_POSTER : undefined}
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
      <div className={`pointer-events-none ${FRAME.copyBox}`}>
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
