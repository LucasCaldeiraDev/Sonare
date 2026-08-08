import type { ReactNode } from "react";
import type { Overlay, Segment } from "../content/timeline";

type Props = {
  id?: string;
  segments: Segment[];
  overlays: Overlay[];
  closing?: ReactNode;
  hero?: ReactNode;
};

const ALT: Record<string, string> = {
  fachada:
    "Fachada noturna de uma residência contemporânea de alto padrão, com iluminação arquitetural e a cidade ao fundo.",
  living:
    "Living com home theater ativo: telão com projeção noturna da cidade, caixas de piso Bowers & Wilkins e projetor no teto.",
  s110: "Corredor da residência com o display inteligente S110 instalado na parede.",
  gourmet:
    "Área gourmet com o display S110 na parede, cortinas automatizadas e a vista noturna da cidade.",
};

/**
 * prefers-reduced-motion: the journey as stills, with every caption promoted to
 * permanent text. No video elements, no pinning, no autoplay.
 */
export function SegmentStills({ id, segments, overlays, closing, hero }: Props) {
  return (
    <div id={id} className="bg-sonare-black">
      {segments.map((seg, i) => {
        const mine = overlays.filter(
          (o) => o.globalStart < seg.globalEnd && o.globalEnd > seg.globalStart,
        );
        const narrative = mine.filter((o) => o.kind === "narrative");
        const equipment = mine.filter((o) => o.kind === "equipment");

        return (
          <section key={seg.id} className="relative w-full overflow-hidden">
            <img
              src={`/media/stills/${seg.id}.webp`}
              alt={ALT[seg.id] ?? ""}
              className="h-auto w-full"
              width={1920}
              height={1058}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />

            {i === 0 && hero && (
              <div className="absolute inset-0 z-10 flex items-end bg-gradient-to-t from-black/75 via-black/25 to-transparent">
                {hero}
              </div>
            )}

            {mine.length > 0 && (
              <div className="border-b border-white/10 bg-sonare-ink px-6 py-10 sm:px-12 lg:px-20">
                <div className={`grid gap-10 ${narrative.length > 0 ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
                  {narrative.length > 0 && (
                    <div className="grid gap-8">
                      {narrative.map((o) => (
                        <div key={o.id} className="max-w-xl">
                          {o.eyebrow && (
                            <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-sonare-gold">
                              {o.eyebrow}
                            </p>
                          )}
                          <h2 className="mb-3 font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl">
                            {o.title}
                          </h2>
                          <p className="text-base leading-relaxed text-sonare-silver">{o.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {equipment.length > 0 && (
                    <dl className="m-0 grid gap-5 self-start">
                      {equipment.map((o) => (
                        <div key={o.id} className="border-l-2 border-sonare-gold pl-4">
                          <p className="m-0 mb-1 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-sonare-gold">
                            {o.equipment ?? o.eyebrow}
                          </p>
                          <dt className="text-[0.95rem] font-bold text-sonare-white">{o.title}</dt>
                          <dd className="m-0 mt-1 text-[0.85rem] leading-relaxed text-sonare-silver/85">
                            {o.description}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
      {closing}
    </div>
  );
}
