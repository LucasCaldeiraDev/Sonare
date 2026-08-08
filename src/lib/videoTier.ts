export type VideoTier = "mobile" | "hd" | "uhd";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/** Below this CSS width a desktop stays on the 1920w derivative. */
const UHD_MIN_CSS_WIDTH = 1440;
/** Any viewport with at least this many physical pixels gets 4K regardless of pointer type. */
const UHD_MIN_PHYSICAL_WIDTH = 2560;

/**
 * Decides which derivative a <video> should point to BEFORE the element is
 * created, so the browser only ever downloads one file per scene:
 *
 * - touch / narrow viewport                     → 960w  ("mobile")
 * - desktop under 1440 CSS px                   → 1920w ("hd")
 * - desktop, fine pointer, ≥1440 CSS px         → 3840w ("uhd")
 * - any viewport ≥2560 physical px              → 3840w ("uhd")
 *
 * The 1440 CSS-px rule intentionally serves 4K to ordinary 1080p monitors at
 * devicePixelRatio 1. Letting the browser downscale 3840→1920 is supersampling:
 * it keeps far more detail in foliage, stonework, light falloff and the night
 * skyline than a natively-encoded 1920 file does.
 *
 * Data-saver and constrained connections cap the tier at "hd".
 * The result is read once per mount — it never flips the src of a video that
 * already started fetching.
 */
export function resolveVideoTier(wide: boolean): VideoTier {
  if (!wide) return "mobile";
  if (typeof window === "undefined") return "hd";

  const connection = (navigator as { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return "hd";
  if (connection?.effectiveType && /(^|-)2g|3g/.test(connection.effectiveType)) return "hd";

  const cssWidth = window.innerWidth;
  const physicalWidth = cssWidth * (window.devicePixelRatio || 1);
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (physicalWidth >= UHD_MIN_PHYSICAL_WIDTH) return "uhd";
  if (finePointer && cssWidth >= UHD_MIN_CSS_WIDTH) return "uhd";
  return "hd";
}
