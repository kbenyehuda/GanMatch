import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Allow bare domains like "facebook.com/..." and normalize to https.
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}
