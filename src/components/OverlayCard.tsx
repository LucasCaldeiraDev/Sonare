import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Crosshair } from "lucide-react";
import {
  GLOBAL_DURATION,
  GLOBAL_FRAMES,
  type OverlayAnchor,
  type OverlayPosition,
} from "../content/timeline";

/**
 * The presentational fields, plus the card's window on the global timeline.
 * ENTRANCE and EXIT still belong to whoever owns the animation — the window is
 * read by exactly one thing here: the anchor tracker, which needs it to know
 * how far along the camera move the current frame is.
 */
export type OverlayContent = {
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
  anchor?: OverlayAnchor;
};

/** Flex anchoring for the full-bleed root, so the card lands in its corner. */
const ANCHOR: Record<OverlayPosition, string> = {
  "bottom-left": "items-end justify-start",
  "bottom-right": "items-end justify-end",
  "top-left": "items-start justify-start",
  "top-right": "items-start justify-end",
};

/** Padding that keeps the card off the viewport edges (and clear of the navbar on top). */
const INSET: Record<OverlayPosition, string> = {
  "bottom-left": "pl-6 pr-6 pb-[9vh] sm:pl-12 lg:pl-20",
  "bottom-right": "pr-6 pl-6 pb-[9vh] sm:pr-12 lg:pr-20",
  "top-left": "pl-6 pr-6 pt-[15vh] sm:pl-12 lg:pl-20",
  "top-right": "pr-6 pl-6 pt-[15vh] sm:pr-12 lg:pr-20",
};

/**
 * Localized legibility mask. Replaces the old full-width bottom scrim, which
 * darkened the whole residence: this one is confined to the card's own corner
 * (~52% of the width), peaks at 44% opacity, feathers to nothing well before
 * mid-frame, and — because it lives inside the card — simply does not exist
 * during stretches with no text.
 */
const MASK_GEOMETRY: Record<OverlayPosition, string> = {
  "bottom-left": "left-0 bottom-0 w-[52%] h-[62%]",
  "bottom-right": "right-0 bottom-0 w-[52%] h-[62%]",
  "top-left": "left-0 top-0 w-[52%] h-[52%]",
  "top-right": "right-0 top-0 w-[52%] h-[52%]",
};

const MASK_GRADIENT: Record<OverlayPosition, string> = {
  "bottom-left":
    "radial-gradient(ellipse at left bottom, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0) 72%)",
  "bottom-right":
    "radial-gradient(ellipse at right bottom, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0) 72%)",
  "top-left":
    "radial-gradient(ellipse at left top, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0) 72%)",
  "top-right":
    "radial-gradient(ellipse at right top, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0) 72%)",
};

/** Native aspect of the journey footage; segment 3's 3856x2148 differs by <1%. */
const SOURCE_AR = 3840 / 2160;

type OverlayCardProps = {
  overlay: OverlayContent;
  /**
   * CSS-driven visibility (autoplay mode). When undefined, the card carries no
   * CSS transition at all — GSAP owns opacity/transform (scrub mode), and the
   * two systems must never fight over the same properties.
   */
  visible?: boolean;
  style?: CSSProperties;
  refCallback?: (el: HTMLDivElement | null) => void;
  /** Tighter type and copy for narrow viewports. */
  compact?: boolean;
};

/**
 * A single timed caption inside the cinematic frame. Two voices:
 * - narrative: the editorial beat (bigger type, carries its own soft mask);
 * - equipment: a chip naming the gear on screen, connected to it by a dotted
 *   gold leader ending in a pulsing point over the equipment itself. The chip
 *   speaks in the system voice (mono eyebrow), the same register as the rail.
 * Pure HTML/CSS → razor sharp at any resolution, including 4K.
 *
 * The anchor pipeline is deliberately imperative: positions are written
 * straight to the dot/line DOM nodes on resize and on `sonare:frame`, so
 * tracking a camera move costs zero React renders — the same rule the render
 * loop itself follows. GSAP owns opacity/transform of the ROOT; the tracker
 * only ever touches left/top of the dot and the line's endpoint attributes,
 * so the two can never fight.
 */
export function OverlayCard({ overlay, visible, style, refCallback, compact = false }: OverlayCardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);

  const cssDriven = visible !== undefined;
  const transition = cssDriven
    ? `transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0"
          : overlay.position.startsWith("top")
            ? "opacity-0 -translate-y-3"
            : "opacity-0 translate-y-3"
      }`
    : "";

  // Narrow viewports get the trimmed copy when the author supplied one.
  const body = compact ? (overlay.descriptionMobile ?? overlay.description) : overlay.description;

  // Compact mode drops the anchor: on a phone the chip is nearly as wide as
  // the frame, so a leader line has nowhere honest to travel.
  const hasAnchor = overlay.kind === "equipment" && !!overlay.anchor && !compact;

  useLayoutEffect(() => {
    if (!hasAnchor) return;
    const anchor = overlay.anchor;
    const root = rootRef.current;
    const card = cardRef.current;
    const dot = dotRef.current;
    const line = lineRef.current;
    if (!anchor || !root || !card || !dot || !line) return;

    /** 0 at the window's start, 1 at its end — how far along the camera move. */
    let progress = 0;

    const apply = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (!w || !h) return;

      // Where the equipment is RIGHT NOW, in source percent.
      const px = anchor.x + ((anchor.x2 ?? anchor.x) - anchor.x) * progress;
      const py = anchor.y + ((anchor.y2 ?? anchor.y) - anchor.y) * progress;

      // The same centre-anchored cover crop the canvas draws with, inverted:
      // which slice of the source is on screen, and where inside it this
      // point falls. Without this, any viewport that is not exactly 16:9
      // would place the dot on the wrong pixels.
      const containerAR = w / h;
      let sw = 1;
      let sh = 1;
      let sx = 0;
      let sy = 0;
      if (containerAR > SOURCE_AR) {
        sh = SOURCE_AR / containerAR;
        sy = (1 - sh) / 2;
      } else {
        sw = containerAR / SOURCE_AR;
        sx = (1 - sw) / 2;
      }
      const ax = ((px / 100 - sx) / sw) * w;
      const ay = ((py / 100 - sy) / sh) * h;

      const rootRect = root.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const cardLeft = cardRect.left - rootRect.left;
      const cardTop = cardRect.top - rootRect.top;

      // Hidden when the crop cuts the point off screen, or when the layout
      // puts the card itself on top of it — a marker under the card explains
      // nothing and reads as a defect.
      const onScreen = ax >= 0 && ax <= w && ay >= 0 && ay <= h;
      const underCard =
        ax >= cardLeft &&
        ax <= cardLeft + cardRect.width &&
        ay >= cardTop &&
        ay <= cardTop + cardRect.height;
      const show = onScreen && !underCard;
      dot.style.visibility = show ? "visible" : "hidden";
      line.style.visibility = show ? "visible" : "hidden";
      if (!show) return;

      dot.style.left = `${ax}px`;
      dot.style.top = `${ay}px`;

      // The leader starts where the card's edge faces the equipment: the exit
      // point of the centre→anchor ray, pushed off the edge by a small gap so
      // the line never touches the panel, and stopped short of the dot so the
      // pulse ring has room to breathe.
      const cx = cardLeft + cardRect.width / 2;
      const cy = cardTop + cardRect.height / 2;
      const dx = ax - cx;
      const dy = ay - cy;
      const tEdge = Math.min(
        dx !== 0 ? cardRect.width / 2 / Math.abs(dx) : Infinity,
        dy !== 0 ? cardRect.height / 2 / Math.abs(dy) : Infinity,
      );
      if (!Number.isFinite(tEdge)) return;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      line.setAttribute("x1", String(cx + dx * tEdge + ux * 12));
      line.setAttribute("y1", String(cy + dy * tEdge + uy * 12));
      line.setAttribute("x2", String(ax - ux * 10));
      line.setAttribute("y2", String(ay - uy * 10));
    };

    apply();

    // Camera-move tracking, only for two-point anchors. `sonare:frame` fires
    // once per PRESENTED story frame — while this card's window is not on
    // screen the writes land on an invisible node and cost nothing visible.
    const drifts = anchor.x2 !== undefined || anchor.y2 !== undefined;
    const span = overlay.globalEnd - overlay.globalStart || 1;
    const onFrame = drifts
      ? (event: Event) => {
          const frame = (event as CustomEvent<{ frame: number }>).detail.frame;
          const seconds = (frame / (GLOBAL_FRAMES - 1)) * GLOBAL_DURATION;
          const next = Math.min(1, Math.max(0, (seconds - overlay.globalStart) / span));
          if (Math.abs(next - progress) < 0.01) return;
          progress = next;
          apply();
        }
      : null;
    if (onFrame) window.addEventListener("sonare:frame", onFrame as EventListener);

    // Root for viewport changes, card for its own reflow (font load, copy swap).
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(root);
    ro?.observe(card);

    return () => {
      if (onFrame) window.removeEventListener("sonare:frame", onFrame as EventListener);
      ro?.disconnect();
    };
  }, [hasAnchor, overlay.anchor, overlay.globalStart, overlay.globalEnd]);

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        refCallback?.(el);
      }}
      className={`pointer-events-none absolute inset-0 z-30 flex ${ANCHOR[overlay.position]} ${transition}`}
      style={style}
      data-overlay={overlay.id}
    >
      {overlay.kind === "narrative" && (
        <span
          aria-hidden="true"
          className={`absolute ${MASK_GEOMETRY[overlay.position]}`}
          style={{ background: MASK_GRADIENT[overlay.position] }}
        />
      )}

      {hasAnchor && (
        <>
          {/* No viewBox on purpose: user units equal CSS pixels, which is the
              space every coordinate above is computed in. */}
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full">
            <line
              ref={lineRef}
              stroke="#cf9f52"
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray="1 6"
              opacity="0.75"
              style={{ visibility: "hidden" }}
            />
          </svg>
          <span
            ref={dotRef}
            aria-hidden="true"
            className="anchor-dot absolute block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sonare-gold"
            style={{ visibility: "hidden" }}
          />
        </>
      )}

      <div className={`relative ${INSET[overlay.position]}`}>
        {overlay.kind === "equipment" ? (
          // The chip anchors to its corner, but its copy always reads left-aligned —
          // right-ragged body text costs legibility for nothing. A gold hairline
          // on top instead of a full border: the blur panel defines its own
          // edges, so the one line left is the one that carries the brand.
          <div
            ref={cardRef}
            className={`rounded-sm border-t border-sonare-gold/70 bg-sonare-black/60 text-left shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${
              compact ? "max-w-[15rem] px-3.5 py-2.5" : "max-w-[18rem] px-4 py-3 lg:max-w-sm"
            }`}
          >
            <p className="m-0 mb-1.5 flex items-center gap-2 font-mono text-[0.62rem] font-medium uppercase tracking-[0.16em] text-sonare-gold">
              <Crosshair size={11} aria-hidden="true" className="shrink-0" />
              {overlay.eyebrow ?? overlay.equipment ?? "Equipamento"}
            </p>
            <p
              className={`m-0 font-bold leading-snug text-sonare-white ${compact ? "text-[0.84rem]" : "text-[0.92rem]"}`}
            >
              {overlay.title}
            </p>
            <p
              className={`m-0 mt-1 leading-relaxed text-sonare-silver/90 ${compact ? "text-[0.74rem]" : "text-[0.79rem]"}`}
            >
              {body}
            </p>
          </div>
        ) : (
          <div className={`text-left ${compact ? "max-w-sm" : "max-w-xl"}`}>
            {overlay.eyebrow && (
              <p className="m-0 mb-3 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-sonare-gold">
                {overlay.eyebrow}
              </p>
            )}
            <h2
              className={`m-0 mb-3 font-grandis font-medium leading-tight text-sonare-white ${
                compact ? "text-xl" : "text-2xl lg:text-4xl"
              }`}
            >
              {overlay.title}
            </h2>
            <p
              className={`m-0 leading-relaxed text-sonare-silver ${compact ? "text-[0.9rem]" : "text-base lg:text-lg"}`}
            >
              {body}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
