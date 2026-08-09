import { useState, type FormEvent } from "react";
import { AtSign, Clock, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { brand, projectTypes } from "../content/copy";
import { buildWhatsappLeadUrl } from "../lib/whatsapp";

const inputClasses =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-4 py-3 text-[0.95rem] text-sonare-white placeholder:text-sonare-silver/60 focus:border-sonare-gold focus:outline-none";

/**
 * Lead capture without a backend: the form composes a pre-filled WhatsApp
 * message and opens the conversation — the confirmed channel for the brand.
 */
export function ContactSection() {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [projectType, setProjectType] = useState<string>(projectTypes[0]);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !whatsapp.trim()) {
      setFeedback("Preencha ao menos nome e WhatsApp para continuar.");
      return;
    }
    setFeedback(null);
    const url = buildWhatsappLeadUrl({
      name: name.trim(),
      whatsapp: whatsapp.trim(),
      email: email.trim(),
      city: city.trim(),
      projectType,
      message: message.trim(),
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setFeedback("Abrimos a conversa no WhatsApp com seus dados preenchidos.");
  };

  return (
    <section id="contato" className="bg-sonare-black" aria-labelledby="contato-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-28">
        <div>
          <p className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-sonare-gold">Contato</p>
          <h2
            id="contato-title"
            className="mb-6 font-grandis text-3xl font-medium leading-tight text-sonare-white lg:text-4xl"
          >
            Agende uma visita técnica.
          </h2>
          <p className="mb-10 max-w-md text-base leading-relaxed text-sonare-silver">
            Conte um pouco sobre o seu projeto. Nossa equipe faz uma avaliação consultiva do
            ambiente e apresenta o caminho ideal para a automação da sua residência.
          </p>

          <ul className="m-0 grid list-none gap-5 p-0 text-[0.95rem] text-sonare-silver">
            <li className="flex items-center gap-3">
              <MessageCircle size={18} className="shrink-0 text-sonare-gold" aria-hidden="true" />
              <a href={`https://wa.me/${brand.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="hover:text-sonare-white">
                WhatsApp {brand.whatsappDisplay}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail size={18} className="shrink-0 text-sonare-gold" aria-hidden="true" />
              <a href={`mailto:${brand.email}`} className="hover:text-sonare-white">
                {brand.email}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <AtSign size={18} className="shrink-0 text-sonare-gold" aria-hidden="true" />
              <a href={brand.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-sonare-white">
                Instagram {brand.instagramHandle}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Clock size={18} className="shrink-0 text-sonare-gold" aria-hidden="true" />
              <span>
                {brand.hours} · {brand.hq}
              </span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-white/10 bg-sonare-ink p-6 sm:p-8" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="lead-name" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                Nome*
              </label>
              <input
                id="lead-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClasses}
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label htmlFor="lead-whatsapp" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                WhatsApp*
              </label>
              <input
                id="lead-whatsapp"
                name="whatsapp"
                type="tel"
                autoComplete="tel"
                required
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                className={inputClasses}
                placeholder="(47) 9 0000-0000"
              />
            </div>
            <div>
              <label htmlFor="lead-email" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                E-mail
              </label>
              <input
                id="lead-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClasses}
                placeholder="voce@email.com"
              />
            </div>
            <div>
              <label htmlFor="lead-city" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                Cidade
              </label>
              <input
                id="lead-city"
                name="city"
                type="text"
                autoComplete="address-level2"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className={inputClasses}
                placeholder="Sua cidade"
              />
            </div>
            <div>
              <label htmlFor="lead-project" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                Tipo de projeto
              </label>
              <select
                id="lead-project"
                name="projectType"
                value={projectType}
                onChange={(event) => setProjectType(event.target.value)}
                className={`${inputClasses} appearance-none`}
              >
                {projectTypes.map((type) => (
                  <option key={type} value={type} className="bg-sonare-ink">
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lead-message" className="mb-1.5 block text-[0.82rem] font-semibold text-sonare-silver">
                Mensagem (opcional)
              </label>
              <textarea
                id="lead-message"
                name="message"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className={`${inputClasses} resize-y`}
                placeholder="Conte sobre o seu projeto"
              />
            </div>
          </div>

          {/* The strongest trust signal the brand has, sealed right where the
              decision happens — not buried in a card three sections up. */}
          <div className="mt-6 flex items-start gap-3 rounded-md border border-sonare-gold/25 bg-sonare-gold/[0.06] px-4 py-3.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-sonare-gold" aria-hidden="true" />
            <p className="m-0 text-[0.82rem] leading-relaxed text-sonare-silver">
              <span className="font-bold text-sonare-white">Engenharia registrada no CREA.</span>{" "}
              Projeto e execução conduzidos por Engenheiro de Controle e Automação.
            </p>
          </div>

          <button
            type="submit"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-md bg-sonare-white px-6 py-3 text-[0.95rem] font-bold text-sonare-black transition-opacity hover:opacity-85 sm:w-auto"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Enviar pelo WhatsApp
          </button>

          <p aria-live="polite" className="mt-4 min-h-5 text-[0.85rem] text-sonare-silver/80">
            {feedback}
          </p>
        </form>
      </div>
    </section>
  );
}
