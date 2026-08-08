import { MapPin } from "lucide-react";
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
          <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0">
            {serviceAreaCities.map((city) => (
              <li key={city} className="flex items-center gap-2.5 text-[0.95rem] text-sonare-silver">
                <MapPin size={15} className="shrink-0 text-sonare-gold" aria-hidden="true" />
                {city}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[0.8rem] leading-relaxed text-sonare-silver/60">
            Atendemos também praias, áreas rurais, condomínios e demais cidades da região.
          </p>
        </div>
      </div>
    </section>
  );
}
