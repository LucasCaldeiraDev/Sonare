import { useEffect, useState, type RefObject } from "react";

/**
 * Flips to true once, when the element first comes within `rootMargin` of the
 * viewport, and never resets. Used to defer mounting a scene's <video> (and
 * therefore its network request) until it is about to be needed, without
 * reloading/flashing it if the user scrolls back past it later.
 */
export function useIsNearViewport(ref: RefObject<Element | null>, rootMargin = "60% 0px"): boolean {
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, isNear, rootMargin]);

  return isNear;
}
