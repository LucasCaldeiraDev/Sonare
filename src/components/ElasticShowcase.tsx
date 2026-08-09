import { useState } from "react";
import { equipmentGallery } from "../content/copy";

/**
 * Estudo B — the elastic accordion. Ported from the reference to this stack:
 * plain <img> instead of next/image, template literals instead of cn(), the
 * page's palette and voices instead of the reference's neutrals, and the
 * "view project" CTA dropped — there is nowhere to go yet, and the panel's
 * description does the informational work instead.
 *
 * The panels are BLACK CARDS, not photographs: at rest each shows the image
 * as a band across its top and holds the rest in black under the vertical
 * title, and choosing one grows that band down until the photograph owns the
 * whole card. Two things follow from it — the row reads as a set of objects
 * rather than a wall of competing images, and the selected item is the only
 * one carrying a full picture, which is exactly where the eye should be.
 *
 * The band's height is a function of DISTANCE from the selection: the panels
 * out at the ends keep the tallest crop and the ones flanking the selection
 * the shortest, so the row visibly opens away from whatever is chosen instead
 * of stepping down uniformly.
 *
 * Everything animates in CSS, so prefers-reduced-motion collapses it globally
 * — the panels simply resize instantly.
 */

const EASE = "cubic-bezier(0.25,1,0.5,1)";

/** Percent of the card's height the photo band occupies when not selected. */
function bandHeight(distance: number) {
  return Math.min(58, 22 + (distance - 1) * 12);
}

export function ElasticShowcase() {
  const items = equipmentGallery.slice(0, 5);
  const [activeId, setActiveId] = useState<string>(items[0].id);
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );

  return (
    <div className="mx-auto flex h-[460px] w-full max-w-[104rem] flex-col gap-2 px-4 md:h-[680px] md:flex-row md:gap-3 md:px-8">
      {items.map((item, i) => {
        const active = i === activeIndex;
        const band = active ? 100 : bandHeight(Math.abs(i - activeIndex));
        return (
          <div
            key={item.id}
            onMouseEnter={() => setActiveId(item.id)}
            onClick={() => setActiveId(item.id)}
            className={`relative cursor-pointer overflow-hidden rounded-lg border bg-sonare-black transition-[flex] duration-700 ${
              active ? "flex-[4] border-sonare-gold/25" : "flex-[1] border-white/10 hover:border-white/25"
            }`}
            style={{ transitionTimingFunction: EASE }}
          >
            {/* The photo band. Absolutely positioned, so growing it never
                reflows the row — only this card repaints. */}
            <div
              className="absolute inset-x-0 top-0 overflow-hidden transition-[height] duration-700"
              style={{ height: `${band}%`, transitionTimingFunction: EASE }}
            >
              <img
                src={item.image}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                draggable={false}
                className={`h-full w-full object-cover transition-[filter,transform] duration-700 ${
                  active ? "scale-100 brightness-100" : "scale-105 brightness-[0.72]"
                }`}
                style={{ transitionTimingFunction: EASE }}
              />
              {/* Feathers the photo into the black card below it — and, on the
                  selected panel, into the copy sitting over its lower third. */}
              <div
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-sonare-black to-transparent transition-[height] duration-700 ${
                  active ? "h-2/5 via-sonare-black/40" : "h-1/3"
                }`}
                style={{ transitionTimingFunction: EASE }}
              />
            </div>

            {/* Selected: the full record, over the photo's lower third. */}
            <div
              className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 transition-all duration-500 md:p-7 ${
                active ? "translate-y-0 opacity-100 delay-200" : "pointer-events-none translate-y-10 opacity-0"
              }`}
            >
              <span className="self-start rounded-sm border border-sonare-gold/40 bg-sonare-black/50 px-2.5 py-1 font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-sonare-gold backdrop-blur-md">
                {item.category}
              </span>
              <h4 className="m-0 font-grandis text-xl font-medium leading-tight text-sonare-white md:text-3xl">
                {item.title}
              </h4>
              <p className="m-0 max-w-md text-[0.85rem] leading-relaxed text-sonare-silver md:text-[0.92rem]">
                {item.description}
              </p>
            </div>

            {/* Idle: the name, standing in the black below the band. */}
            <div
              className={`absolute inset-x-0 bottom-0 flex items-center justify-center transition-all duration-700 ${
                active ? "scale-90 opacity-0" : "opacity-100 delay-300"
              }`}
              style={{ top: `${band}%`, transitionTimingFunction: EASE }}
            >
              <span className="hidden whitespace-nowrap px-2 font-grandis text-base font-medium uppercase tracking-widest text-sonare-white/85 [writing-mode:vertical-rl] md:block">
                {item.title}
              </span>
              <span className="block px-4 font-mono text-[0.62rem] font-medium uppercase tracking-[0.16em] text-sonare-white/85 md:hidden">
                {item.title}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
