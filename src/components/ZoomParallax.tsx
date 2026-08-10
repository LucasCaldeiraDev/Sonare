import { useLayoutEffect, useRef } from "react";
import { gsap } from "../lib/gsap";
import { REFRESH_ZOOM } from "../lib/scrollOrder";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * Zoom parallax over the house's own imagery, ported from the framer-motion
 * reference to the GSAP this project already ships. Deliberately NOT a new
 * dependency: the reference needed framer-motion only for scroll-scrubbed
 * scale, which ScrollTrigger does natively — and its Lenis smooth-scroll demo
 * was dropped on purpose, because a global scroll hijack would fight the
 * journey's scrub engine upstream.
 *
 * Index 0 is the FEATURED card — the S110 — which starts as the small centre
 * tile and ends filling the viewport, everything else scattering past the
 * edges around it.
 */

/**
 * THE FEATURED CARD IS SCALED DOWN, NOT UP, AND THAT IS THE WHOLE TRICK.
 *
 * The reference scales every card from 1 to N. On a photo of a SCREEN that
 * fails visibly: a composited layer is rasterised once at its layout size, so
 * a 25vw tile blown up 4x is a 480px texture stretched across 1920px, and the
 * S110's button labels — the entire point of showing the panel — turn to mush
 * while the scroll is moving. (At rest Chrome re-rasterises and it looks fine,
 * which is why a static screenshot hides the defect.)
 *
 * So the featured card is laid out at its FINAL size and animated from 1/4 to
 * 1. The visual result is identical frame for frame — 25vw at the start,
 * full-bleed at the end — but every frame is a DOWNSAMPLE of a full-resolution
 * raster, and downsampling is always sharp. The decorative cards keep the
 * cheap scale-up: they fly past the edges at speed, where nobody reads
 * anything.
 */
type Card = {
  src: string;
  alt: string;
  /** Layout box in the sticky frame. For the featured card, already final size. */
  frame: string;
  /** Scale at the end of the zoom (decorative cards) — see `from` for the featured. */
  scale: number;
  /** Featured cards animate scale from this value to 1 instead of 1 to `scale`. */
  from?: number;
};

const CARDS: Card[] = [
  {
    // 3840w derivative of the 5K master: at full bleed the labels are still
    // 2x oversampled on a 1920 viewport, so they survive a HiDPI screen too.
    src: "/media/web/s110-zoom.webp",
    alt: "Display inteligente S110 na parede de madeira ripada, com todas as funções da casa na tela.",
    frame: "h-screen w-screen",
    scale: 4,
    from: 0.25,
  },
  {
    src: "/media/web/sol-living.webp",
    alt: "Home cinema com torres Bowers & Wilkins.",
    frame: "-top-[30vh] left-[5vw] h-[30vh] w-[35vw]",
    scale: 5,
  },
  {
    src: "/media/web/sol-entrada.webp",
    alt: "Entrada da residência iluminada.",
    frame: "-top-[10vh] -left-[25vw] h-[45vh] w-[20vw]",
    scale: 6,
  },
  {
    src: "/media/web/sol-gourmet.webp",
    alt: "Área gourmet com iluminação arquitetural.",
    frame: "left-[27.5vw] h-[25vh] w-[25vw]",
    scale: 5,
  },
  {
    src: "/media/web/sol-skyline.webp",
    alt: "Cortinas abertas para o skyline noturno.",
    frame: "top-[27.5vh] left-[5vw] h-[25vh] w-[20vw]",
    scale: 6,
  },
  {
    src: "/media/web/sol-start.webp",
    alt: "Fachada noturna da residência na encosta.",
    frame: "top-[27.5vh] -left-[22.5vw] h-[25vh] w-[30vw]",
    scale: 8,
  },
  {
    src: "/media/stills/s110.webp",
    alt: "Corredor da residência com o display S110 na parede.",
    frame: "top-[22.5vh] left-[25vw] h-[15vh] w-[15vw]",
    scale: 9,
  },
];

export function ZoomParallax() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const container = containerRef.current;
    if (!container) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          // Measured after the journey above, never before it — see scrollOrder.
          refreshPriority: REFRESH_ZOOM,
        },
      });
      wrapRefs.current.forEach((el, i) => {
        if (!el) return;
        const card = CARDS[i];
        if (card.from !== undefined) {
          tl.fromTo(el, { scale: card.from }, { scale: 1, ease: "none", duration: 1 }, 0);
        } else {
          tl.to(el, { scale: card.scale, ease: "none", duration: 1 }, 0);
        }
      });
      // The payoff line, held back until the panel owns the screen.
      if (captionRef.current) {
        tl.fromTo(
          captionRef.current,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.12 },
          0.86,
        );
      }
    }, container);
    return () => ctx.revert();
  }, [reducedMotion]);

  // Reduced motion: the featured image as a plain still — no 300vh of dead
  // scroll, no zoom, nothing essential lost (the imagery repeats content the
  // page already presents in full elsewhere).
  if (reducedMotion) {
    return (
      <section aria-label="A casa em detalhe" className="bg-sonare-black">
        <img
          src={CARDS[0].src}
          alt={CARDS[0].alt}
          className="h-auto w-full"
          loading="lazy"
          decoding="async"
        />
      </section>
    );
  }

  return (
    <section aria-label="A casa em detalhe" className="bg-sonare-black">
      <div ref={containerRef} className="relative h-[300vh]">
        <div className="sticky top-0 h-screen overflow-hidden">
          {CARDS.map((card, i) => (
            <div
              key={card.src}
              ref={(el) => {
                wrapRefs.current[i] = el;
              }}
              className="absolute top-0 flex h-full w-full items-center justify-center"
            >
              <div className={`relative ${card.frame}`}>
                <img
                  src={card.src}
                  alt={card.alt}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className={`h-full w-full object-cover ${
                    card.from === undefined ? "rounded-md border border-white/10" : ""
                  }`}
                />
              </div>
            </div>
          ))}

          <div
            ref={captionRef}
            className="pointer-events-none absolute inset-x-0 bottom-[6vh] z-10 px-6 text-center opacity-0"
          >
            <p className="m-0 mb-2 font-mono text-[0.62rem] font-medium uppercase tracking-[0.2em] text-sonare-gold">
              Display S110
            </p>
            <p className="m-0 font-grandis text-xl font-medium leading-tight text-sonare-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] lg:text-3xl">
              Toda a casa em um único aparelho.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
