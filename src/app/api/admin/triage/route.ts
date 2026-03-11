import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

function parseLimit(raw: string | null, fallback = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 500);
}

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  city: "City",
  website_url: "Website",
  operating_hours: "Operating hours",
  friday_schedule: "Friday schedule",
  vacancy_status: "Vacancy status",
  has_mamad: "Has mamad",
  has_outdoor_space: "Has outdoor space",
  first_aid_trained: "First-aid trained",
  monthly_price_nis: "Monthly price (NIS)",
  min_age_months: "Min age (months)",
  max_age_months: "Max age (months)",
  meal_type: "Meal type",
  vegan_friendly: "Vegan friendly",
  vegetarian_friendly: "Vegetarian friendly",
  meat_served: "Meat served",
  allergy_friendly: "Allergy friendly",
  kosher_status: "Kosher status",
  kosher_certifier: "Kosher certifier",
  staff_child_ratio: "Staff-child ratio",
  languages_spoken: "Languages spoken",
  chugim_types: "Chugim types",
  price_notes: "Price notes",
  neighborhood: "Neighborhood",
  pikuach_ironi: "Municipal supervision",
  suggested_type: "Suggested type",
  phone: "Phone",
  phone_whatsapp: "WhatsApp phone",
};

function norm(v: unknown): unknown {
  if (Array.isArray(v)) {
    return [...v].map((x) => String(x ?? "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
  }
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (v && typeof v === "object") {
    return v;
  }
  return v ?? null;
}

function pretty(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function buildRequestedChanges(inputRow: any): Array<{ field: string; label: string; value: string }> {
  const out: Array<{ field: string; label: string; value: string }> = [];
  const add = (field: string, value: unknown) => {
    if (value === null || value === undefined) return;
    const n = norm(value);
    if (n === null || n === undefined) return;
    out.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      value: pretty(value),
    });
  };
  for (const [k, v] of Object.entries(inputRow ?? {})) {
    if (
      k === "id" ||
      k === "user_id" ||
      k === "email" ||
      k === "gan_id" ||
      k === "input_type" ||
      k === "status" ||
      k === "moderation_reason" ||
      k === "created_at" ||
      k === "reviewed_at" ||
      k === "reviewed_by" ||
      k === "metadata" ||
      k === "ganim_v2"
    ) {
      continue;
    }
    add(k, v);
  }
  const meta = inputRow?.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (k === "source") continue;
      add(k, v);
    }
  }
  const dedup = new Map<string, { field: string; label: string; value: string }>();
  for (const item of out) dedup.set(item.field, item);
  return Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label, "en"));
}

function buildDiffs(inputRow: any): Array<{ field: string; label: string; before: string; after: string }> {
  const gan = inputRow?.ganim_v2 ?? null;
  const inputMeta = inputRow?.metadata && typeof inputRow.metadata === "object" ? inputRow.metadata : {};
  const ganMeta = gan?.metadata && typeof gan.metadata === "object" ? gan.metadata : {};
  const diffs: Array<{ field: string; label: string; before: string; after: string }> = [];

  // Candidate changed keys come from non-null direct columns and non-null metadata keys.
  const changedKeys = new Set<string>();
  for (const [k, v] of Object.entries(inputRow ?? {})) {
    if (k === "metadata" || k === "ganim_v2") continue;
    if (v !== null && v !== undefined) changedKeys.add(k);
  }
  for (const [k, v] of Object.entries(inputMeta as Record<string, unknown>)) {
    if (v !== null && v !== undefined) changedKeys.add(k);
  }

  for (const key of changedKeys) {
    // "after" from user input row or metadata delta.
    const hasDirect = Object.prototype.hasOwnProperty.call(inputRow ?? {}, key);
    const afterRaw = hasDirect && inputRow[key] != null ? inputRow[key] : (inputMeta as Record<string, unknown>)[key];

    // "before" from gan row or gan metadata.
    const beforeDirect = gan && Object.prototype.hasOwnProperty.call(gan, key) ? gan[key] : undefined;
    const beforeRaw = beforeDirect !== undefined && beforeDirect !== null ? beforeDirect : (ganMeta as Record<string, unknown>)[key];

    if (JSON.stringify(norm(beforeRaw)) === JSON.stringify(norm(afterRaw))) {
      continue;
    }
    diffs.push({
      field: key,
      label: FIELD_LABELS[key] ?? key,
      before: pretty(beforeRaw),
      after: pretty(afterRaw),
    });
  }

  return diffs.sort((a, b) => a.label.localeCompare(b.label, "en"));
}

export async function GET(req: Request) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server env missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!serverEnv.ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") ?? "pending").trim();
  const allowedStatus = status === "pending" || status === "approved" || status === "rejected";
  const limit = parseLimit(searchParams.get("limit"));

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let query = supabaseAdmin
    .from("user_inputs")
    .select("id,user_id,email,gan_id,input_type,status,moderation_reason,created_at,reviewed_at,address,city,website_url,operating_hours,friday_schedule,vacancy_status,has_mamad,has_outdoor_space,first_aid_trained,monthly_price_nis,min_age_months,max_age_months,meal_type,vegan_friendly,vegetarian_friendly,meat_served,allergy_friendly,kosher_status,kosher_certifier,staff_child_ratio,languages_spoken,chugim_types,price_notes,metadata,ganim_v2(name_he,address,city,website_url,operating_hours,friday_schedule,vacancy_status,has_mamad,has_outdoor_space,first_aid_trained,monthly_price_nis,min_age_months,max_age_months,meal_type,vegan_friendly,vegetarian_friendly,meat_served,allergy_friendly,kosher_status,kosher_certifier,staff_child_ratio,languages_spoken,chugim_types,price_notes,metadata)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (allowedStatus) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as any[];
  const userIds = Array.from(new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean)));
  const emailByUserId: Record<string, string | null> = {};
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const r = await supabaseAdmin.auth.admin.getUserById(userId);
        emailByUserId[userId] = r.data.user?.email ?? null;
      } catch {
        emailByUserId[userId] = null;
      }
    })
  );

  const engagementByUserId: Record<
    string,
    { total_submissions: number; approved: number; pending: number; rejected: number; last_submission_at: string | null }
  > = {};
  if (userIds.length > 0) {
    const { data: engagementRows } = await supabaseAdmin
      .from("user_inputs")
      .select("user_id,status,created_at")
      .in("user_id", userIds);
    for (const row of engagementRows ?? []) {
      const uid = String((row as any).user_id ?? "");
      if (!uid) continue;
      if (!engagementByUserId[uid]) {
        engagementByUserId[uid] = {
          total_submissions: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          last_submission_at: null,
        };
      }
      const e = engagementByUserId[uid];
      e.total_submissions += 1;
      const s = String((row as any).status ?? "");
      if (s === "approved") e.approved += 1;
      else if (s === "pending") e.pending += 1;
      else if (s === "rejected") e.rejected += 1;
      const created = String((row as any).created_at ?? "");
      if (created && (!e.last_submission_at || created > e.last_submission_at)) {
        e.last_submission_at = created;
      }
    }
  }

  const items = rows.map((row) => ({
    ...row,
    user_email:
      row.email ??
      (row.user_id ? emailByUserId[String(row.user_id)] ?? null : null),
    engagement:
      row.user_id && engagementByUserId[String(row.user_id)]
        ? engagementByUserId[String(row.user_id)]
        : {
            total_submissions: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
            last_submission_at: null,
          },
    diffs: buildDiffs(row),
    requested_changes: buildRequestedChanges(row),
  }));

  return NextResponse.json({ items });
}

