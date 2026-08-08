import { CalendarCheck } from "lucide-react";
import { brand } from "../content/copy";
const CLOSING_FRAME = "/media/stills/skyline.webp";

function ClosingContent() {
  return (
    <div className="pointer-events-auto flex flex-col items-center px-6 text-center">
      <img
        src="/brand/sonare-logo-dark.png"
        alt={brand.name}
        className="mb-8 h-12 w-auto sm:h-14"
        width={800}
        height={225}
      />
      <p className="mb-2 font-grandis text-2xl font-medium leading-tight text-sonare-white sm:text-3xl lg:text-4xl">
        {brand.tagline}
      </p>
      <p className="mb-8 max-w-md text-[0.95rem] leading-relaxed text-sonare-silver">
        A próxima residência com essa experiência pode ser a sua.
      </p>
      <a
        href="#contato"
        className="inline-flex min-h-12 items-center gap-2.5 rounded-md bg-sonare-white px-7 py-3 text-[0.95rem] font-bold text-sonare-black transition-opacity hover:opacity-85"
      >
        <CalendarCheck size={18} aria-hidden="true" />
        Agendar uma Visita Técnica
      </a>
    </div>
  );
}

/** Brand close over the held final frame inside the pinned chapter (desktop scrub). */
export function ClosingOverlay() {
  return <ClosingContent />;
}

/** Brand close as a normal section over the skyline end frame (autoplay/static modes). */
export function ClosingSection() {
  return (
    <section className="relative flex min-h-[80svh] items-center justify-center overflow-hidden bg-sonare-black">
      <img
        src={CLOSING_FRAME}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        loading="lazy"
        decoding="async"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 py-20">
        <ClosingContent />
      </div>
    </section>
  );
}
