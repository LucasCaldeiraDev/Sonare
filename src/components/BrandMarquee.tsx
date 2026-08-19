import { brandsWorked } from "../content/copy";

/**
 * Two back-to-back copies of the same list, translated exactly -50% on loop
 * (see .brand-marquee-track in styles.css) — the seam between the copies is
 * never visible, so the strip reads as an endless line of logos.
 */
const track = [...brandsWorked, ...brandsWorked];

export function BrandMarquee() {
  return (
    <>
      {/* The scrolling strip is decorative/duplicated — the real list is the
          sr-only one below, so screen readers get it once, cleanly. */}
      <div
        className="relative overflow-hidden border-y border-white/10 bg-sonare-black py-10 sm:py-12 [-webkit-mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
        aria-hidden="true"
      >
        <div className="brand-marquee-track flex w-max items-center gap-20 will-change-transform">
          {track.map((brand, i) => (
            <div key={`${brand.name}-${i}`} className="flex h-11 shrink-0 items-center sm:h-12">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt=""
                  className="h-full w-auto object-contain opacity-80 transition-opacity duration-300 hover:opacity-100"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <span className="whitespace-nowrap font-grandis text-xl font-medium uppercase tracking-[0.14em] text-sonare-silver/55 sm:text-2xl">
                  {brand.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {brandsWorked.map((brand) => (
          <li key={brand.name}>{brand.name}</li>
        ))}
      </ul>
    </>
  );
}
