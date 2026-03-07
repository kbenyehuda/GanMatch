import type { Gan } from "@/types/ganim";

/**
 * Normalize Israeli phone to E.164-like format for WhatsApp (972XXXXXXXXX).
 * Handles: 050-1234567, 03-1234567, 0501234567, etc.
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return phone;
  // Israeli: 0X... or 972...
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.length >= 9) return "972" + digits.slice(-9);
  return phone;
}

export function getWhatsAppUrl(phone: string): string {
  const normalized = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${normalized}`;
}

/**
 * Returns true if this phone number should open WhatsApp.
 * 1. If metadata.phone_whatsapp exists and contains this number → WhatsApp
 * 2. If category is PRIVATE_GAN or MISHPACHTON (with PRIVATE) → assume WhatsApp
 * 3. Otherwise (MUNICIPAL_GAN, MAON_SYMBOL, etc.) → regular phone only
 */
export function isPhoneWhatsApp(gan: Gan, phone: string): boolean {
  const whatsappList = gan.metadata?.phone_whatsapp;
  if (Array.isArray(whatsappList) && whatsappList.length > 0) {
    const norm = (p: string) => p.replace(/\D/g, "").slice(-9); // last 9 digits (Israeli mobile/landline)
    const phoneNorm = norm(phone);
    return whatsappList.some((w) => norm(w) === phoneNorm);
  }
  // Infer from category: private = typically WhatsApp
  if (gan.category === "PRIVATE_GAN") return true;
  if (gan.category === "MISHPACHTON" && gan.mishpachton_affiliation === "PRIVATE") return true;
  return false;
}
