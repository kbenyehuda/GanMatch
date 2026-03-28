function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Canonical site origin for share URLs and metadata.
 * Order: NEXT_PUBLIC_SITE_URL → browser origin (client only) → VERCEL_URL → localhost:3000.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

export function getGanShareUrl(ganId: string): string {
  const base = getSiteUrl();
  return `${base}/gan/${ganId}`;
}
