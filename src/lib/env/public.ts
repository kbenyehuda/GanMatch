function truthy(v: string | undefined) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function trimOrNull(v: string | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export const publicEnv = {
  // NOTE: In Next.js, client-side env vars must be referenced as
  // `process.env.NEXT_PUBLIC_*` (static access) so they can be inlined at build time.
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: trimOrNull(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN),
  NEXT_PUBLIC_SUPABASE_URL: trimOrNull(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: trimOrNull(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED: (() => {
    const raw = process.env.NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED;
    // If unset, default to "on" so the UI can still render a helpful message from the API.
    if (raw === undefined) return true;
    return truthy(raw);
  })(),
} as const;

