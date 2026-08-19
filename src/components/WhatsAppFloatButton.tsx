import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { buildWhatsappDirectUrl } from "../lib/whatsapp";

/**
 * Floating WhatsApp shortcut. Hidden through the cinematic opening, then
 * appears once the S110 section (#s110) is reached and stays on screen for
 * the rest of the page — that's the point a visitor is deep enough in to
 * plausibly want a direct question answered, and every section after it
 * (solutions, brands, contact) should keep the option available.
 */
export function WhatsAppFloatButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("s110");
    if (!target) return;

    /**
     * A plain scroll listener, not IntersectionObserver: that API only
     * reports *crossings*, so a fast jump (End key, dragged scrollbar,
     * anchor link) can skip clean over the "entering #s110" frame and leave
     * the button stuck in its previous state. Recomputing the element's
     * actual position on every scroll is what stays correct regardless of
     * how the scroll happened.
     */
    let ticking = false;
    const recompute = () => {
      ticking = false;
      setVisible(target.getBoundingClientRect().top <= window.innerHeight);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <a
      href={buildWhatsappDirectUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 transition-all duration-300 hover:bg-[#20BD5B] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <MessageCircle size={26} aria-hidden="true" />
    </a>
  );
}
