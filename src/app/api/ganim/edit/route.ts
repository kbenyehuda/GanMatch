import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { approveGanEditPatch } from "@/lib/moderation/gan-edit-approval";

type GanCategory = "UNSPECIFIED" | "MAON_SYMBOL" | "PRIVATE_GAN" | "MISHPACHTON" | "MUNICIPAL_GAN";
type PrivateSupervisionStatus = "UNKNOWN" | "SUPERVISED" | "NOT_SUPERVISED";
type MishpachtonAffiliation = "UNKNOWN" | "PRIVATE" | "TAMAT";
type MunicipalGrade = "UNKNOWN" | "TTAH" | "TAH" | "HOVA";

function isGanCategory(v: unknown): v is GanCategory {
  return (
    v === "UNSPECIFIED" ||
    v === "MAON_SYMBOL" ||
    v === "PRIVATE_GAN" ||
    v === "MISHPACHTON" ||
    v === "MUNICIPAL_GAN"
  );
}
function isPrivateSupervision(v: unknown): v is PrivateSupervisionStatus {
  return v === "UNKNOWN" || v === "SUPERVISED" || v === "NOT_SUPERVISED";
}
function isMishpachtonAffiliation(v: unknown): v is MishpachtonAffiliation {
  return v === "UNKNOWN" || v === "PRIVATE" || v === "TAMAT";
}
function isMunicipalGrade(v: unknown): v is MunicipalGrade {
  return v === "UNKNOWN" || v === "TTAH" || v === "TAH" || v === "HOVA";
}

const FRIDAY_SCHEDULES = ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY", "UNKNOWN"] as const;
const MEAL_TYPES = ["IN_HOUSE_COOK", "EXTERNAL_CATERING", "PARENTS_BRING", "MIXED", "UNKNOWN"] as const;
const KOSHER_STATUSES = ["CERTIFIED", "NOT_CERTIFIED", "UNKNOWN"] as const;
const SPOKEN_LANGUAGES = ["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"] as const;
const VACANCY_STATUSES = ["Available", "Limited", "Full", "UNKNOWN"] as const;

function isFridaySchedule(v: unknown): v is (typeof FRIDAY_SCHEDULES)[number] {
  return typeof v === "string" && FRIDAY_SCHEDULES.includes(v as any);
}
function isMealType(v: unknown): v is (typeof MEAL_TYPES)[number] {
  return typeof v === "string" && MEAL_TYPES.includes(v as any);
}
function isKosherStatus(v: unknown): v is (typeof KOSHER_STATUSES)[number] {
  return typeof v === "string" && KOSHER_STATUSES.includes(v as any);
}
function isVacancyStatus(v: unknown): v is (typeof VACANCY_STATUSES)[number] {
  return typeof v === "string" && VACANCY_STATUSES.includes(v as any);
}
function coerceSpokenLanguages(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && SPOKEN_LANGUAGES.includes(item as any)) out.push(item);
  }
  return out.length ? out : null;
}
function coerceStringArray(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  }
  return out.length ? out : null;
}

function coerceTrimmedOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : null;
}

function coerceHttpUrlOrNull(v: unknown): string | null | undefined {
  const s = coerceTrimmedOrNull(v);
  if (s === undefined || s === null) return s;
  try {
    const u = new URL(s);
    const proto = u.protocol.toLowerCase();
    if (proto !== "http:" && proto !== "https:") return null;
    return u.toString();
  } catch {
    // Allow users to paste "www.example.com" without scheme; normalize to https.
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(s)) {
      try {
        const u = new URL(`https://${s}`);
        return u.toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ganId = typeof (body as any)?.ganId === "string" ? String((body as any).ganId) : "";
  const patch = (body as any)?.patch as Record<string, unknown> | undefined;
  if (!ganId) return NextResponse.json({ error: "Missing ganId" }, { status: 400 });
  if (!patch || typeof patch !== "object") return NextResponse.json({ error: "Missing patch" }, { status: 400 });

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const approval = await approveGanEditPatch({ userId: userData.user.id, ganId, patch });
  if (!approval.approved) {
    return NextResponse.json({ error: approval.reason }, { status: 403 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Ensure gan exists before writing to ledger.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("ganim_v2")
    .select("id")
    .eq("id", ganId)
    .single();
  if (exErr || !existing) {
    return NextResponse.json({ error: "Gan not found" }, { status: 404 });
  }

  // Keep user_inputs as a true delta ledger: store only metadata keys touched by this request.
  const metadataPatch: Record<string, unknown> = {};

  const address = coerceTrimmedOrNull(patch.address);
  const city = coerceTrimmedOrNull(patch.city);
  const neighborhood = coerceTrimmedOrNull(patch.neighborhood);
  const suggestedType = coerceTrimmedOrNull(patch.suggested_type);
  const addressExtra = coerceTrimmedOrNull(patch.address_extra);
  const priceNotes = coerceTrimmedOrNull(patch.price_notes);
  const websiteUrl = coerceHttpUrlOrNull(patch.website_url);

  if (neighborhood !== undefined) {
    metadataPatch.neighborhood = neighborhood;
  }
  if (suggestedType !== undefined) {
    metadataPatch.suggested_type = suggestedType;
  }
  if (addressExtra !== undefined) {
    metadataPatch.address_extra = addressExtra;
  }

  if (patch.pikuach_ironi !== undefined) {
    if (patch.pikuach_ironi === null) metadataPatch.pikuach_ironi = null;
    else metadataPatch.pikuach_ironi = Boolean(patch.pikuach_ironi);
  }

  const phoneArr = coerceStringArray(patch.phone);
  if (phoneArr !== undefined) {
    if (phoneArr === null || phoneArr.length === 0) {
      metadataPatch.phone = null;
      metadataPatch.phone_whatsapp = null;
    } else {
      metadataPatch.phone = phoneArr;
      const whatsappArr = coerceStringArray(patch.phone_whatsapp);
      if (whatsappArr !== undefined && whatsappArr && whatsappArr.length > 0) {
        metadataPatch.phone_whatsapp = whatsappArr.filter((w) =>
          phoneArr.some((p) => p.replace(/\D/g, "").slice(-9) === w.replace(/\D/g, "").slice(-9))
        );
      } else {
        metadataPatch.phone_whatsapp = null;
      }
    }
  }

  // CCTV: keep columns as source of truth, but also maintain metadata.cctv_access for compatibility.
  const hasCctv = patch.has_cctv === undefined ? undefined : Boolean(patch.has_cctv);
  const streamedOnline =
    patch.cctv_streamed_online === undefined
      ? undefined
      : patch.cctv_streamed_online === null
        ? null
        : Boolean(patch.cctv_streamed_online);
  if (hasCctv !== undefined) {
    if (!hasCctv) {
      metadataPatch.cctv_access = "none";
    } else if (streamedOnline === true) {
      metadataPatch.cctv_access = "online";
    } else if (streamedOnline === false) {
      metadataPatch.cctv_access = "exceptional";
    }
  }

  const operatingHours = coerceTrimmedOrNull(patch.operating_hours);
  const kosherCertifier = coerceTrimmedOrNull(patch.kosher_certifier);
  const chugimTypes = coerceStringArray(patch.chugim_types);
  const languagesSpoken = coerceSpokenLanguages(patch.languages_spoken);

  // Ledger: insert into user_inputs only. Python script consumes and updates ganim_v2.
  const userInputRow: Record<string, unknown> = {
    user_id: userData.user.id,
    email: userData.user.email ?? null,
    gan_id: ganId,
    is_new_gan: false,
    input_type: "edit",
    status: "pending",
  };
  if (Object.keys(metadataPatch).length > 0) userInputRow.metadata = metadataPatch;
  if (address !== undefined) userInputRow.address = address;
  if (city !== undefined) userInputRow.city = city;
  if (priceNotes !== undefined) userInputRow.price_notes = priceNotes;
  if (websiteUrl !== undefined) userInputRow.website_url = websiteUrl;
  if (patch.category !== undefined && isGanCategory(patch.category)) userInputRow.category = patch.category;
  if (coerceTrimmedOrNull(patch.maon_symbol_code) !== undefined) userInputRow.maon_symbol_code = coerceTrimmedOrNull(patch.maon_symbol_code);
  if (patch.private_supervision !== undefined && isPrivateSupervision(patch.private_supervision))
    userInputRow.private_supervision = patch.private_supervision;
  if (patch.mishpachton_affiliation !== undefined && isMishpachtonAffiliation(patch.mishpachton_affiliation))
    userInputRow.mishpachton_affiliation = patch.mishpachton_affiliation;
  if (patch.municipal_grade !== undefined && isMunicipalGrade(patch.municipal_grade))
    userInputRow.municipal_grade = patch.municipal_grade;
  if (patch.monthly_price_nis !== undefined)
    userInputRow.monthly_price_nis = patch.monthly_price_nis === null ? null : Number(patch.monthly_price_nis);
  if (patch.min_age_months !== undefined) userInputRow.min_age_months = patch.min_age_months;
  if (patch.max_age_months !== undefined) userInputRow.max_age_months = patch.max_age_months;
  if (hasCctv !== undefined) userInputRow.has_cctv = hasCctv;
  if (streamedOnline !== undefined) userInputRow.cctv_streamed_online = streamedOnline;
  if (operatingHours !== undefined) userInputRow.operating_hours = operatingHours;
  if (patch.friday_schedule !== undefined && isFridaySchedule(patch.friday_schedule))
    userInputRow.friday_schedule = patch.friday_schedule;
  if (patch.meal_type !== undefined && isMealType(patch.meal_type)) userInputRow.meal_type = patch.meal_type;
  if (patch.vegan_friendly !== undefined) userInputRow.vegan_friendly = patch.vegan_friendly;
  if (patch.vegetarian_friendly !== undefined) userInputRow.vegetarian_friendly = patch.vegetarian_friendly;
  if (patch.meat_served !== undefined) userInputRow.meat_served = patch.meat_served;
  if (patch.allergy_friendly !== undefined) userInputRow.allergy_friendly = patch.allergy_friendly;
  if (patch.kosher_status !== undefined && isKosherStatus(patch.kosher_status))
    userInputRow.kosher_status = patch.kosher_status;
  if (kosherCertifier !== undefined) userInputRow.kosher_certifier = kosherCertifier;
  if (patch.staff_child_ratio !== undefined)
    userInputRow.staff_child_ratio = patch.staff_child_ratio === null ? null : Number(patch.staff_child_ratio);
  if (patch.first_aid_trained !== undefined) userInputRow.first_aid_trained = patch.first_aid_trained;
  if (languagesSpoken !== undefined) userInputRow.languages_spoken = languagesSpoken;
  if (patch.has_outdoor_space !== undefined) userInputRow.has_outdoor_space = patch.has_outdoor_space;
  if (patch.has_mamad !== undefined) userInputRow.has_mamad = patch.has_mamad;
  if (chugimTypes !== undefined) userInputRow.chugim_types = chugimTypes;
  if (patch.vacancy_status !== undefined && isVacancyStatus(patch.vacancy_status))
    userInputRow.vacancy_status = patch.vacancy_status;
  // Filter out undefined; Supabase/Postgres expects null for empty, not undefined
  const cleanRow = Object.fromEntries(
    Object.entries(userInputRow).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
  const { error: insertErr } = await supabaseAdmin.from("user_inputs").insert(cleanRow);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status: "pending",
    message: "השינוי נשמר וממתין לאימות לפני פרסום.",
  });
}

