import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { gsap, ScrollTrigger } from "../lib/gsap";
import { REFRESH_SOLUTIONS } from "../lib/scrollOrder";
import { solutions } from "../content/copy";
import { iconMap } from "./icons";
import { SectionHeading } from "./SectionHeading";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { useViewportProfile } from "../hooks/useViewportProfile";

/**
 * Scroll runway per step of the deck, as a fraction of the viewport height.
 * Short enough that flicking through all eight reads as browsing, long enough
 * that each snap has room to breathe.
 */
const STEP_VH = 0.55;

/**
 * The deck: one pinned viewport, scroll advances through the solutions.
 *
 * Deliberately speaks the same two languages as the film above it — the
 * system voice (mono numerals, the gold progress spine borrowed from the
 * SystemRail) and the film's own caption grammar (title over the image's
 * lower-left corner, legibility gradient, gold mono eyebrow). The images ARE
 * the journey: frames of the footage the visitor just travelled through,
 * swappable per solution in copy.ts as dedicated photography arrives.
 *
 * GSAP owns opacity/transform of the slides; CSS transitions here are
 * confined to colors on the index — the same division of labour the
 * overlay cards follow.
 */
function SolutionsDeck() {
  const sectionRef = useRef<HTMLElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const count = solutions.length;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      slideRefs.current.forEach((el, i) => {
        if (el) gsap.set(el, { autoAlpha: i === 0 ? 1 : 0, xPercent: i === 0 ? 0 : 100 });
      });

      /**
       * Horizontal hand-off: scrolling DOWN, the next solution slides in from
       * the right and covers the current one, which drifts a little left
       * underneath — film-strip motion, mirrored when scrolling back up.
       * The incoming slide enters opaque (a cover, not a blend) so two
       * photographs never mix; z-order makes the incoming pane the top one.
       */
      const show = (idx: number) => {
        const prev = activeRef.current;
        if (idx === prev) return;
        const dir = idx > prev ? 1 : -1;
        const out = slideRefs.current[prev];
        const inn = slideRefs.current[idx];
        activeRef.current = idx;
        setActive(idx);
        if (out) {
          gsap.set(out, { zIndex: 1 });
          gsap.to(out, {
            xPercent: -24 * dir,
            autoAlpha: 0,
            duration: 0.55,
            ease: "power2.inOut",
            overwrite: "auto",
          });
        }
        if (inn) {
          gsap.set(inn, { zIndex: 2 });
          gsap.fromTo(
            inn,
            { autoAlpha: 1, xPercent: 100 * dir },
            { xPercent: 0, duration: 0.62, ease: "power3.out", overwrite: "auto" },
          );
          const caption = inn.querySelector("[data-caption]");
          if (caption) {
            gsap.fromTo(
              caption,
              { x: 46 * dir, autoAlpha: 0 },
              { x: 0, autoAlpha: 1, duration: 0.5, ease: "power2.out", delay: 0.14, overwrite: "auto" },
            );
          }
        }
      };

      triggerRef.current = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () =>
          `+=${Math.round((count - 1) * STEP_VH * window.innerHeight) + Math.round(window.innerHeight * 0.25)}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        // Pinned in its turn, so it displaces what follows — see scrollOrder.
        refreshPriority: REFRESH_SOLUTIONS,
        snap: {
          snapTo: 1 / (count - 1),
          duration: { min: 0.15, max: 0.45 },
          ease: "power1.inOut",
        },
        onUpdate: (self) => {
          if (fillRef.current) fillRef.current.style.transform = `scaleX(${self.progress})`;
          show(Math.round(self.progress * (count - 1)));
        },
      });
    }, section);

    return () => {
      triggerRef.current = null;
      ctx.revert();
    };
  }, [count]);

  /** A click travels through the same scroll pipeline as a gesture. */
  const goTo = (i: number) => {
    const st = triggerRef.current;
    if (!st) return;
    const y = st.start + ((st.end - st.start) * i) / (count - 1);
    gsap.to(window, { scrollTo: y, duration: 0.9, ease: "power2.inOut", overwrite: "auto" });
  };

  return (
    <section
      ref={sectionRef}
      id="solucoes"
      aria-labelledby="solucoes-title"
      className="relative flex h-svh flex-col overflow-hidden bg-sonare-black"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pb-8 pt-24 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="m-0 mb-3 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
              Soluções
            </p>
            <h2
              id="solucoes-title"
              className="m-0 font-grandis text-3xl font-medium leading-tight text-sonare-white lg:text-4xl"
            >
              Automação completa, tecnologia discreta.
            </h2>
          </div>
          <p
            aria-hidden="true"
            className="m-0 shrink-0 font-mono text-[0.72rem] tracking-[0.08em] text-sonare-silver/70 tabular-nums"
          >
            {String(active + 1).padStart(2, "0")}
            <span className="text-sonare-silver/40"> / {String(count).padStart(2, "0")}</span>
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-sonare-ink">
            {solutions.map((s, i) => {
              const Icon = iconMap[s.icon];
              return (
                <div
                  key={s.title}
                  ref={(el) => {
                    slideRefs.current[i] = el;
                  }}
                  aria-hidden={i !== active}
                  className="absolute inset-0"
                >
                  <img
                    src={s.image}
                    alt=""
                    className="h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                  />
                  {/* Same legibility treatment the film's captions carry:
                      local gradient, confined to where the text lives. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-sonare-black/85 via-sonare-black/30 to-transparent"
                  />
                  <div data-caption className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
                    <p className="m-0 mb-2 flex items-center gap-2 font-mono text-[0.62rem] font-medium uppercase tracking-[0.16em] text-sonare-gold">
                      {Icon && <Icon size={13} aria-hidden="true" />}
                      Solução {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="m-0 mb-2.5 max-w-xl font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl">
                      {s.title}
                    </h3>
                    <p className="m-0 max-w-lg text-[0.95rem] leading-relaxed text-sonare-silver">
                      {s.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The filmstrip: the journey rail laid on its side. One horizontal
              spine for the whole deck, gold as far as you've come, with the
              eight stops beneath it — scroll runs the strip right-to-left,
              exactly like the slides above it. */}
          <nav aria-label="Navegar pelas soluções" className="mt-6">
            <div aria-hidden="true" className="relative mb-4 h-px w-full overflow-hidden bg-white/15">
              <div
                ref={fillRef}
                className="absolute inset-y-0 left-0 w-full origin-left bg-sonare-gold"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              {solutions.map((s, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Ir para ${s.title}`}
                    aria-current={isActive ? "true" : undefined}
                    className="group flex min-w-0 flex-col items-start gap-1 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`font-mono text-[0.62rem] tabular-nums transition-colors duration-300 ${
                        isActive
                          ? "text-sonare-gold"
                          : "text-sonare-silver/40 group-hover:text-sonare-silver/70"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`hidden max-w-[8.5rem] text-[0.7rem] font-medium leading-snug transition-colors duration-300 xl:block ${
                        isActive
                          ? "text-sonare-white"
                          : "text-sonare-silver/50 group-hover:text-sonare-silver"
                      }`}
                    >
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <p
              aria-hidden="true"
              className="mt-4 flex items-center justify-end gap-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-sonare-silver/50"
            >
              <ArrowDown size={12} aria-hidden="true" />
              Role para percorrer as soluções
            </p>
          </nav>
        </div>
      </div>
    </section>
  );
}

/** The plain grid: touch, narrow viewports and prefers-reduced-motion. */
function SolutionsGrid() {
  return (
    <section id="solucoes" className="bg-sonare-black" aria-labelledby="solucoes-title">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Soluções"
          title="Automação completa, tecnologia discreta."
          description="Cada sistema é projetado para desaparecer na arquitetura e aparecer na experiência — do som ambiente ao aquecimento de piso."
        />
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {solutions.map((solution) => {
            const Icon = iconMap[solution.icon];
            return (
              <article key={solution.title} className="bg-sonare-black p-7 transition-colors hover:bg-sonare-ink">
                {Icon && <Icon size={22} className="text-sonare-gold" aria-hidden="true" />}
                <h3 className="mb-2 mt-5 text-[1.02rem] font-bold text-sonare-white">{solution.title}</h3>
                <p className="m-0 text-[0.88rem] leading-relaxed text-sonare-silver/85">{solution.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SolutionsSection() {
  const reducedMotion = usePrefersReducedMotion();
  const { canScrub } = useViewportProfile();

  if (!reducedMotion && canScrub) return <SolutionsDeck />;
  return <SolutionsGrid />;
}
