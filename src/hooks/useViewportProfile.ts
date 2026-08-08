import { useEffect, useState } from "react";

export type ViewportProfile = {
  /** Wide enough to warrant the sharper desktop-resolution video/poster assets. */
  isWide: boolean;
  /** Wide viewport with a precise pointer: eligible for pinned scroll-scrub narrative. */
  canScrub: boolean;
};

const WIDE_QUERY = "(min-width: 900px)";
const FINE_POINTER_QUERY = "(pointer: fine)";

function readProfile(): ViewportProfile {
  if (typeof window === "undefined") {
    return { isWide: false, canScrub: false };
  }
  const isWide = window.matchMedia(WIDE_QUERY).matches;
  const canScrub = isWide && window.matchMedia(FINE_POINTER_QUERY).matches;
  return { isWide, canScrub };
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
    const update = () => {
      setProfile((prev) => {
        const next = readProfile();
        return prev.isWide === next.isWide && prev.canScrub === next.canScrub ? prev : next;
      });
    };
    update();
    widthQuery.addEventListener("change", update);
    pointerQuery.addEventListener("change", update);
    // Belt and suspenders: background/embedded tabs may skip media-query
    // change events while hidden; resize catches up when the tab wakes.
    window.addEventListener("resize", update);
    return () => {
      widthQuery.removeEventListener("change", update);
      pointerQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return profile;
}
