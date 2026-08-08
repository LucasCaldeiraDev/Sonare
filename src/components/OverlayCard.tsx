import type { CSSProperties } from "react";
import type { OverlayPosition } from "../content/timeline";

/**
 * Only the presentational fields. Timing lives on the global timeline and is
 * applied by whoever owns the animation, so this component never sees it.
 */
export type OverlayContent = {
  id: string;
  kind: "narrative" | "equipment";
  eyebrow?: string;
  title: string;
  description: string;
  descriptionMobile?: string;
  equipment?: string;
  position: OverlayPosition;
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
 * - equipment: a discreet chip naming the gear currently on screen; its own
 *   panel already guarantees contrast, so it adds no mask over the scene.
 * Pure HTML/CSS → razor sharp at any resolution, including 4K.
 */
export function OverlayCard({ overlay, visible, style, refCallback, compact = false }: OverlayCardProps) {
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

  return (
    <div
      ref={refCallback}
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

      <div className={`relative ${INSET[overlay.position]}`}>
        {overlay.kind === "equipment" ? (
          // The chip anchors to its corner, but its copy always reads left-aligned —
          // right-ragged body text costs legibility for nothing.
          <div
            className={`rounded-md border border-white/15 bg-black/55 text-left backdrop-blur-md ${
              compact ? "max-w-[15rem] px-3.5 py-2.5" : "max-w-[18rem] px-4 py-3 lg:max-w-sm"
            }`}
          >
            <p className="m-0 mb-1 flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-sonare-gold">
              <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-sonare-gold" />
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
