/** Builds a click-to-chat link. Returns null when no number has been configured in admin. */
export function whatsappLink(number: string, message?: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
