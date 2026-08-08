import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Stagger, in ms, applied as transition-delay on entrance only. */
  delay?: number;
  className?: string;
  /** Render element — sections pass "div" content wrappers of any kind. */
  as?: keyof HTMLElementTagNameMap;
};

/**
 * One-shot entrance for editorial content. Flips `.is-in` the first time the
 * element approaches the viewport and never removes it, so scrolling back up
 * never replays the animation. Under prefers-reduced-motion the global CSS
 * collapses the transition and content is simply present.
 */
export function Reveal({ children, delay = 0, className = "", as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    if (isIn) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsIn(true);
      },
      // Fires slightly before the element clears the fold, so the motion is
      // underway as the eye arrives instead of starting after it.
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isIn]);

  const Tag = as as "div";
  const style: CSSProperties | undefined = delay
    ? { transitionDelay: isIn ? `${delay}ms` : "0ms" }
    : undefined;

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      className={`reveal ${isIn ? "is-in" : ""} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}
