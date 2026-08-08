import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { brand } from "../content/copy";

const links = [
  { label: "Experiência", href: "#experiencia" },
  { label: "Display S110", href: "#s110" },
  { label: "Soluções", href: "#solucoes" },
  { label: "Processo", href: "#processo" },
  { label: "Contato", href: "#contato" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled || menuOpen
          ? "border-b border-white/10 bg-sonare-ink/90 backdrop-blur-md"
          // At the top the header sits directly on the night sky. A 60% black
          // wash took 21% of the blue out of that sky across the full width —
          // the stars and the skyline are the first thing the scene sells. The
          // nav is silver-on-dark and already clears 10:1 unaided, so the
          // scrim is cut to a quarter and the type carries its own shadow.
          : "border-b border-transparent bg-gradient-to-b from-black/25 to-transparent [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]"
      }`}
    >
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8"
      >
        <a href="#inicio" className="flex items-center gap-3" aria-label={`${brand.name} — início`}>
          <img src="/brand/sonare-logo-dark.png" alt={brand.name} className="h-8 w-auto" width={800} height={225} />
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.82rem] font-medium tracking-wide text-sonare-silver transition-colors hover:text-sonare-white"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contato"
            className="rounded-md bg-sonare-white px-4 py-2 text-[0.82rem] font-bold text-sonare-black transition-opacity hover:opacity-85"
          >
            Agendar Visita Técnica
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center text-sonare-white lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-white/10 bg-sonare-ink/95 backdrop-blur-md lg:hidden">
          <div className="flex flex-col px-5 py-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-white/5 py-3.5 text-[0.95rem] font-medium text-sonare-silver last:border-b-0"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contato"
              onClick={() => setMenuOpen(false)}
              className="mt-3 rounded-md bg-sonare-white px-4 py-3 text-center text-[0.9rem] font-bold text-sonare-black"
            >
              Agendar Visita Técnica
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
