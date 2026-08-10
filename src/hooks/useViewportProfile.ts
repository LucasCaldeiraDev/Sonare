import { useEffect, useState } from "react";

export type ViewportProfile = {
  /** Wide enough to warrant the sharper desktop-resolution video/poster assets. */
  isWide: boolean;
  /** Wide viewport with a precise pointer: eligible for pinned scroll-scrub narrative. */
  canScrub: boolean;
  /**
   * Taller than it is wide — the only shape the 1:2 portrait media is framed
   * for. Orientation rather than width because the question is what the media
   * has to fill, not how much room the copy gets: a phone turned sideways is
   * 844 px of landscape viewport and would show a portrait file as a thin band
   * across its middle.
   */
  isPortrait: boolean;
};

const WIDE_QUERY = "(min-width: 900px)";
const FINE_POINTER_QUERY = "(pointer: fine)";
const PORTRAIT_QUERY = "(orientation: portrait)";

function readProfile(): ViewportProfile {
  if (typeof window === "undefined") {
    return { isWide: false, canScrub: false, isPortrait: true };
  }
  const isWide = window.matchMedia(WIDE_QUERY).matches;
  const canScrub = isWide && window.matchMedia(FINE_POINTER_QUERY).matches;
  const isPortrait = window.matchMedia(PORTRAIT_QUERY).matches;
  return { isWide, canScrub, isPortrait };
}

/**
 * Desktop/mobile asset choice and the scrub-vs-autoplay interaction mode both
 * hinge on viewport width and pointer precision. Consolidated into one hook so
 * every scene section reads a single, consistent profile instead of drifting.
 */
export function useViewportProfile(): ViewportProfile {
  const [profile, setProfile] = useState(readProfile);

  useEffect(() => {
    const widthQuery = window.matchMedia(WIDE_QUERY);
    const pointerQuery = window.matchMedia(FINE_POINTER_QUERY);
    const orientationQuery = window.matchMedia(PORTRAIT_QUERY);
    const update = () => {
      setProfile((prev) => {
        const next = readProfile();
        return prev.isWide === next.isWide &&
          prev.canScrub === next.canScrub &&
          prev.isPortrait === next.isPortrait
          ? prev
          : next;
      });
    };
    update();
    widthQuery.addEventListener("change", update);
    pointerQuery.addEventListener("change", update);
    orientationQuery.addEventListener("change", update);
    // Belt and suspenders: background/embedded tabs may skip media-query
    // change events while hidden; resize catches up when the tab wakes.
    window.addEventListener("resize", update);
    return () => {
      widthQuery.removeEventListener("change", update);
      pointerQuery.removeEventListener("change", update);
      orientationQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return profile;
}
