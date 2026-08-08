import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

// Guards every paid external API call (OpenAI, Mapbox, Google Places)
// behind a human-editable dollar budget in config/api-usage-limits.json —
// edit that file directly to change limits or flip a provider on/off, no
// code change or redeploy needed (read fresh from disk on every check, same
// pattern as config/moderation.json). Nominatim isn't covered here — it has
// no billing to cap, only its own courtesy rate limit (handled separately
// in whatsapp-geocode.ts).
//
// Counting happens via the increment_api_usage() Postgres function
// (migrations 20260808000000 + 20260808000100) — a single atomic
// UPSERT+RETURNING, so concurrent calls can't both slip past a budget
// boundary the way a plain read-then-write would.
export class UsageLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageLimitExceededError";
  }
}

export type ApiProvider = "openai" | "mapbox" | "google_places";

interface ProviderLimit {
  enabled: boolean;
  monthlyBudgetUsd: number;
  freeCallsPerMonth: number;
  estimatedCostPer1000CallsUsd: number;
  notes: string;
}

const FALLBACK_LIMITS: Record<ApiProvider, ProviderLimit> = {
  openai: { enabled: true, monthlyBudgetUsd: 5, freeCallsPerMonth: 0, estimatedCostPer1000CallsUsd: 0.2, notes: "" },
  mapbox: { enabled: true, monthlyBudgetUsd: 5, freeCallsPerMonth: 100000, estimatedCostPer1000CallsUsd: 0.75, notes: "" },
  google_places: { enabled: true, monthlyBudgetUsd: 5, freeCallsPerMonth: 800, estimatedCostPer1000CallsUsd: 35, notes: "" },
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Reads config/api-usage-limits.json fresh every call (deliberately not
// cached — the whole point is that editing the file takes effect
// immediately). Falls back to FALLBACK_LIMITS per-provider if the file is
// missing, unreadable, or a provider's block is malformed — a config
// problem must never silently become "no budget check happened at all".
export function loadApiUsageLimits(): Record<ApiProvider, ProviderLimit> {
  const result = { ...FALLBACK_LIMITS };
  try {
    const p = join(process.cwd(), "config", "api-usage-limits.json");
    const raw = JSON.parse(readFileSync(p, "utf8"));
    for (const provider of Object.keys(result) as ApiProvider[]) {
      const r = raw?.[provider];
      if (!r || typeof r !== "object") continue;
      result[provider] = {
        enabled: typeof r.enabled === "boolean" ? r.enabled : result[provider].enabled,
        monthlyBudgetUsd: num(r.monthly_budget_usd, result[provider].monthlyBudgetUsd),
        freeCallsPerMonth: num(r.free_calls_per_month, result[provider].freeCallsPerMonth),
        estimatedCostPer1000CallsUsd: num(r.estimated_cost_per_1000_calls_usd, result[provider].estimatedCostPer1000CallsUsd),
        notes: typeof r.notes === "string" ? r.notes : "",
      };
    }
  } catch (e: any) {
    console.log(`[api-usage] failed to read config/api-usage-limits.json, using built-in fallback limits: ${e?.message ?? String(e)}`);
  }
  return result;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
}

// Deliberately never throws — returns {allowed:false, reason} instead, so
// callers with a fallback tier (Mapbox, Google Places — see
// whatsapp-geocode.ts) can gracefully skip to the next provider instead of
// aborting the whole geocode attempt. Callers with NO fallback (the OpenAI
// extraction call, which nothing else can substitute for) should turn a
// false `allowed` into a thrown UsageLimitExceededError themselves — see
// extractAddressFromText.
export async function checkApiUsage(provider: ApiProvider): Promise<UsageCheckResult> {
  const cfg = loadApiUsageLimits()[provider];

  if (!cfg.enabled) {
    return { allowed: false, reason: `${provider} is disabled in config/api-usage-limits.json${cfg.notes ? ` — ${cfg.notes}` : ""}` };
  }

  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = serverEnv;
  if (!url || !key) {
    // No DB available (e.g. local script without service-role creds) —
    // fail open rather than block every call outright. The real pipeline
    // (Next.js API routes) always has these set.
    console.log(`[api-usage] Supabase env missing — skipping usage check for ${provider} (fail-open)`);
    return { allowed: true };
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const period = currentPeriod();
  const { data, error } = await admin.rpc("increment_api_usage", { p_provider: provider, p_period: period });
  if (error) {
    // A tracking failure must not silently allow unlimited spend — treat it
    // as a hard block for this call, distinctly logged so it's obvious in
    // logs this was a tracking failure, not a real budget breach.
    console.log(`[api-usage] failed to record usage for ${provider}, refusing the call: ${error.message}`);
    return { allowed: false, reason: `usage tracking failed for ${provider}: ${error.message}` };
  }

  const count = Number(data);
  const billableCalls = Math.max(0, count - cfg.freeCallsPerMonth);
  const estimatedCostUsd = (billableCalls / 1000) * cfg.estimatedCostPer1000CallsUsd;
  if (estimatedCostUsd > cfg.monthlyBudgetUsd) {
    return {
      allowed: false,
      reason: `${provider} estimated monthly spend ($${estimatedCostUsd.toFixed(2)}) would exceed the configured budget ($${cfg.monthlyBudgetUsd}) in config/api-usage-limits.json — call refused. (${count} calls this month, ${cfg.freeCallsPerMonth} free.)`,
    };
  }
  return { allowed: true };
}
