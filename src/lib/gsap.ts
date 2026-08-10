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

export { gsap, Observer, ScrollTrigger };
