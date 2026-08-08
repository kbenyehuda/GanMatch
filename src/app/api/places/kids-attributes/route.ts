import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import type { KosherStatus, SpokenLanguage } from "@/types/places";

const MEAL_TYPES = ["IN_HOUSE_COOK", "EXTERNAL_CATERING", "PARENTS_BRING", "MIXED"];
const FRIDAY_SCHEDULES = ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"];
const VACANCY_STATUSES = ["Available", "Limited", "Full"];
const LANGUAGES: SpokenLanguage[] = ["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"];
const KOSHER_STATUSES: KosherStatus[] = ["CERTIFIED", "NOT_CERTIFIED", "UNKNOWN"];
const GAN_CATEGORIES = [
  "MAON_SYMBOL", "MISHPACHTON", "PRIVATE_GAN", "MUNICIPAL_GAN",
  "TZAHARON_MUNICIPAL", "TZAHARON_PRIVATE_SUPERVISED", "TZAHARON_PRIVATE_UNSUPERVISED",
];

// Every field a user can submit, and how to validate it. `has(body, key)` lets a
// field be explicitly cleared (sent as null) vs. left untouched (key omitted).
function has(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

function oneOf(v: unknown, allowed: string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null;
}

// POST /api/places/kids-attributes
// body: { place_id, ...any KidsAttributes fields, hours?, kosher? }
// Only fields present in the body are touched; omit a key to leave it as-is.
export async function POST(req: NextRequest) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: place, error: fetchErr } = await admin
    .from("places")
    .select("place_category, attributes")
    .eq("id", placeId)
    .single();
  if (fetchErr || !place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }
  if (place.place_category !== "kids") {
    return NextResponse.json({ error: "Only kids places support these fields" }, { status: 400 });
  }

  const attrs = { ...((place.attributes as Record<string, unknown>) ?? {}) };

  if (has(body, "gan_category")) attrs.gan_category = oneOf(body.gan_category, GAN_CATEGORIES);
  if (has(body, "maon_symbol_code")) attrs.maon_symbol_code = str(body.maon_symbol_code);
  if (has(body, "min_age_months")) attrs.min_age_months = num(body.min_age_months, 0, 216);
  if (has(body, "max_age_months")) attrs.max_age_months = num(body.max_age_months, 0, 216);
  if (has(body, "meal_type")) attrs.meal_type = oneOf(body.meal_type, MEAL_TYPES);
  if (has(body, "friday_schedule")) attrs.friday_schedule = oneOf(body.friday_schedule, FRIDAY_SCHEDULES);
  if (has(body, "has_outdoor_space")) attrs.has_outdoor_space = bool(body.has_outdoor_space);
  if (has(body, "vacancy_status")) attrs.vacancy_status = oneOf(body.vacancy_status, VACANCY_STATUSES);
  if (has(body, "monthly_price_nis")) attrs.monthly_price_nis = num(body.monthly_price_nis, 0, 30000);
  if (has(body, "has_mamad")) attrs.has_mamad = bool(body.has_mamad);
  if (has(body, "has_cctv")) attrs.has_cctv = bool(body.has_cctv);
  if (has(body, "cctv_streamed_online")) attrs.cctv_streamed_online = bool(body.cctv_streamed_online);
  if (has(body, "kosher_certifier")) attrs.kosher_certifier = str(body.kosher_certifier);
  if (has(body, "staff_child_ratio")) attrs.staff_child_ratio = num(body.staff_child_ratio, 0, 1);
  if (has(body, "first_aid_trained")) attrs.first_aid_trained = bool(body.first_aid_trained);
  if (has(body, "vegan_friendly")) attrs.vegan_friendly = bool(body.vegan_friendly);
  if (has(body, "vegetarian_friendly")) attrs.vegetarian_friendly = bool(body.vegetarian_friendly);
  if (has(body, "meat_served")) attrs.meat_served = bool(body.meat_served);
  if (has(body, "allergy_friendly")) attrs.allergy_friendly = bool(body.allergy_friendly);
  if (has(body, "languages_spoken")) {
    const arr = Array.isArray(body.languages_spoken)
      ? (body.languages_spoken as unknown[]).filter((l): l is SpokenLanguage => LANGUAGES.includes(l as SpokenLanguage))
      : [];
    attrs.languages_spoken = arr.length ? arr : null;
  }
  if (has(body, "chugim_types")) {
    const arr = Array.isArray(body.chugim_types)
      ? (body.chugim_types as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean)
      : [];
    attrs.chugim_types = arr.length ? arr : null;
  }

  // Drop null-valued keys so the JSONB stays tidy instead of accumulating explicit nulls.
  for (const key of Object.keys(attrs)) {
    if (attrs[key] === null) delete attrs[key];
  }

  const placeUpdate: Record<string, unknown> = { attributes: attrs, updated_at: new Date().toISOString() };
  if (has(body, "hours")) placeUpdate.hours = str(body.hours);
  if (has(body, "kosher")) placeUpdate.kosher = oneOf(body.kosher, KOSHER_STATUSES) ?? null;

  const { error: updateErr } = await admin.from("places").update(placeUpdate).eq("id", placeId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, attributes: attrs });
}
