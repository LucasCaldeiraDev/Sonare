import type { ReactNode } from "react";
import { OVERLAYS, SEGMENTS } from "../content/timeline";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useViewportProfile } from "../hooks/useViewportProfile";
import { CanvasNarrative } from "./CanvasNarrative";
import { MobileNarrative } from "./MobileNarrative";
import { SegmentPlayback } from "./SegmentPlayback";
import { SegmentStills } from "./SegmentStills";

type JourneyProps = {
  id?: string;
  settle?: number;
  closing?: { overlay: ReactNode; section: ReactNode };
  hero?: ReactNode;
};

/**
 * `?journey=segments` restores the per-scene autoplay mode on a device that
 * would now scrub. Kept because the scrub path has been measured in emulation
 * only: the first handset that cannot seek the portrait set smoothly needs a
 * way to be compared against the mode it replaced, in the same session, without
 * a rebuild. Dev-only, so neither the branch nor the string ships.
 */
const forceSegments =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("journey") === "segments";

/**
 * Picks how the single 42.2s journey is presented:
 * - fine pointer + wide  → one pinned canvas, scroll drives global time;
 * - portrait touch       → one pinned frame on the 1:2 media, scroll drives
 *                          global time — the same film, reframed, not a
 *                          different presentation of it;
 * - anything else touch  → the landscape segments played in sequence in view.
 *                          Which in practice means a phone turned sideways and
 *                          a tablet or touch laptop in landscape: wide enough
 *                          that the portrait media would not fit, coarse enough
 *                          that the desktop path will not take them.
 * - reduced motion       → stills plus the overlay copy as permanent text.
 *
 * All four consume the same global timeline, so the narrative and the equipment
 * captions stay identical across modes.
 */
export function Journey({ id, settle, closing, hero }: JourneyProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { isWide, canScrub, isPortrait } = useViewportProfile();

  if (reducedMotion) {
    return <SegmentStills id={id} segments={SEGMENTS} overlays={OVERLAYS} closing={closing?.section} hero={hero} />;
  }

  if (canScrub) {
    return <CanvasNarrative id={id} settle={settle} closing={closing?.overlay} hero={hero} />;
  }

  if (isPortrait && !forceSegments) {
    return <MobileNarrative id={id} closing={closing?.overlay} hero={hero} />;
  }

  return (
    <SegmentPlayback
      id={id}
      segments={SEGMENTS}
      overlays={OVERLAYS}
      wide={isWide}
      closing={closing?.section}
      hero={hero}
    />
  );
}
