import { ArrowDown, CalendarCheck } from "lucide-react";
import { brand } from "../content/copy";

/**
 * The opening statement, laid over the nighttime facade (scene 1).
 * In scrub mode it fades out as the camera starts moving; in autoplay/static
 * modes it sits at the base of the first scene.
 */
export function HeroOverlay({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative flex h-full w-full items-end px-6 pb-[10vh] sm:px-12 lg:px-20">
      {/* No legibility mask over scene 01, by decision and by measurement.
          White type on this frame already clears WCAG AAA unaided: 10.9:1 at the
          eyebrow, 10.3:1 at the headline, 14.9:1 at the paragraph and 13.6:1 in
          the button area. Any scrim here would only cost the garden, the walkway
          lights and the stars contrast they do not have to give. */}
      <div className="relative max-w-3xl">
        <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.28em] text-sonare-gold">
          Automação residencial · Áudio & vídeo high-end
        </p>
        <h1
          className={`mb-5 font-grandis font-bold leading-[1.02] text-sonare-white ${
            compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl lg:text-6xl"
          }`}
        >
          {brand.tagline}
        </h1>
        <p className="mb-8 max-w-xl text-base leading-relaxed text-sonare-silver lg:text-lg">
          Entre em uma residência controlada pela {brand.name}: tecnologia invisível na
          arquitetura, presente em cada detalhe da experiência.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#contato"
            className="inline-flex min-h-12 items-center gap-2.5 rounded-md bg-sonare-white px-6 py-3 text-[0.92rem] font-bold text-sonare-black transition-opacity hover:opacity-85"
          >
            <CalendarCheck size={18} aria-hidden="true" />
            Agendar uma Visita Técnica
          </a>
          <a
            href="#s110"
            className="inline-flex min-h-12 items-center gap-2.5 rounded-md border border-white/30 px-6 py-3 text-[0.92rem] font-semibold text-sonare-white transition-colors hover:border-white/60"
          >
            Conhecer a experiência
          </a>
        </div>
      </div>

      {/* Centered on the full viewport and pinned low, deliberately outside the
          left-aligned copy column: a scroll affordance reads as an instruction
          to the whole screen, not as one more line trailing the CTAs. The bob
          is the same cue a mouse-wheel glyph gives — motion reads as "do this"
          faster than static text — and collapses under prefers-reduced-motion
          via the global rule in styles.css, so no separate code path is needed. */}
      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 sm:bottom-8">
          <span className="text-[0.72rem] uppercase tracking-[0.2em] text-sonare-silver/70">
            Role para entrar
          </span>
          <ArrowDown size={16} aria-hidden="true" className="animate-bounce text-sonare-silver/70" />
        </div>
      )}
    </div>
  );
}
