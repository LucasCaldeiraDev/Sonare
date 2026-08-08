import { solutions } from "../content/copy";
import { iconMap } from "./icons";
import { SectionHeading } from "./SectionHeading";

export function SolutionsSection() {
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
