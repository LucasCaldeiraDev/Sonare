import { brandsWorked, serviceAreaCities } from "../content/copy";

/**
 * Brands are listed as text only — third-party logos stay out of the page
 * until official usage rights are confirmed (docs/pending-inputs.md).
 */
export function BrandsAndAreaSection() {
  return (
    <section className="border-t border-white/10 bg-sonare-ink" aria-label="Marcas e área de atendimento">
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-16 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
            Ecossistema
          </p>
          <h2 className="mb-6 font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl">
            Marcas com as quais trabalhamos.
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-x-2 gap-y-3 p-0">
            {brandsWorked.map((name) => (
              <li
                key={name}
                className="rounded-md border border-white/12 px-4 py-2 text-[0.85rem] font-medium tracking-wide text-sonare-silver"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[0.8rem] leading-relaxed text-sonare-silver/60">
            Equipamentos especificados conforme cada projeto, com fornecimento por canais oficiais.
          </p>
        </div>

        <div>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">
            Onde atendemos
          </p>
          <h2 className="mb-6 font-grandis text-2xl font-medium leading-tight text-sonare-white lg:text-3xl">
            Norte e Litoral de Santa Catarina.
          </h2>
          {/* The route, not a list: cities in their real north→south order,
              drawn as stations on one line — the same bollard-gold points the
              facade's driveway lights. The matriz gets the pulsing marker. */}
          <ol className="relative m-0 list-none p-0" aria-label="Cidades atendidas, de norte a sul">
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-[5px] top-3 w-px bg-gradient-to-b from-sonare-gold/60 via-white/20 to-sonare-gold/60"
            />
            {serviceAreaCities.map((city) => {
              const isHq = "tag" in city;
              return (
                <li key={city.name} className="relative flex items-center gap-4 py-2">
                  <span
                    aria-hidden="true"
                    className={`relative z-[1] block h-[11px] w-[11px] shrink-0 rounded-full ${
                      isHq
                        ? "anchor-dot bg-sonare-gold"
                        : "border border-sonare-gold/70 bg-sonare-ink"
                    }`}
                  />
                  <span className="text-[0.95rem] text-sonare-silver">{city.name}</span>
                  {isHq && (
                    <span className="rounded-sm border border-sonare-gold/40 px-2 py-0.5 font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-sonare-gold">
                      {city.tag}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-[0.8rem] leading-relaxed text-sonare-silver/60">
            De norte a sul — e também praias, áreas rurais, condomínios e demais cidades da
            região.
          </p>
        </div>
      </div>
    </section>
  );
}
