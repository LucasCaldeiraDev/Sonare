/**
 * The order in which pinned ScrollTriggers must re-measure, in one place.
 *
 * THE FAILURE THIS PREVENTS. A pinned trigger inserts a spacer as tall as its
 * runway — 24.668 px for the journey on a 900 px desktop — which moves every
 * section below it that far down the document. A trigger that measured its own
 * start and end BEFORE that spacer existed is left pointing 24.668 px too early,
 * so by the time the visitor physically arrives the scroll is already past its
 * end and the animation reads as having been skipped: for ZoomParallax that
 * looks exactly like landing on the final frame with the S110 already
 * full-screen, never having seen it grow.
 *
 * WHY IT IS INTERMITTENT, AND WHY POSITION IS NOT ENOUGH. ScrollTrigger does
 * sort its refreshes by document position on its own, but it sorts on `_sortY`
 * — a position that is itself a measurement, and therefore itself capable of
 * being stale. Creation order decides which measurements exist first, and React
 * StrictMode invokes every effect twice (mount, clean up, mount again), so the
 * window in which the journey's spacer is absent while something below it
 * measures opens and closes depending on how quickly each subtree remounts.
 * That is a race, which is why the same build shows the bug on one load and not
 * the next.
 *
 * refreshPriority overrides the sort with an explicit number: higher refreshes
 * FIRST. Numbering these in document order makes the sequence a property of the
 * code rather than of whichever effect happened to win.
 *
 * KEEP THESE IN DOCUMENT ORDER. If a pinned section is ever added between two
 * of them, renumber — the values carry no meaning beyond their order.
 */

/** The journey. First on the page, longest runway, displaces everything below. */
export const REFRESH_JOURNEY = 3;
/** The S110 zoom, immediately after the journey. */
export const REFRESH_ZOOM = 2;
/** The pinned solutions rail, further down and pinned in its turn. */
export const REFRESH_SOLUTIONS = 1;
