import { s110Functions, s110Specs } from "../content/copy";
import { ElasticShowcase } from "./ElasticShowcase";
import { iconMap } from "./icons";
import { Reveal } from "./Reveal";

/**
 * The written spotlight on the S110. It deliberately sits AFTER the cinematic
 * journey: the crossing through the display happens inside one continuous
 * video, so nothing may interrupt it. Here the page finally stops moving and
 * explains the product in crawlable HTML.
 */
export function S110Section() {
  return (
    <section id="s110" className="relative bg-sonare-ink" aria-labelledby="s110-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16 lg:py-28">
        <div>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
            Display inteligente S110
          </p>
          <h2
            id="s110-title"
            className="mb-8 font-grandis text-3xl font-medium leading-tight text-sonare-white lg:text-5xl"
          >
            A casa inteira,
            <br />
            em um único ponto.
          </h2>

          {/* The panel's controls, laid out as the panel lays them out: icon
              over label, evenly divided, twelve of them — which is the S110's
              own button bar rendered in the page's materials. Labels are
              transcribed from the screen, so the tile needs nothing else.
              Twelve closes exactly at 3 and 4 columns: no orphan cell. */}
          <p className="m-0 mb-3 font-mono text-[0.62rem] font-medium uppercase tracking-[0.2em] text-sonare-gold">
            Tudo o que o painel comanda
          </p>
          <ul className="m-0 grid list-none grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 p-0 sm:grid-cols-4">
            {s110Functions.map((fn) => {
              const Icon = iconMap[fn.icon];
              return (
                <li
                  key={fn.title}
                  className="group flex flex-col items-center gap-2 bg-sonare-coal px-2 py-4 text-center transition-colors duration-300 hover:bg-sonare-ink"
                >
                  {Icon && (
                    <Icon
                      size={18}
                      aria-hidden="true"
                      className="text-sonare-gold transition-transform duration-300 group-hover:-translate-y-0.5"
                    />
                  )}
                  <span className="text-[0.7rem] font-medium leading-tight text-sonare-silver">
                    {fn.title}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-3 font-mono text-[0.6rem] leading-relaxed tracking-[0.04em] text-sonare-silver/45">
            Hora, data e previsão do tempo sempre à vista na tela inicial.
          </p>
        </div>

        <div>
          <figure className="relative m-0 overflow-hidden rounded-lg border border-white/10">
            {/* 1920w derivative of /media/s110-wall-4k.png. The master is a
                COMPOSITE, not a straight generation: the approved Higgsfield
                walnut-wall scene upscaled to 5K, with the client's original
                interface bitmap pasted back at native 1:1 scale into the
                measured screen rectangle — zero resampling on the UI, so every
                label is the real product's. Re-derive with ffmpeg
                scale=1920:-2:flags=lanczos if the master ever changes. */}
            <img
              src="/media/web/s110-spotlight.webp"
              alt="Display inteligente S110 instalado em parede de madeira ripada, exibindo a interface de controle da residência com hora, clima e as funções da casa."
              className="h-auto w-full"
              width={1920}
              height={1076}
              loading="lazy"
              decoding="async"
            />
            <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sonare-black/70 to-transparent px-5 pb-4 pt-10 text-[0.78rem] tracking-wide text-sonare-silver">
              S110 em instalação embutida — a interface acompanha a parede, não o contrário.
            </figcaption>
          </figure>

          {/* The pitch reads under the photograph now: the image makes the
              claim and the paragraph explains it, in that order. */}
          <p className="m-0 mt-6 max-w-xl text-base leading-relaxed text-sonare-silver lg:text-lg">
            Instalado na parede como parte da arquitetura, o S110 concentra o controle dos
            ambientes: cenas, iluminação, som, clima e acessos — tudo respondendo na mesma
            interface, com a discrição que uma residência de alto padrão exige.
          </p>
        </div>
      </div>

      {/* Manufacturer's published hardware, run full width as a technical
          strip. Eight entries, so it closes at 2 and 4 columns alike. */}
      <div className="mx-auto max-w-7xl px-6 pb-20 sm:px-8 lg:pb-28">
        <dl className="m-0 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {s110Specs.map((spec) => (
            <div key={spec.label} className="bg-sonare-coal px-5 py-4">
              <dt className="m-0 mb-1 font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-sonare-gold">
                {spec.label}
              </dt>
              <dd className="m-0 text-[0.84rem] leading-relaxed text-sonare-silver">{spec.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Equipment gallery. The A/B is settled — the elastic panels won, on
          the grounds that our photography is landscape and the fan's portrait
          cards cropped it hard. Content lives in equipmentGallery (copy.ts);
          adding gear is a data change. The fan itself is in git history if a
          portfolio section ever wants it. */}
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <Reveal>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
            Equipamentos
          </p>
          <h3 className="mb-8 max-w-xl font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl">
            As assinaturas por trás da experiência.
          </h3>
        </Reveal>
      </div>
      <div className="pb-20 lg:pb-28">
        <ElasticShowcase />
      </div>
    </section>
  );
}
