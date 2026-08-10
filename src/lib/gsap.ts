import gsap from "gsap";
import { Observer } from "gsap/Observer";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.registerPlugin(Observer, ScrollTrigger, ScrollToPlugin);

// Pages loaded in background tabs (or embedded panes) can miss the initial
// layout pass: rAF doesn't tick and pinned triggers keep zeroed measurements.
// Recalculate whenever the document becomes visible again.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      ScrollTrigger.refresh();
    }
  });
}

/**
 * A handle on the triggers from the console, for diagnosing a stale measurement
 * while it is actually happening.
 *
 * The failure this exists for cannot be caught after the fact: a trigger whose
 * start and end were computed before a pin above it existed looks completely
 * normal in the DOM — the section is there, the sticky is there, the images are
 * there — and only its own numbers give it away. Reproducing it takes losing a
 * mount-order race, which no amount of scripted reloading here managed to do.
 *
 * `__ST.getAll().map(t => [t.trigger?.id || t.trigger?.className, t.start, t.end])`
 * printed at the moment of the bug says immediately whether a trigger is
 * pointing at the wrong part of the document.
 *
 * import.meta.env.DEV is substituted at build time, so this whole statement is
 * dropped from a production bundle.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __ST?: typeof ScrollTrigger }).__ST = ScrollTrigger;
}

export { gsap, Observer, ScrollTrigger };
