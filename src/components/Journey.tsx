import type { ReactNode } from "react";
import { OVERLAYS, SEGMENTS } from "../content/timeline";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useViewportProfile } from "../hooks/useViewportProfile";
import { CanvasNarrative } from "./CanvasNarrative";
import { SegmentPlayback } from "./SegmentPlayback";
import { SegmentStills } from "./SegmentStills";

type JourneyProps = {
  id?: string;
  settle?: number;
  closing?: { overlay: ReactNode; section: ReactNode };
  hero?: ReactNode;
};

/**
 * Picks how the single 29.2s journey is presented:
 * - fine pointer + wide  → one pinned canvas, scroll drives global time;
 * - touch / narrow       → the same four segments played in sequence in view;
 * - reduced motion       → stills plus the overlay copy as permanent text.
 *
 * All three consume the same global timeline, so the narrative and the
 * equipment captions stay identical across modes.
 */
export function Journey({ id, settle, closing, hero }: JourneyProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { isWide, canScrub } = useViewportProfile();

  if (reducedMotion) {
    return <SegmentStills id={id} segments={SEGMENTS} overlays={OVERLAYS} closing={closing?.section} hero={hero} />;
  }

  if (canScrub) {
    return <CanvasNarrative id={id} settle={settle} closing={closing?.overlay} hero={hero} />;
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
