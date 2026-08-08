import { useEffect, useRef, useState, type RefObject } from "react";
import {
  RAIL_CHAPTERS,
  TOTAL_TIMECODE,
  chapterAt,
  formatTimecode,
  secondsAt,
  statusAt,
} from "../content/systemStatus";
import { GLOBAL_FRAMES } from "../content/timeline";

type SystemRailProps = {
  /** The gold fill element. CanvasNarrative drives its scaleY directly. */
  fillRef: RefObject<HTMLDivElement | null>;
};

/**
 * The journey's instrument: chapters, live timecode and a status line naming
 * what the automation is doing in the current shot — the page borrowing the
 * product's own interface language.
 *
 * Updates arrive as `sonare:frame` events from the render loop. React state
 * changes only when a chapter or beat flips (a handful per journey); the
 * timecode writes straight to the DOM and the progress fill is GSAP-owned, so
 * the render loop never pays for a React render.
 */
export function SystemRail({ fillRef }: SystemRailProps) {
  const [chapter, setChapter] = useState(0);
  const [status, setStatus] = useState(() => statusAt(0));
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastChapter = -1;
    let lastStatus = "";
    let lastTenth = -1;

    const onFrame = (event: Event) => {
      const frame = (event as CustomEvent<{ frame: number }>).detail.frame;

      const seconds = secondsAt(frame);
      const tenth = Math.floor(seconds * 10);
      if (tenth !== lastTenth && timeRef.current) {
        lastTenth = tenth;
        timeRef.current.textContent = formatTimecode(seconds);
      }

      const nextChapter = chapterAt(frame);
      if (nextChapter !== lastChapter) {
        lastChapter = nextChapter;
        setChapter(nextChapter);
      }

      const nextStatus = statusAt(frame);
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        setStatus(nextStatus);
      }
    };

    window.addEventListener("sonare:frame", onFrame as EventListener);
    return () => window.removeEventListener("sonare:frame", onFrame as EventListener);
  }, []);

  const seekTo = (index: number) => {
    // +2 frames lands safely inside the chapter instead of on its boundary.
    const frame = Math.min(RAIL_CHAPTERS[index].startFrame + 2, GLOBAL_FRAMES - 1);
    window.dispatchEvent(new CustomEvent("sonare:seek", { detail: { frame } }));
  };

  return (
    <nav
      aria-label="Capítulos da experiência"
      className="pointer-events-none absolute right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end lg:flex"
    >
      <p className="m-0 mb-4 font-mono text-[0.62rem] tracking-[0.08em] text-sonare-silver/70 tabular-nums">
        <span ref={timeRef}>00:00.0</span>
        <span className="text-sonare-silver/40"> / {TOTAL_TIMECODE}</span>
      </p>

      <div className="relative h-72 w-44">
        {/* The spine: one line for the whole journey, gold as far as you've come. */}
        <div className="absolute right-0 top-0 h-full w-px overflow-hidden bg-white/15">
          <div
            ref={fillRef}
            className="absolute inset-x-0 top-0 h-full origin-top bg-sonare-gold"
            style={{ transform: "scaleY(0)" }}
          />
        </div>

        {RAIL_CHAPTERS.map((c, i) => {
          const active = i === chapter;
          const pct = (c.startFrame / (GLOBAL_FRAMES - 1)) * 100;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => seekTo(i)}
              aria-label={`Ir para ${c.label}`}
              aria-current={active ? "true" : undefined}
              className="group pointer-events-auto absolute right-0 flex -translate-y-1/2 items-center gap-2.5 pr-2.5"
              style={{ top: `${pct}%` }}
            >
              <span
                className={`font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors duration-300 ${
                  active
                    ? "text-sonare-white"
                    : "text-sonare-silver/45 group-hover:text-sonare-silver"
                }`}
              >
                {c.label}
              </span>
              <span
                aria-hidden="true"
                className={`h-px w-2.5 transition-colors duration-300 ${
                  active ? "bg-sonare-gold" : "bg-white/25 group-hover:bg-white/55"
                }`}
              />
            </button>
          );
        })}
      </div>

      <p className="m-0 mt-4 max-w-[13rem] text-right font-mono text-[0.62rem] leading-relaxed tracking-[0.04em] text-sonare-gold/90">
        {status}
      </p>
    </nav>
  );
}
