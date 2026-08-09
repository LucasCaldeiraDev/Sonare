export const brand = {
  name: "Sonare",
  tagline: "Som, imagem e conforto em perfeita sintonia.",
  whatsappNumber: "5547996697354",
  whatsappDisplay: "(47) 99669-7354",
  email: "contato@sonareava.com.br",
  instagramHandle: "@sonareava",
  instagramUrl: "https://instagram.com/sonareava",
  hours: "Segunda a sexta, das 9h às 18h",
  hq: "Matriz em Piçarras/SC",
};

/**
 * Ordered north → south, the real axis of the service area (Campo Alegre is
 * the one planalto stop, northmost; the rest follow the BR-101 down the
 * coast). The order IS the route graphic — reordering here reorders the line.
 */
/**
 * Equipment showcase, rendered below the S110 spotlight in scroll order.
 *
 * PRE-BUILT FOR EXPANSION: to add gear (automação, áudio, vídeo), append an
 * entry here and nothing else — the section renders whatever this array
 * holds. `image` is optional: entries without one render as a quote band
 * instead of an editorial row. The copy below is the exact wording already
 * approved for the journey captions; keep new entries equally factual —
 * no invented specs.
 */
export const equipmentShowcase = [
  {
    eyebrow: "Bowers & Wilkins",
    title: "Série 800 Diamond",
    description:
      "Sistema frontal projetado para revelar precisão, espacialidade e detalhe. A arquitetura dos gabinetes e o Tweeter-on-Top ajudam a controlar ressonâncias e preservar clareza, foco e imagem sonora.",
    image: "/media/web/sol-living.webp",
    imageAlt:
      "Torres Bowers & Wilkins da Série 800 Diamond ladeando o telão do home cinema, com o projetor no teto.",
  },
  {
    eyebrow: "SIM2",
    title: "Projeção cinematográfica",
    description:
      "Projeção dedicada integrada à arquitetura, cuidadosamente posicionada para entregar uma experiência de cinema sem interferir na estética do ambiente.",
  },
  // Modelo para as próximas adições — copie, descomente e preencha:
  // {
  //   eyebrow: "Marca",
  //   title: "Nome do equipamento ou linha",
  //   description: "Descrição factual aprovada pela marca/cliente.",
  //   image: "/media/... (opcional)",
  //   imageAlt: "Descrição da imagem — obrigatória quando houver image.",
  // },
] as const;

/**
 * S110 hardware, taken verbatim from the manufacturer's product page
 * (pierocontrol.com/produto/piero-s110) on 2026-08-09. Only what the page
 * actually states — processor, memory, OS and protocols are NOT published
 * there, so they are not claimed here.
 */
export const s110Specs = [
  { label: "Tela", value: "10,1\" IPS" },
  { label: "Resolução", value: "1280 × 800" },
  { label: "Toque", value: "Capacitivo" },
  { label: "Orientação", value: "Vertical ou horizontal" },
  { label: "Instalação", value: "Caixa de embutir 2×2\"" },
  { label: "Alimentação", value: "PoE, 12 V ou 24 V" },
  { label: "Rede", value: "Ethernet com PoE · Wi-Fi 2,4 GHz" },
  { label: "Acabamento", value: "Alumínio, preto ou prata" },
] as const;

/**
 * Cards for the equipment gallery studies (fan carousel / elastic panels).
 * Two REAL equipment entries for now (B&W and the S110) — the ambience cards
 * fill the composition until more gear is confirmed, and say so honestly via
 * the "Ambiente" category. Every description reuses approved journey copy.
 */
export const equipmentGallery = [
  {
    id: "01",
    category: "Bowers & Wilkins",
    title: "Série 800 Diamond",
    description:
      "Sistema frontal projetado para revelar precisão, espacialidade e detalhe, com o Tweeter-on-Top preservando clareza e imagem sonora.",
    image: "/media/web/sol-living.webp",
    alt: "Torres Bowers & Wilkins da Série 800 Diamond no home cinema.",
  },
  {
    id: "02",
    category: "Display S110",
    title: "A casa em um toque",
    description:
      "Interface central discreta na parede: iluminação, clima, áudio, vídeo, cortinas e segurança na mesma tela.",
    image: "/media/web/s110-spotlight.webp",
    alt: "Display inteligente S110 instalado em parede de madeira ripada.",
  },
  {
    id: "03",
    category: "Ambiente",
    title: "Chegada iluminada",
    description: "Balizadores, paisagismo e luzes internas acesos em cena de chegada.",
    image: "/media/web/sol-entrada.webp",
    alt: "Entrada da residência iluminada em cena de chegada.",
  },
  {
    id: "04",
    category: "Ambiente",
    title: "Gourmet integrada",
    description: "Sanca, fitas sob a marcenaria e pendentes compondo a cena sem aparelho à vista.",
    image: "/media/web/sol-gourmet.webp",
    alt: "Área gourmet com iluminação arquitetural em cena.",
  },
  {
    id: "05",
    category: "Ambiente",
    title: "Cortinas e skyline",
    description: "A abertura acompanha a cena escolhida e entrega a vista no tempo certo.",
    image: "/media/web/sol-skyline.webp",
    alt: "Cortinas automatizadas abertas revelando o skyline noturno.",
  },
  {
    id: "06",
    category: "Ambiente",
    title: "Fachada em cena",
    description: "A casa inteira pronta para receber, da encosta ao living.",
    image: "/media/web/sol-start.webp",
    alt: "Fachada noturna da residência na encosta.",
  },
] as const;

export const serviceAreaCities = [
  { name: "Campo Alegre" },
  { name: "Joinville" },
  { name: "Barra Velha" },
  { name: "Piçarras", tag: "Matriz" },
  { name: "Itajaí" },
  { name: "Balneário Camboriú" },
] as const;

/**
 * `image` feeds the solutions deck. The current set reuses frames of the
 * journey itself — real footage the visitor just travelled through, not stock
 * — and is deliberately provisional: replacing any solution's photography is
 * a one-line swap here, no component changes.
 */
export const solutions = [
  {
    icon: "Home",
    title: "Automação residencial",
    description: "Cenas, agendamentos e rotinas que coordenam a casa inteira a partir de um único comando.",
    image: "/media/web/sol-start.webp",
  },
  {
    icon: "Music2",
    title: "Áudio residencial",
    description: "Som ambiente distribuído com qualidade e discrição, sala a sala.",
    image: "/media/web/sol-gourmet.webp",
  },
  {
    icon: "Clapperboard",
    title: "Home theater",
    description: "Telão, projeção e áudio dedicados para uma experiência de cinema em casa.",
    image: "/media/web/sol-living.webp",
  },
  {
    icon: "Lightbulb",
    title: "Controle de iluminação",
    description: "Cenas de luz que se ajustam ao momento do dia e ao uso de cada ambiente.",
    image: "/media/web/sol-entrada.webp",
  },
  {
    icon: "Blinds",
    title: "Cortinas e climatização",
    description: "Cortinas, ar-condicionado e aquecimento de piso integrados às cenas da casa.",
    image: "/media/web/sol-skyline.webp",
  },
  {
    icon: "CalendarClock",
    title: "Agendamentos automatizados",
    description: "Rotinas que se antecipam ao dia a dia da família, sem exigir comando manual.",
    image: "/media/web/s110-spotlight.webp",
  },
  {
    icon: "Network",
    title: "Redes e infraestrutura",
    description: "Estrutura de rede dimensionada para sustentar toda a automação com estabilidade.",
    image: "/media/web/sol-start.webp",
  },
  {
    icon: "Layers",
    title: "Integração completa",
    description: "Todos os sistemas da residência conversando entre si, sob controle único.",
    image: "/media/web/sol-skyline.webp",
  },
] as const;

export const differentiators = [
  {
    title: "Engenharia registrada",
    description: "Empresa conduzida por Engenheiro de Controle e Automação registrado no CREA.",
  },
  {
    title: "Projeto personalizado",
    description: "Cada residência recebe um projeto de automação desenhado para sua arquitetura e rotina.",
  },
  {
    title: "Retrofit especializado",
    description: "Correção de automações residenciais problemáticas, com diagnóstico técnico completo.",
  },
  {
    title: "Atendimento consultivo",
    description: "Acompanhamento próximo desde a primeira conversa até a entrega final.",
  },
] as const;

export const process = [
  { step: "01", title: "Consultoria", description: "Entendimento do espaço, da rotina da família e dos objetivos do projeto." },
  { step: "02", title: "Projeto", description: "Especificação técnica dos sistemas e desenho da experiência de automação." },
  { step: "03", title: "Integração", description: "Instalação, configuração e testes de cada sistema em conjunto." },
  { step: "04", title: "Entrega", description: "Ajuste fino, validação com o cliente e acompanhamento pós-entrega." },
] as const;

/** Text-only — no third-party logos are published without confirmed usage rights. */
export const brandsWorked = [
  "Bowers & Wilkins",
  "Rotel",
  "NAD",
  "Marantz",
  "JL Audio",
  "SIM2",
  "Audioquest",
  "Moon by SIMAUDIO",
  "Clearaudio",
  "Piero",
  "Russound",
];

/**
 * The panel's own controls, in the panel's own order: the eleven buttons on
 * the S110's bottom bar plus "Ambientes", the room selector in its top-right
 * corner. TITLES ARE TRANSCRIBED FROM THE INTERFACE — they are what the
 * screen says, not naming choices, so they should only change if the
 * firmware's wording does. The one-line descriptions are OURS and describe
 * what each control governs; they are the part worth a client review.
 */
export const s110Functions = [
  { icon: "Power", title: "Desligar", description: "Encerra as cenas ativas da casa." },
  { icon: "Lightbulb", title: "Iluminação", description: "Cada circuito de luz da residência." },
  { icon: "Clapperboard", title: "Áudio e Vídeo", description: "Fontes, volume e a cena de mídia." },
  { icon: "Thermometer", title: "Climatização", description: "Temperatura ambiente a ambiente." },
  { icon: "Flame", title: "Aquecimento", description: "Aquecimento integrado à cena." },
  { icon: "Blinds", title: "Cortinas", description: "Abertura e fechamento pelo painel." },
  { icon: "Cctv", title: "Câmeras", description: "As imagens do sistema na tela." },
  { icon: "Zap", title: "Atividades", description: "Cenas prontas para cada momento." },
  { icon: "CalendarClock", title: "Agendamentos", description: "Rotinas no horário programado." },
  { icon: "Lock", title: "Fechaduras", description: "Acessos e travamentos integrados." },
  { icon: "Images", title: "Álbuns", description: "Galeria de fotos no painel." },
  { icon: "Home", title: "Ambientes", description: "Navegação cômodo a cômodo." },
] as const;

export const projectTypes = ["Casa", "Apartamento", "Comercial", "Outro"] as const;
