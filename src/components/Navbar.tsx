import { useEffect, useRef, useState } from "react";
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
  const [active, setActive] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy: the link whose section currently crosses the reading band gets
  // the gold tick. The band sits high (40%/55%) so the switch happens as a
  // section takes over the screen, not when it merely peeks in.
  //
  // Some linked sections (#experiencia, #solucoes) swap which component
  // renders them at a responsive breakpoint, replacing the DOM node this was
  // watching. Depending on that breakpoint here to re-run the effect was
  // tried and reverted: the swap is driven by each section's own independent
  // matchMedia/resize listener, not this one, and the two aren't guaranteed
  // to land in the same React commit — Navbar's re-query could still fire
  // before the sibling's swap, silently re-observing the node that is about
  // to be detached. A MutationObserver reacts to the DOM actually changing,
  // which is the one thing every cause of a swap has in common.
  useEffect(() => {
    let sectionObserver: IntersectionObserver | null = null;

    const attach = () => {
      sectionObserver?.disconnect();
      const sections = links
        .map((link) => document.querySelector(link.href))
        .filter((el): el is Element => el !== null);
      if (!sections.length) return;

      sectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(`#${entry.target.id}`);
          }
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
      );
      sections.forEach((el) => sectionObserver!.observe(el));
    };

    attach();

    const root = document.getElementById("inicio") ?? document.body;
    const mutationObserver = new MutationObserver(attach);
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      sectionObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  // While the panel is open, keyboard focus stays inside the header: first
  // link focused on open, Tab wraps between the toggle and the panel's last
  // item, Escape closes and returns focus to the toggle. Without this a
  // keyboard user tabs straight through into content the panel is covering.
  useEffect(() => {
    if (!menuOpen) return;
    const header = headerRef.current;
    header?.querySelector<HTMLElement>("#mobile-menu a")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !header) return;
      const focusables = header.querySelectorAll<HTMLElement>(
        'button[aria-controls="mobile-menu"], #mobile-menu a',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled || menuOpen
          ? "border-b border-white/10 bg-sonare-ink/90 backdrop-blur-md"
          // At the top the header is INVISIBLE except for its own type: no
          // background, no border, nothing.
          //
          // It used to carry a black-to-transparent scrim here, cut to 25%
          // because a 60% wash took 21% of the blue out of the night sky. But
          // any scrim over an open sky ends somewhere, and that ending is a
          // horizontal edge running the full width of the page — read as a
          // stray line across the hero, which is the first thing a visitor
          // sees. Removing it costs nothing: the nav is silver-on-dark and
          // already clears 10:1 unaided, and the type keeps its own shadow.
          : "border-b border-transparent bg-transparent [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]"
      }`}
    >
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8"
      >
        <a href="#inicio" className="flex items-center gap-3" aria-label={`${brand.name} — início`}>
          <img src="/brand/sonare-logo-dark.png" alt={brand.name} className="h-8 w-auto" width={800} height={225} />
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map((link) => {
            const isActive = active === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={isActive ? "true" : undefined}
                className={`relative py-1 text-[0.82rem] font-medium tracking-wide transition-colors ${
                  isActive ? "text-sonare-white" : "text-sonare-silver hover:text-sonare-white"
                }`}
              >
                {link.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-0.5 h-px origin-left bg-sonare-gold transition-transform duration-300 ${
                    isActive ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            );
          })}
          <a
            href="#contato"
            className="rounded-md bg-sonare-white px-4 py-2 text-[0.82rem] font-bold text-sonare-black transition-[opacity,transform] duration-300 hover:opacity-85 active:scale-[0.98]"
          >
            Agendar Visita Técnica
          </a>
        </div>

        <button
          type="button"
          ref={toggleRef}
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
        <div
          id="mobile-menu"
          className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-sonare-ink/95 backdrop-blur-md lg:hidden"
        >
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
