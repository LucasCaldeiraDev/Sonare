import { Reveal } from "./Reveal";

/**
 * Teaser for the upcoming interactive demo (lights and curtains responding to
 * the visitor's touch over paired forward/reverse clips — the same mechanism
 * the journey already uses to scroll backwards).
 *
 * Deliberately spare: one pulsing point, one promise, no CTA — there is
 * nothing to click yet, and pretending otherwise would cost trust. The
 * pulsing dot is the same marker the equipment anchors use, so "live" already
 * has a visual vocabulary on this page.
 */
export function InteractiveTeaser() {
  return (
    <section aria-labelledby="interativo-title" className="border-y border-white/10 bg-sonare-coal">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-5 inline-flex items-center gap-2.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.2em] text-sonare-gold">
            <span aria-hidden="true" className="anchor-dot block h-2 w-2 rounded-full bg-sonare-gold" />
            Em breve
          </p>
          <h2
            id="interativo-title"
            className="mb-4 font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl"
          >
            Opere a casa daqui do site.
          </h2>
          <p className="m-0 text-base leading-relaxed text-sonare-silver">
            Uma suíte master respondendo ao seu toque: acenda as luzes, abra as cortinas e veja o
            ambiente mudar em tempo real — sem sair desta página.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
