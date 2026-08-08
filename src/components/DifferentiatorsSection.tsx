import { differentiators, process } from "../content/copy";

/**
 * The single light band of the page: authority (differentiators) and the
 * consultative process, presented with editorial restraint.
 */
export function DifferentiatorsSection() {
  return (
    <section id="processo" className="bg-sonare-white text-sonare-black" aria-labelledby="processo-title">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold-deep">
              Por que a Sonare
            </p>
            <h2 id="processo-title" className="mb-10 font-grandis text-3xl font-medium leading-tight lg:text-4xl">
              Engenharia por trás do conforto.
            </h2>
            <dl className="m-0 grid gap-8">
              {differentiators.map((item) => (
                <div key={item.title} className="border-l-2 border-sonare-gold pl-5">
                  <dt className="mb-1 text-[1.02rem] font-bold">{item.title}</dt>
                  <dd className="m-0 text-[0.92rem] leading-relaxed text-black/65">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold-deep">
              Como trabalhamos
            </p>
            <h3 className="mb-10 font-grandis text-3xl font-medium leading-tight lg:text-4xl">
              Do projeto à entrega, sem ruído.
            </h3>
            <ol className="m-0 grid list-none gap-0 p-0">
              {process.map((stage, i) => (
                <li
                  key={stage.step}
                  className={`grid grid-cols-[auto_1fr] items-start gap-5 py-6 ${
                    i < process.length - 1 ? "border-b border-black/10" : ""
                  }`}
                >
                  <span className="font-grandis text-2xl font-bold text-sonare-gold-deep" aria-hidden="true">
                    {stage.step}
                  </span>
                  <div>
                    <h4 className="mb-1 text-[1.02rem] font-bold">{stage.title}</h4>
                    <p className="m-0 text-[0.92rem] leading-relaxed text-black/65">{stage.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
