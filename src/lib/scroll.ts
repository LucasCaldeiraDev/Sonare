/**
 * Scroll the window to a position NOW, on every browser.
 *
 * The base stylesheet gives <html> `scroll-behavior: smooth` for anchor
 * links, so a bare scrollTo inherits it and animates. `behavior: "instant"`
 * opts a single call out of that — but it joined the ScrollBehavior enum
 * late (Safari 15.4, March 2022), and a WebIDL enum rejects an unknown value
 * with a TypeError rather than ignoring it. On an older Safari the call
 * throws, and inside a ticker callback that would take the whole tick down.
 * So: try the modern form, and on a throw fall back to switching the
 * stylesheet's behaviour off for the one call.
 */
export function scrollInstant(top: number) {
  try {
    window.scrollTo({ top, behavior: "instant" });
  } catch {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, top);
    root.style.scrollBehavior = previous;
  }
}
