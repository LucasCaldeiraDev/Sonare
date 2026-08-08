import { s110Highlights } from "../content/copy";
import { iconMap } from "./icons";

/**
 * The written spotlight on the S110. It deliberately sits AFTER the cinematic
 * journey: the crossing through the display happens inside one continuous
 * video, so nothing may interrupt it. Here the page finally stops moving and
 * explains the product in crawlable HTML.
 */
export function S110Section() {
  return (
    <section id="s110" className="relative bg-sonare-ink" aria-labelledby="s110-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-28">
        <div>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
            Display inteligente S110
          </p>
          <h2
            id="s110-title"
            className="mb-6 font-grandis text-3xl font-medium leading-tight text-sonare-white lg:text-5xl"
          >
            A casa inteira,
            <br />
            em um único ponto.
          </h2>
          <p className="mb-10 max-w-lg text-base leading-relaxed text-sonare-silver lg:text-lg">
            Instalado na parede como parte da arquitetura, o S110 concentra o controle dos
            ambientes: cenas, iluminação, som, clima e acessos — tudo respondendo na mesma
            interface, com a discrição que uma residência de alto padrão exige.
          </p>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3">
            {s110Highlights.map((item) => {
              const Icon = iconMap[item.icon];
              return (
                <div key={item.title}>
                  <dt className="mb-1.5 flex items-center gap-2 text-[0.9rem] font-bold text-sonare-white">
                    {Icon && <Icon size={16} className="text-sonare-gold" aria-hidden="true" />}
                    {item.title}
                  </dt>
                  <dd className="m-0 text-[0.85rem] leading-relaxed text-sonare-silver/85">
                    {item.description}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        <figure className="relative m-0 overflow-hidden rounded-lg border border-white/10">
          <img
            src="/media/web/s110-spotlight.webp"
            alt="Display inteligente S110 instalado na parede, exibindo a interface de controle da residência."
            className="h-auto w-full"
            width={1600}
            height={882}
            loading="lazy"
            decoding="async"
          />
          <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-10 text-[0.78rem] tracking-wide text-sonare-silver">
            S110 em instalação embutida — a interface acompanha a parede, não o contrário.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
