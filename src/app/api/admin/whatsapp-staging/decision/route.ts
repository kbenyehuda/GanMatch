import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { summarizeRecommendation, getCategoryTags, recordNewTags, PHONE_REGEX, applyKidsFieldsToPlace, pickKidsStructuredFields, type Rating } from "@/lib/whatsapp-summarize";
import { geocodeHint, extractAddressFromText } from "@/lib/whatsapp-geocode";
import { findSimilarPlace } from "@/lib/dedupe";
import * as crypto from "crypto";

function contactEmail(reviewerName: string): string {
  const hash = crypto.createHash("md5").update(reviewerName.trim()).digest("hex").slice(0, 16);
  return `whatsapp-${hash}@givemytime.local`;
}

async function getOrCreateContactUser(admin: any, reviewerName: string): Promise<string> {
  const email = contactEmail(reviewerName);
  try {
    const res = await admin.auth.admin.createUser({
      email,
      password: `WA!${email}`,
      email_confirm: true,
      user_metadata: { whatsapp_name: reviewerName },
    });
    return String(res.data.user.id);
  } catch {
    // User already exists — look them up
    const { data } = await admin.auth.admin.listUsers();
    const found = (data?.users ?? []).find((u: any) => u.email === email);
    if (found) return String(found.id);
    throw new Error(`Could not create or find user for reviewer '${reviewerName}'`);
  }
}

export async function POST(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  await ensureAdminFullAccessForUser({ userId: ud.user.id, email });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const reason = typeof body?.moderation_reason === "string" ? body.moderation_reason.trim() : null;
  const includeText: boolean = body?.include_text !== false;
  const linkToPlaceId: string | null = typeof body?.link_to_place_id === "string" ? body.link_to_place_id : null;
  const forceNew: boolean = body?.force_new === true;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const { data: row, error: rowErr } = await admin.from("whatsapp_import_staging").select("*").eq("id", id).single();
  if (rowErr || !row) return NextResponse.json({ error: "Staging record not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: `Already ${row.status}` }, { status: 409 });

  const now = new Date().toISOString();

  if (action === "reject") {
    await admin.from("whatsapp_import_staging").update({ status: "rejected", moderation_reason: reason, reviewed_by: email, reviewed_at: now }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  // ── Approve ──────────────────────────────────────────────────────────────

  // Resolve the anonymized, legal-safe summary + rating + tags that will be
  // published. Rating is always required (even stars-only reviews need a real
  // rating, not a blind default) — classify now if this row hasn't been yet.
  let summaryText = String(row.summary_text ?? "").trim();
  let rating: Rating = (row.rating ?? 4) as Rating;
  let tags: string[] = Array.isArray(row.tags) ? row.tags : [];
  // Manual edits already persisted on the row (from the triage UI) take priority
  // over freshly-extracted LLM values for the same field.
  let kidsFields = {
    kosher: row.kosher ?? undefined,
    hours: row.hours ?? undefined,
    friday_schedule: row.friday_schedule ?? undefined,
    has_mamad: row.has_mamad ?? undefined,
    has_cctv: row.has_cctv ?? undefined,
  };
  if (!row.is_summarized) {
    const { OPENAI_API_KEY: openaiKey } = serverEnv;
    if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not set — לא ניתן ליצור סיכום אוטומטית" }, { status: 500 });
    try {
      const existingTags = await getCategoryTags(admin, row.category);
      const result = await summarizeRecommendation({
        placeName: row.place_name,
        recommendationText: row.recommendation_text,
        sourceMessages: row.source_messages,
        enthusiasm: row.enthusiasm,
        existingTags,
        category: row.category,
      }, openaiKey);
      summaryText = result.summary;
      rating = result.rating;
      tags = result.tags;
      const llmKidsFields = pickKidsStructuredFields(result);
      kidsFields = {
        kosher: kidsFields.kosher ?? llmKidsFields.kosher,
        hours: kidsFields.hours ?? llmKidsFields.hours,
        friday_schedule: kidsFields.friday_schedule ?? llmKidsFields.friday_schedule,
        has_mamad: kidsFields.has_mamad ?? llmKidsFields.has_mamad,
        has_cctv: kidsFields.has_cctv ?? llmKidsFields.has_cctv,
      };
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Summarize failed" }, { status: 500 });
    }
    await admin.from("whatsapp_import_staging").update({
      summary_text: summaryText || null,
      rating,
      tags,
      is_summarized: true,
      ...kidsFields,
    }).eq("id", id);
    await recordNewTags(admin, row.category, tags);
  }
  const effectiveIncludeText = includeText && !!summaryText;
  if (effectiveIncludeText) {
    if (PHONE_REGEX.test(summaryText)) {
      return NextResponse.json({ error: "הסיכום מכיל מספר טלפון — יש להסיר לפני אישור" }, { status: 400 });
    }
  }

  // 1. Resolve place — use existing or create new
  let placeId: string = row.existing_place_id ?? linkToPlaceId ?? null;

  // Guard against creating a second place for the same business: two
  // independent WhatsApp recs for "גן שקד" once became two separate place
  // rows because nothing checked for a close name match in the same
  // category. Skip the check once the admin has explicitly confirmed
  // (link_to_place_id) or said this really is a different place (force_new).
  if (!placeId && !forceNew) {
    const candidate = await findSimilarPlace(admin, row.category, row.place_name);
    if (candidate) {
      return NextResponse.json({ possible_duplicate: true, candidate });
    }
  }

  if (!placeId) {
    let hint: string | null = row.address_hint ?? null;

    // No stored coords and no address hint yet — ask the LLM to find one in the
    // WhatsApp text itself before falling back to "no location". This mirrors
    // the retroactive-geocode endpoint's logic so approvals never silently
    // create a placeless (invisible) pin when the text does mention an address.
    if (!(row.lat && row.lon) && !hint) {
      const { OPENAI_API_KEY: openaiKeyForAddr } = serverEnv;
      if (openaiKeyForAddr) {
        const textToSearch = [
          ...(Array.isArray(row.source_messages) ? row.source_messages : []),
          row.recommendation_text ?? "",
        ].join("\n").trim();
        if (textToSearch) {
          hint = await extractAddressFromText(textToSearch, row.place_name, openaiKeyForAddr);
        }
      }
    }

    const coords = (row.lat && row.lon)
      ? { lat: row.lat as number, lon: row.lon as number }
      : hint
        ? await geocodeHint(row.place_name, hint)
        : null;

    const { data: newPlaceId, error: placeErr } = await admin.rpc("insert_community_place", {
      p_name:        row.place_name,
      p_category:    row.category,
      p_lon:         coords?.lon ?? null,
      p_lat:         coords?.lat ?? null,
      p_address:     hint ?? null,
      p_description: null,
      p_phone:       null,
      p_website:     null,
      p_hours:       null,
      p_user_id:     null,
    });
    if (placeErr) return NextResponse.json({ error: placeErr.message }, { status: 500 });

    placeId = newPlaceId as string;

    // Persist what we learned back onto the staging row: a real hint/coords so
    // future runs don't redo the LLM call, or the -1 sentinel (matching
    // retroactive-geocode's convention) when nothing was found, so the
    // retroactive tool doesn't waste another pass on this row either.
    if (!(row.lat && row.lon)) {
      await admin.from("whatsapp_import_staging").update(
        coords
          ? { address_hint: hint, lat: coords.lat, lon: coords.lon }
          : { lat: -1, lon: -1 }
      ).eq("id", id);
    }

    // Mark as whatsapp-sourced and carry enrichment fields for new places
    const newPlaceUpdate: Record<string, unknown> = { source: "whatsapp", is_verified: false };
    const newAttrs: Record<string, unknown> = {};
    if (row.specialty) newAttrs.specialty = row.specialty;
    if (row.for_children != null) newAttrs.for_children = row.for_children;
    if (Object.keys(newAttrs).length > 0) newPlaceUpdate.attributes = newAttrs;
    if (Array.isArray(row.hmo) && row.hmo.length > 0) newPlaceUpdate.hmo = row.hmo;
    await admin.from("places").update(newPlaceUpdate).eq("id", placeId);
  } else {
    // Existing place: merge enrichment fields if any are set
    const hasEnrichment = row.specialty || row.for_children != null || (Array.isArray(row.hmo) && row.hmo.length > 0);
    if (hasEnrichment) {
      const { data: existing } = await admin.from("places").select("attributes, hmo").eq("id", placeId).single();
      const attrs = { ...((existing?.attributes as Record<string, unknown>) ?? {}) };
      const placeUpdate: Record<string, unknown> = {};
      if (row.specialty) attrs.specialty = row.specialty;
      if (row.for_children != null) attrs.for_children = row.for_children;
      if (row.specialty || row.for_children != null) placeUpdate.attributes = attrs;
      if (Array.isArray(row.hmo) && row.hmo.length > 0) {
        const existingHmo = Array.isArray(existing?.hmo) ? (existing.hmo as string[]) : [];
        placeUpdate.hmo = Array.from(new Set([...existingHmo, ...row.hmo]));
      }
      if (Object.keys(placeUpdate).length > 0) {
        await admin.from("places").update(placeUpdate).eq("id", placeId);
      }
    }
  }

  if (row.category === "kids") await applyKidsFieldsToPlace(admin, placeId, kidsFields);

  // 2. Create synthetic auth user for reviewer (deterministic per reviewer_name)
  let reviewerUserId: string;
  try {
    reviewerUserId = await getOrCreateContactUser(admin, row.reviewer_name);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 3. Insert review — dated to the WhatsApp message itself when known, not approval time
  const { error: reviewErr } = await admin.from("place_reviews").insert({
    user_id:               reviewerUserId,
    place_id:              placeId,
    rating,
    text:                  effectiveIncludeText ? summaryText : null,
    tags,
    reviewer_public_name:  "חבר/ה מהשכונה",
    whatsapp_reviewer_name: row.reviewer_name,
    is_anonymous:          true,
    allow_contact:         false,
    ...(row.message_date ? { created_at: row.message_date } : {}),
  });
  if (reviewErr && !reviewErr.message.includes("duplicate") && !reviewErr.message.includes("unique")) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  }

  // 4. Update staging row
  await admin.from("whatsapp_import_staging").update({
    status:            "approved",
    created_place_id:  placeId,
    ...(linkToPlaceId ? { existing_place_id: linkToPlaceId } : {}),
    reviewed_by:       email,
    reviewed_at:       now,
  }).eq("id", id);

  return NextResponse.json({ success: true, place_id: placeId });
}
