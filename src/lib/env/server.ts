import "server-only";

function truthy(v: string | undefined) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function csvLowerSet(v: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of String(v ?? "").split(",")) {
    const t = part.trim().toLowerCase();
    if (t) set.add(t);
  }
  return set;
}

function getTrimmed(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function requireTrimmed(name: string): string {
  const v = getTrimmed(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const serverEnv = {
  CONTACT_REVIEWER_ENABLED: truthy(process.env.CONTACT_REVIEWER_ENABLED),

  // Shared with client, but safe to read on server too.
  NEXT_PUBLIC_SUPABASE_URL: getTrimmed("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getTrimmed("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Server-only secrets
  SUPABASE_SERVICE_ROLE_KEY: getTrimmed("SUPABASE_SERVICE_ROLE_KEY"),
  RESEND_API_KEY: getTrimmed("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: getTrimmed("RESEND_FROM_EMAIL"),
  ADMIN_EMAILS: csvLowerSet(process.env.ADMIN_EMAILS),
} as const;

export function requireContactReviewerConfig() {
  if (!serverEnv.CONTACT_REVIEWER_ENABLED) {
    return { enabled: false as const };
  }

  return {
    enabled: true as const,
    supabaseUrl: requireTrimmed("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireTrimmed("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: requireTrimmed("SUPABASE_SERVICE_ROLE_KEY"),
    resendApiKey: requireTrimmed("RESEND_API_KEY"),
    resendFrom: requireTrimmed("RESEND_FROM_EMAIL"),
  };
}

