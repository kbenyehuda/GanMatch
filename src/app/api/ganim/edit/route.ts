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

function coerceTrimmedOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : null;
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

  // Read existing metadata so we can merge without wiping.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("ganim_v2")
    .select("id,category,metadata")
    .eq("id", ganId)
    .single();
  if (exErr || !existing) {
    return NextResponse.json({ error: "Gan not found" }, { status: 404 });
  }

  const nextMetadata: Record<string, unknown> = {
    ...(existing.metadata && typeof existing.metadata === "object" ? (existing.metadata as any) : {}),
  };

  const address = coerceTrimmedOrNull(patch.address);
  const city = coerceTrimmedOrNull(patch.city);
  const neighborhood = coerceTrimmedOrNull(patch.neighborhood);
  const suggestedType = coerceTrimmedOrNull(patch.suggested_type);
  const addressExtra = coerceTrimmedOrNull(patch.address_extra);

  if (neighborhood !== undefined) {
    if (neighborhood === null) delete nextMetadata.neighborhood;
    else nextMetadata.neighborhood = neighborhood;
  }
  if (suggestedType !== undefined) {
    if (suggestedType === null) delete nextMetadata.suggested_type;
    else nextMetadata.suggested_type = suggestedType;
  }
  if (addressExtra !== undefined) {
    if (addressExtra === null) delete nextMetadata.address_extra;
    else nextMetadata.address_extra = addressExtra;
  }

  if (patch.pikuach_ironi !== undefined) {
    if (patch.pikuach_ironi === null) nextMetadata.pikuach_ironi = null;
    else nextMetadata.pikuach_ironi = Boolean(patch.pikuach_ironi);
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
      nextMetadata.cctv_access = "none";
    } else if (streamedOnline === true) {
      nextMetadata.cctv_access = "online";
    } else if (streamedOnline === false) {
      nextMetadata.cctv_access = "exceptional";
    }
  }

  const updatePayload: Record<string, unknown> = {
    metadata: nextMetadata,
  };
  if (address !== undefined) updatePayload.address = address;
  if (city !== undefined) updatePayload.city = city;

  if (patch.category !== undefined && isGanCategory(patch.category)) {
    updatePayload.category = patch.category;
  }

  // Enforce "dependent add-on" fields by category so we never save mismatched combos.
  const nextCategory: GanCategory = (updatePayload.category as GanCategory) ?? (existing as any).category;
  if (nextCategory === "MAON_SYMBOL") {
    updatePayload.maon_symbol_code = coerceTrimmedOrNull(patch.maon_symbol_code);
    updatePayload.private_supervision = null;
    updatePayload.mishpachton_affiliation = null;
    updatePayload.municipal_grade = null;
  } else if (nextCategory === "PRIVATE_GAN") {
    updatePayload.maon_symbol_code = null;
    updatePayload.private_supervision =
      patch.private_supervision !== undefined && isPrivateSupervision(patch.private_supervision)
        ? patch.private_supervision
        : "UNKNOWN";
    updatePayload.mishpachton_affiliation = null;
    updatePayload.municipal_grade = null;
  } else if (nextCategory === "MISHPACHTON") {
    updatePayload.maon_symbol_code = null;
    updatePayload.private_supervision = null;
    updatePayload.mishpachton_affiliation =
      patch.mishpachton_affiliation !== undefined && isMishpachtonAffiliation(patch.mishpachton_affiliation)
        ? patch.mishpachton_affiliation
        : "UNKNOWN";
    updatePayload.municipal_grade = null;
  } else if (nextCategory === "MUNICIPAL_GAN") {
    updatePayload.maon_symbol_code = null;
    updatePayload.private_supervision = null;
    updatePayload.mishpachton_affiliation = null;
    updatePayload.municipal_grade =
      patch.municipal_grade !== undefined && isMunicipalGrade(patch.municipal_grade)
        ? patch.municipal_grade
        : "UNKNOWN";
  } else {
    // UNSPECIFIED: clear all dependent add-ons
    updatePayload.maon_symbol_code = null;
    updatePayload.private_supervision = null;
    updatePayload.mishpachton_affiliation = null;
    updatePayload.municipal_grade = null;
  }
  if (patch.monthly_price_nis !== undefined) {
    updatePayload.monthly_price_nis =
      patch.monthly_price_nis === null ? null : Number(patch.monthly_price_nis);
  }
  if (patch.min_age_months !== undefined) {
    updatePayload.min_age_months = patch.min_age_months === null ? null : Number(patch.min_age_months);
  }
  if (patch.max_age_months !== undefined) {
    updatePayload.max_age_months = patch.max_age_months === null ? null : Number(patch.max_age_months);
  }
  if (hasCctv !== undefined) updatePayload.has_cctv = hasCctv;
  if (streamedOnline !== undefined) updatePayload.cctv_streamed_online = streamedOnline;

  // Log request (best-effort)
  await supabaseAdmin.from("gan_edit_requests").insert({
    gan_id: ganId,
    user_id: userData.user.id,
    patch,
    approved: true,
    approved_at: new Date().toISOString(),
  });

  const { error: updErr } = await supabaseAdmin.from("ganim_v2").update(updatePayload).eq("id", ganId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, approved: true });
}

