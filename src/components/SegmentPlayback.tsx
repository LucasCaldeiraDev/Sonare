import { useEffect, useRef, useState, type ReactNode } from "react";
import { FPS, type Overlay, type Segment } from "../content/timeline";

import { useIsNearViewport } from "../hooks/useIsNearViewport";
import { OverlayCard } from "./OverlayCard";

/** Must match the CSS exit transition on OverlayCard (duration-500). */
const FADE_LEAD = 0.5;

type Props = {
  id?: string;
  segments: Segment[];
  overlays: Overlay[];
  wide: boolean;
  closing?: ReactNode;
  hero?: ReactNode;
};

function SegmentView({
  segment,
  overlays,
  hero,
}: {
  segment: Segment;
  overlays: Overlay[];
  hero?: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inViewRef = useRef(false);
  const mounted = useIsNearViewport(sectionRef, "90% 0px");
  const [active, setActive] = useState<string[]>([]);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !mounted) return;

    // Muted + playsInline autoplay is normally allowed, but play() can still
    // be rejected (Data Saver, iOS Low Power Mode, a transient decode error).
    // The one thing that reliably unblocks it is a real user gesture, so a
    // rejected play() is retried on the visitor's next touch/click instead of
    // leaving the segment frozen — and silent — for good.
    let retryOnGesture: (() => void) | null = null;
    const clearRetry = () => {
      if (!retryOnGesture) return;
      window.removeEventListener("pointerdown", retryOnGesture);
      retryOnGesture = null;
    };

    const io = new IntersectionObserver(
      (entries) => {
        const v = videoRef.current;
        if (!v) return;
        for (const e of entries) {
          inViewRef.current = e.isIntersecting;
          if (e.isIntersecting) {
            if (!v.ended) {
              v.play().catch(() => {
                clearRetry();
                retryOnGesture = () => {
                  if (inViewRef.current) v.play().catch(() => {});
                };
                window.addEventListener("pointerdown", retryOnGesture, { once: true });
              });
            }
          } else {
            v.pause();
            setActive([]);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearRetry();
    };
  }, [mounted]);

  // Captions follow the segment's own clock, converted from global time.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !mounted) return;
    const sync = () => {
      // currentTime is a MEDIA time; the global timeline starts offsetFrames
      // later inside the file. Without this subtraction every caption in a
      // segment carrying an offset would fire that much early.
      const g = segment.globalStart + v.currentTime - segment.offsetFrames / FPS;
      const next = inViewRef.current
        ? overlays
            .filter((o) => g >= o.globalStart && g <= o.globalEnd - FADE_LEAD)
            .map((o) => o.id)
        : [];
      setActive((prev) =>
        prev.length === next.length && prev.every((x, i) => x === next[i]) ? prev : next,
      );
    };
    v.addEventListener("timeupdate", sync);
    v.addEventListener("seeked", sync);
    return () => {
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("seeked", sync);
    };
  }, [mounted, overlays, segment.globalStart, segment.offsetFrames]);

  return (
    <section ref={sectionRef} className="relative min-h-[100svh] w-full overflow-hidden bg-sonare-black">
      {/* Only the opening segment ever shows a poster. The others cut straight
          from the previous segment's held frame.

          Restored: the poster had been dropped from this branch, so the hero
          opened on the section's own black until the first scene had buffered —
          and stayed black for good on a device that refuses to autoplay, since
          nothing else here ever paints a frame. */}
      {mounted && (
        <video
          ref={videoRef}
          src={segment.src}
          poster={segment.poster}
          muted
          playsInline
          preload={segment.index === 1 ? "auto" : "metadata"}
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          className="absolute inset-0 z-[2] h-full w-full object-cover"
        />
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[46%] bg-gradient-to-t from-black/70 via-black/25 to-transparent transition-opacity duration-500 ${
          hero || active.length > 0 ? "opacity-100" : "opacity-0"
        }`}
      />

      {overlays
        .filter((o) => !hero || o.kind === "equipment")
        .map((o) => (
          <OverlayCard
            key={o.id}
            overlay={{ ...o, position: o.positionMobile ?? o.position }}
            visible={active.includes(o.id)}
            compact
          />
        ))}

      {hero && <div className="relative z-10 flex min-h-[100svh] items-end">{hero}</div>}
    </section>
  );
}

/**
 * Touch/narrow presentation: the four segments play in sequence as you scroll.
 * Each holds its final frame when it ends, which is the next segment's first
 * frame, so the journey still reads as continuous.
 */
export function SegmentPlayback({ id, segments, overlays, closing, hero }: Props) {
  return (
    <div id={id}>
      {segments.map((seg, i) => (
        <SegmentView
          key={seg.id}
          segment={seg}
          hero={i === 0 ? hero : undefined}
          overlays={overlays.filter(
            (o) => o.globalStart < seg.globalEnd && o.globalEnd > seg.globalStart,
          )}
        />
      ))}
      {closing}
    </div>
  );
}
