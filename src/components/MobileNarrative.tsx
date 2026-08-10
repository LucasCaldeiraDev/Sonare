import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger } from "../lib/gsap";
import {
  frameToMediaTime,
  GLOBAL_DURATION,
  GLOBAL_FRAMES,
  MOBILE_POSTER,
  MOBILE_SCROLL_VH_PER_SECOND,
  OVERLAYS,
  SEGMENT_START_FRAME,
  SEGMENTS,
} from "../content/timeline";
import { createScrubEngine, type ScrubEngine } from "../lib/scrubEngine";
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
  closing?: ReactNode;
  hero?: ReactNode;
};

/** ScrollTrigger catch-up, in seconds. Slightly tighter than desktop's 1.1. */
const SCRUB = 1.0;

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

export function MobileNarrative({ id, closing, hero }: Props) {
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

    const total = GLOBAL_DURATION;
    const engines: (ScrubEngine | null)[] = SEGMENTS.map((seg, i) => {
      const el = videoRefs.current[i];
      return el ? createScrubEngine(el, seg.duration) : null;
    });

    /** The track currently on screen. Only this one is ever targeted at the scroll. */
    let active = 0;
    /** Non-null while the gate is holding the outgoing frame for an incoming one. */
    let gate: { to: number; since: number } | null = null;

    videoRefs.current.forEach((el, i) => {
      if (el) el.style.opacity = i === 0 ? "1" : "0";
    });

    /** Global logical frame -> which segment holds it, and where inside it. */
    const locate = (globalFrame: number) => {
      let index = 0;
      for (let i = SEGMENTS.length - 1; i >= 0; i--) {
        if (globalFrame >= SEGMENT_START_FRAME[i]) {
          index = i;
          break;
        }
      }
      const local = Math.min(
        Math.max(globalFrame - SEGMENT_START_FRAME[index], 0),
        SEGMENTS[index].frames - 1,
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

    const drive = () => {
      const target = targetFrameRef.current;
      const { index, local } = locate(Math.floor(target));
      // Keep the fractional part: the engine quantizes to whole frames itself,
      // and handing it the rounded value first would quantize twice.
      const fraction = target - Math.floor(target);
      const seconds = frameToMediaTime(Math.min(local + fraction, SEGMENTS[index].frames - 1));

      engines[index]?.setTarget(seconds);

      // The next track is warmed from inside the current one, never at the
      // boundary — a fetch started at the moment it is needed is already late.
      const nextStart = SEGMENT_START_FRAME[index + 1];
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

      const landed = el.readyState >= 2 && Math.abs(el.currentTime - seconds) < HANDOVER_TOL;
      if (landed || now - gate.since > HANDOVER_MAX_MS) show(index);
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
          // Transform pinning, explicitly. position:fixed on a phone fights the
          // collapsing URL bar, which is exactly the height this pin is sized
          // against — the one combination that produces a visible jump.
          pinType: "transform",
          scrub: SCRUB,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      tl.to({}, { duration: total }, 0);

      tl.eventCallback("onUpdate", () => {
        const t = tl.time();
        targetFrameRef.current = Math.max(
          0,
          Math.min(GLOBAL_FRAMES - 1, (t / GLOBAL_DURATION) * (GLOBAL_FRAMES - 1)),
        );
      });

      if (heroRef.current) {
        tl.to(heroRef.current, { opacity: 0, y: -28, duration: 1.1, ease: "power1.in" }, 0.9);
        tl.set(heroRef.current, { pointerEvents: "none" }, 1.4);
      }

      // Identical windows and easing to desktop, so a caption arrives on the
      // same frame of footage in both modes.
      OVERLAYS.forEach((o) => {
        const el = overlayRefs.current[o.id];
        if (!el) return;
        const position = o.positionMobile ?? o.position;
        const rise = position.startsWith("top") ? -18 : 22;
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
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
          GLOBAL_DURATION - 0.1,
        );
      }
    }, section);

    // The pin is measured against a viewport a phone changes by scrolling, so
    // the first measurement is taken before the address bar has settled.
    ScrollTrigger.refresh();
    const settle = window.setTimeout(() => ScrollTrigger.refresh(), 250);

    return () => {
      window.clearTimeout(settle);
      gsap.ticker.remove(drive);
      engines.forEach((e) => e?.destroy());
      ctx.revert();
    };
    // Built once. `closing` and `hero` are JSX, so they are a new object on
    // every render of the page above — listing them would tear the pin down and
    // rebuild it mid-scroll for a value the effect only ever reads as truthy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative h-[100svh] w-full overflow-hidden bg-sonare-black"
    >
      {/* Five forward tracks, stacked. Opacity is written imperatively by the
          handover, so a scene change costs no React render. The poster carries
          the opening frame until scene 01 has one of its own — without it the
          hero opens on the section's own black. */}
      {SEGMENTS.map((seg, i) => (
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
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-cover"
          style={{ opacity: i === 0 ? 1 : 0 }}
        />
      ))}

      {closing && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-black/45 opacity-0"
        />
      )}

      {hero && (
        <div ref={heroRef} className="absolute inset-0 z-30">
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
    </section>
  );
}
