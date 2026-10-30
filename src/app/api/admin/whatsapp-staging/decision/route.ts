import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { summarizeRecommendation, getCategoryTags, getCategorySpecialties, recordNewTags, PHONE_REGEX, applyKidsFieldsToPlace, applyPlaceExtras, pickKidsStructuredFields, toHmoCodes, type Rating, type PlaceExtras } from "@/lib/whatsapp-summarize";
import { geocodeHint, extractAddressFromText, parseStoredHint, serializeHint, formatHintForDisplay, type BilingualExtractedAddress } from "@/lib/whatsapp-geocode";
import { findSimilarPlace } from "@/lib/dedupe";
import { isPrivatePersonEntry } from "@/lib/private-person";
import * as crypto from "crypto";

function contactEmail(reviewerName: string): string {
  const hash = crypto.createHash("md5").update(reviewerName.trim()).digest("hex").slice(0, 16);
  return `whatsapp-${hash}@givemytime.local`;
}

async function getOrCreateContactUser(admin: any, reviewerName: string): Promise<string> {
  // 1. Reuse: a reviewer who already has a published review already has an account. This is a
  //    plain DB read, so it doesn't depend on the auth admin API (slow and timeout-prone under load).
  const { data: prior } = await admin.from("place_reviews")
    .select("user_id").eq("whatsapp_reviewer_name", reviewerName).limit(1).maybeSingle();
  if (prior?.user_id) return String(prior.user_id);

  const email = contactEmail(reviewerName);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // 2. Create, retrying timeouts (they surface as an error whose message is just "{}").
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await admin.auth.admin.createUser({
      email,
      // Nobody signs in as these users; a random password keeps it that way.
      password: crypto.randomBytes(32).toString("base64url"),
      email_confirm: true,
    });
    if (res?.data?.user?.id) return String(res.data.user.id);
    lastError = String(res?.error?.message ?? "");
    // Already registered (e.g. an earlier approval created it but failed before saving the review).
    if (/already|registered|exists/i.test(lastError)) break;
    await sleep(800 * (attempt + 1));
  }

  // 3. Look it up. Pages of 100: 1000 per page times out (504) on this project.
  const perPage = 100;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) { lastError = String(error.message ?? lastError); break; }
    const users = data?.users ?? [];
    const found = users.find((u: any) => u.email === email);
    if (found) return String(found.id);
    if (users.length < perPage) break;
  }
  throw new Error(`Could not create or find user for reviewer '${reviewerName}': ${lastError || "not found"}`);
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
  // Facts the map filters on beyond the staging columns (gan type, outdoor space, price, ages,
  // doctor specialty/kupa, kosher…). They aren't stored on the staging row, so they come from
  // whichever LLM call runs below, and only fill fields the place doesn't have yet.
  let placeExtras: PlaceExtras | undefined;
  const specialtyOptions = await getCategorySpecialties(admin, row.category);
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
        specialtyOptions,
      }, openaiKey);
      summaryText = result.summary;
      rating = result.rating;
      tags = result.tags;
      placeExtras = result.place_extras;
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
  } else if (serverEnv.OPENAI_API_KEY) {
    // Already summarized (e.g. via "הצע סיכום"): the reviewed summary stays as is; this call
    // only extracts the extra place facts. Best-effort, never blocks the approval.
    try {
      const result = await summarizeRecommendation({
        placeName: row.place_name,
        recommendationText: row.recommendation_text,
        sourceMessages: row.source_messages,
        enthusiasm: row.enthusiasm,
        existingTags: [],
        category: row.category,
        specialtyOptions,
      }, serverEnv.OPENAI_API_KEY);
      placeExtras = result.place_extras;
    } catch { /* approve without the extra facts */ }
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

  const privatePerson = isPrivatePersonEntry(row.category, row.specialty, row.place_name);

  if (!placeId) {
    let hint: BilingualExtractedAddress | null = parseStoredHint(row.address_hint as string | null);
    let extractionFailed = false;

    // Raw message text — used both as the LLM extraction source AND as a
    // fallback city-detection signal for geocodeHint (see its doc comment).
    const textToSearch = [
      ...(Array.isArray(row.source_messages) ? row.source_messages : []),
      row.recommendation_text ?? "",
    ].join("\n").trim();

    // No stored coords and no address hint yet — ask the LLM to find one in the
    // WhatsApp text itself before falling back to "no location". This mirrors
    // the retroactive-geocode endpoint's logic so approvals never silently
    // create a placeless (invisible) pin when the text does mention an address.
    // extractAddressFromText throws on a real API failure (rate limit, etc.) —
    // that must NOT be treated the same as "no address mentioned", or the
    // staging row gets wrongly marked as permanently unresolvable (2026-08-07 bug).
    if (!(row.lat && row.lon) && !hint) {
      const { OPENAI_API_KEY: openaiKeyForAddr } = serverEnv;
      if (openaiKeyForAddr && textToSearch) {
        try {
          hint = await extractAddressFromText(textToSearch, row.place_name, openaiKeyForAddr);
        } catch {
          extractionFailed = true;
        }
      }
    }

    // A private person gets no pin or address: we never show where she lives
    const coords = privatePerson ? null : (row.lat && row.lon)
      ? { lat: row.lat as number, lon: row.lon as number }
      : hint
        ? await geocodeHint(row.place_name, hint, textToSearch)
        : null;

    const { data: newPlaceId, error: placeErr } = await admin.rpc("insert_community_place", {
      p_name:        row.place_name,
      p_category:    row.category,
      p_lon:         coords?.lon ?? null,
      p_lat:         coords?.lat ?? null,
      p_address:     hint && !privatePerson ? formatHintForDisplay(hint) : null,
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
    // retroactive-geocode's convention) when nothing was found. If extraction
    // failed (not "found nothing", but the call itself errored), leave lat/lon
    // as-is (null) so the retroactive-geocode tool retries this row later
    // instead of it being wrongly marked unresolvable forever.
    if (!(row.lat && row.lon) && !extractionFailed && !privatePerson) {
      await admin.from("whatsapp_import_staging").update(
        coords && hint
          ? { address_hint: serializeHint(hint), lat: coords.lat, lon: coords.lon }
          : { lat: -1, lon: -1 }
      ).eq("id", id);
    }

    // Mark as whatsapp-sourced and carry enrichment fields for new places
    const newPlaceUpdate: Record<string, unknown> = { source: "whatsapp", is_verified: false };
    if (privatePerson) newPlaceUpdate.is_hidden = true;
    const newAttrs: Record<string, unknown> = {};
    if (row.specialty) newAttrs.specialty = row.specialty;
    if (row.for_children != null) newAttrs.for_children = row.for_children;
    if (Object.keys(newAttrs).length > 0) newPlaceUpdate.attributes = newAttrs;
    if (toHmoCodes(row.hmo).length > 0) newPlaceUpdate.hmo = toHmoCodes(row.hmo);
    await admin.from("places").update(newPlaceUpdate).eq("id", placeId);
  } else {
    // Existing place with no pin yet (e.g. the 2nd+ recommendation in an "approve all" group,
    // whose first one didn't mention an address): try this recommendation's text for one.
    const { data: current } = await admin.from("places").select("location, address").eq("id", placeId).single();
    if (current && !current.location && serverEnv.OPENAI_API_KEY && !privatePerson) {
      const textToSearch = [
        ...(Array.isArray(row.source_messages) ? row.source_messages : []),
        row.recommendation_text ?? "",
      ].join("\n").trim();
      try {
        const hint = parseStoredHint(row.address_hint as string | null)
          ?? (textToSearch ? await extractAddressFromText(textToSearch, row.place_name, serverEnv.OPENAI_API_KEY) : null);
        const coords = hint ? await geocodeHint(row.place_name, hint, textToSearch) : null;
        if (hint && coords) {
          await admin.rpc("update_place_location", { p_id: placeId, p_lat: coords.lat, p_lon: coords.lon });
          if (!current.address) await admin.from("places").update({ address: formatHintForDisplay(hint) }).eq("id", placeId);
          await admin.from("whatsapp_import_staging").update({ address_hint: serializeHint(hint), lat: coords.lat, lon: coords.lon }).eq("id", id);
        }
      } catch { /* no pin from this one; a later recommendation or retroactive-geocode can still find it */ }
    }

    // Existing place: merge enrichment fields if any are set
    const hasEnrichment = row.specialty || row.for_children != null || toHmoCodes(row.hmo).length > 0;
    if (hasEnrichment) {
      const { data: existing } = await admin.from("places").select("attributes, hmo").eq("id", placeId).single();
      const attrs = { ...((existing?.attributes as Record<string, unknown>) ?? {}) };
      const placeUpdate: Record<string, unknown> = {};
      if (row.specialty) attrs.specialty = row.specialty;
      if (row.for_children != null) attrs.for_children = row.for_children;
      if (row.specialty || row.for_children != null) placeUpdate.attributes = attrs;
      if (toHmoCodes(row.hmo).length > 0) {
        placeUpdate.hmo = Array.from(new Set([...toHmoCodes(existing?.hmo), ...toHmoCodes(row.hmo)]));
      }
      if (Object.keys(placeUpdate).length > 0) {
        await admin.from("places").update(placeUpdate).eq("id", placeId);
      }
    }
  }

  if (row.category === "kids") await applyKidsFieldsToPlace(admin, placeId, kidsFields);
  await applyPlaceExtras(admin, placeId, placeExtras);

  // A private person stays hidden until she agrees (/admin/consents), unless she already did
  if (privatePerson) {
    const { data: consent } = await admin.from("place_consents").select("status").eq("place_id", placeId).maybeSingle();
    if (consent?.status !== "given") {
      const { error: hideErr } = await admin.from("places").update({ is_hidden: true }).eq("id", placeId);
      if (hideErr) return NextResponse.json({ error: hideErr.message }, { status: 500 });
      if (!consent) await admin.from("place_consents").insert({ place_id: placeId });
    }
  }

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
    // Negative recommendations aren't displayed for now (see migration 20261030000300)
    is_hidden:             rating <= 2,
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

  // 5. The same recommendation may already be published from the older WhatsApp import, under a
  // different reviewer key (phone/name there, anonymized id here). The newer row wins: remove
  // the older copy's review and mark its staging row as replaced (restorable via the reason).
  const replaced = await replaceOlderCopies(admin, { id, placeId, reviewerName: row.reviewer_name, sourceFile: row.source_file, text: row.recommendation_text, email, now });

  return NextResponse.json({ success: true, place_id: placeId, replaced });
}

// Same wording = at least one quote line of the new row (verbatim from the chat, 15+ chars)
// appears inside the older row's text. Short lines ("ממליצה!") match too easily to count.
function normalizeForMatch(s: string): string {
  // Keep Hebrew, Latin letters and digits; everything else (punctuation, emoji, spacing) folds to one space.
  return s.toLowerCase().replace(/[^֐-׿a-z0-9]+/g, " ").trim();
}

async function replaceOlderCopies(
  admin: any,
  args: { id: string; placeId: string; reviewerName: string; sourceFile: string | null; text: string; email: string; now: string }
): Promise<number> {
  const lines = String(args.text ?? "").split("\n").map(normalizeForMatch).filter(l => l.length >= 15);
  if (lines.length === 0) return 0;
  const { data: others } = await admin.from("whatsapp_import_staging")
    .select("id, reviewer_name, recommendation_text")
    .eq("status", "approved")
    .eq("created_place_id", args.placeId)
    .neq("id", args.id)
    .neq("reviewer_name", args.reviewerName)
    // Only copies from a different import; rows of the same batch are distinct recommendations.
    .neq("source_file", args.sourceFile ?? "");
  let n = 0;
  for (const o of (others ?? []) as { id: string; reviewer_name: string; recommendation_text: string }[]) {
    const oldText = normalizeForMatch(o.recommendation_text ?? "");
    if (!lines.some(l => oldText.includes(l))) continue;
    await admin.from("place_reviews").delete().eq("place_id", args.placeId).eq("whatsapp_reviewer_name", o.reviewer_name);
    await admin.from("whatsapp_import_staging").update({
      status: "rejected",
      moderation_reason: `replaced by newer copy: ${args.id}`,
      reviewed_by: args.email,
      reviewed_at: args.now,
    }).eq("id", o.id);
    n += 1;
  }
  return n;
}
