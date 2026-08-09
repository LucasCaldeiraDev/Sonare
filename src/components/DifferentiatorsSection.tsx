import { useLayoutEffect, useRef } from "react";
import { gsap } from "../lib/gsap";
import { differentiators, process } from "../content/copy";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * The single light band of the page: authority (differentiators) and the
 * consultative process, presented with editorial restraint.
 *
 * The process is the one piece of content on the page that truly IS a
 * sequence, so it carries the sequence instrument: a horizontal spine that
 * fills with gold as the band scrolls through view — the light-band twin of
 * the journey rail and the solutions deck's progress line.
 */
export function DifferentiatorsSection() {
  const bandRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const band = bandRef.current;
    const fill = fillRef.current;
    if (!band || !fill) return;
    if (reducedMotion) {
      fill.style.transform = "scaleX(1)";
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        fill,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: band,
            start: "top 78%",
            end: "bottom 45%",
            scrub: 0.4,
          },
        },
      );
    }, band);
    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section id="processo" className="bg-sonare-white text-sonare-black" aria-labelledby="processo-title">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div>
            <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold-deep">
              Por que a Sonare
            </p>
            <h2 id="processo-title" className="m-0 font-grandis text-3xl font-medium leading-tight lg:text-4xl">
              Engenharia por trás do conforto.
            </h2>
          </div>
          <dl className="m-0 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {differentiators.map((item) => (
              <div key={item.title} className="border-l-2 border-sonare-gold pl-5">
                <dt className="mb-1 text-[1.02rem] font-bold">{item.title}</dt>
                <dd className="m-0 text-[0.92rem] leading-relaxed text-black/65">{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div ref={bandRef} className="mt-16 lg:mt-24">
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold-deep">
            Como trabalhamos
          </p>
          <h3 className="mb-12 font-grandis text-3xl font-medium leading-tight lg:text-4xl">
            Do projeto à entrega, sem ruído.
          </h3>

          <div className="relative">
            {/* The spine: one line for the whole process, gold as far as the
                page has come. Hidden on narrow viewports, where the steps
                stack and the sequence is carried by the numbers alone. */}
            <div aria-hidden="true" className="absolute left-0 right-0 top-[6px] hidden h-px bg-black/12 sm:block">
              <div
                ref={fillRef}
                className="h-full origin-left bg-sonare-gold-deep"
                style={{ transform: "scaleX(0)" }}
              />
            </div>

            <ol className="m-0 grid list-none gap-10 p-0 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
              {process.map((stage) => (
                <li key={stage.step} className="relative sm:pt-9">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 hidden h-[13px] w-[13px] rounded-full border-2 border-sonare-gold-deep bg-sonare-white sm:block"
                  />
                  <p aria-hidden="true" className="m-0 mb-2 font-mono text-[0.68rem] font-medium tracking-[0.18em] text-sonare-gold-deep">
                    {stage.step}
                  </p>
                  <h4 className="mb-1.5 text-[1.02rem] font-bold">{stage.title}</h4>
                  <p className="m-0 text-[0.92rem] leading-relaxed text-black/65">{stage.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
