import { brand } from "../content/copy";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-sonare-black">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-12 sm:px-8 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <img src="/brand/sonare-logo-dark.png" alt={brand.name} className="h-9 w-auto" width={800} height={225} />
          <p className="m-0 max-w-xs text-[0.82rem] leading-relaxed text-sonare-silver/70">
            {brand.tagline}
          </p>
        </div>
        <div className="text-[0.8rem] leading-relaxed text-sonare-silver/60">
          <p className="m-0">
            {brand.hq} · Norte e Litoral de Santa Catarina
          </p>
          <p className="m-0 mt-1">
            © {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
