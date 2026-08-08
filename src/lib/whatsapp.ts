import { brand } from "../content/copy";

export type LeadFormData = {
  name: string;
  whatsapp: string;
  email: string;
  city: string;
  projectType: string;
  message: string;
};

export function buildWhatsappLeadUrl(data: LeadFormData): string {
  const lines = [
    "Olá! Gostaria de agendar uma visita técnica com a Sonare.",
    "",
    `Nome: ${data.name}`,
    `WhatsApp: ${data.whatsapp}`,
    data.email && `E-mail: ${data.email}`,
    data.city && `Cidade: ${data.city}`,
    `Tipo de projeto: ${data.projectType}`,
    data.message && `Mensagem: ${data.message}`,
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${brand.whatsappNumber}?text=${text}`;
}

export function buildWhatsappDirectUrl(): string {
  return `https://wa.me/${brand.whatsappNumber}`;
}
