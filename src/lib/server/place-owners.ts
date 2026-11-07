import "server-only";

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { REMOVAL_REASONS } from "@/lib/place-basic-details";
import { escapeHtml, notifyAdmins, requestLinksHtml } from "@/lib/admin-notify";

export type ClaimStatus = "pending" | "approved" | "declined" | "revoked";

/** The signed-in user and a service-role client, or an error response. */
export async function requireUser(req: Request): Promise<{ user: User; admin: SupabaseClient; error?: undefined } | { error: NextResponse; user?: undefined; admin?: undefined }> {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return { error: NextResponse.json({ error: "Supabase config missing" }, { status: 500 }) };
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { user: data.user, admin };
}

/** True when the user is an approved owner of this place. */
export async function isApprovedOwner(admin: SupabaseClient, userId: string, placeId: string): Promise<boolean> {
  const { data } = await admin
    .from("place_owner_claims")
    .select("id")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .eq("status", "approved")
    .limit(1);
  return (data ?? []).length > 0;
}

/** Places this user owns (approved) or asked to own (pending), for the line in messages they send. */
export async function ownedPlaceNames(admin: SupabaseClient, userId: string): Promise<{ approved: string[]; pending: string[] }> {
  const { data } = await admin
    .from("place_owner_claims")
    .select("status,places(name)")
    .eq("user_id", userId)
    .in("status", ["approved", "pending"]);
  const rows = (data ?? []) as any[];
  const names = (st: string) => rows.filter((r) => r.status === st).map((r) => String(r.places?.name ?? "")).filter(Boolean);
  return { approved: names("approved"), pending: names("pending") };
}

/**
 * Should a recommendation by this user on this place wait for the admin?
 * Yes if they ever asked to own this place (any status), or own / asked to own
 * another place in the same category (a competitor).
 */
export async function ownerRelatedToPlace(admin: SupabaseClient, userId: string, placeId: string): Promise<boolean> {
  const { data: claims } = await admin
    .from("place_owner_claims")
    .select("place_id,status,places(place_category)")
    .eq("user_id", userId);
  if (!claims?.length) return false;
  if (claims.some((c: any) => c.place_id === placeId)) return true;
  const { data: place } = await admin.from("places").select("place_category").eq("id", placeId).maybeSingle();
  return claims.some((c: any) =>
    (c.status === "approved" || c.status === "pending") && c.places?.place_category === place?.place_category);
}

export interface OwnerContext {
  /** This person's ownership request for this exact place, if any (latest). */
  claim_status: ClaimStatus | null;
  /** Other places in the same category they own or asked to own. */
  other_places: { name: string; status: ClaimStatus }[];
  /** Their approved edits (details + pin) on any place: count, first and last. */
  approved_edits: number;
  /** Their edits as an approved owner (live at once; recorded, not counted above). */
  owner_edits: number;
  first_approved_at: string | null;
  last_approved_at: string | null;
}

/**
 * Admin-queue context for each (user, place) pair: ownership labels and the person's
 * edit history (trust is calculated from this, never stored; decisions 2026-11-07).
 * Keyed `${user_id}:${place_id}`.
 */
export async function ownerContextFor(
  admin: SupabaseClient,
  pairs: { user_id: string | null; place_id: string }[]
): Promise<Record<string, OwnerContext>> {
  const userIds = Array.from(new Set(pairs.map((p) => p.user_id).filter((x): x is string => !!x)));
  const placeIds = Array.from(new Set(pairs.map((p) => p.place_id)));
  if (!userIds.length) return {};

  const [claimsRes, placesRes, detailRes, locationRes] = await Promise.all([
    admin.from("place_owner_claims")
      .select("user_id,place_id,status,created_at,places(name,place_category)")
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
    admin.from("places").select("id,place_category").in("id", placeIds),
    // Owner edits (auto_applied) are counted separately; an undone edit counts nowhere.
    admin.from("place_detail_requests")
      .select("user_id,reviewed_at,auto_applied")
      .in("user_id", userIds)
      .eq("status", "approved")
      .is("reverted_at", null),
    admin.from("place_location_requests")
      .select("user_id,reviewed_at,auto_applied")
      .in("user_id", userIds)
      .eq("status", "approved")
      .is("reverted_at", null),
  ]);

  const categoryOf: Record<string, string> = {};
  for (const p of (placesRes.data ?? []) as any[]) categoryOf[p.id] = p.place_category;

  const editsByUser: Record<string, string[]> = {};
  const ownerEditsByUser: Record<string, number> = {};
  for (const r of [...((detailRes.data ?? []) as any[]), ...((locationRes.data ?? []) as any[])]) {
    if (!r.user_id || !r.reviewed_at) continue;
    if (r.auto_applied) ownerEditsByUser[r.user_id] = (ownerEditsByUser[r.user_id] ?? 0) + 1;
    else (editsByUser[r.user_id] ??= []).push(r.reviewed_at);
  }

  const claims = (claimsRes.data ?? []) as any[];
  const out: Record<string, OwnerContext> = {};
  for (const { user_id, place_id } of pairs) {
    if (!user_id) continue;
    const mine = claims.filter((c) => c.user_id === user_id);
    const here = mine.find((c) => c.place_id === place_id);
    const others = mine
      .filter((c) => c.place_id !== place_id && (c.status === "approved" || c.status === "pending")
        && c.places?.place_category && c.places.place_category === categoryOf[place_id])
      .map((c) => ({ name: String(c.places?.name ?? ""), status: c.status as ClaimStatus }));
    const dates = (editsByUser[user_id] ?? []).slice().sort();
    out[`${user_id}:${place_id}`] = {
      claim_status: (here?.status as ClaimStatus) ?? null,
      other_places: others,
      approved_edits: dates.length,
      owner_edits: ownerEditsByUser[user_id] ?? 0,
      first_approved_at: dates[0] ?? null,
      last_approved_at: dates[dates.length - 1] ?? null,
    };
  }
  return out;
}

/** Moves a place's pin (null = no pin) and optionally its address; an exact pin drops "approximate". */
export async function applyPlaceLocation(
  admin: SupabaseClient,
  placeId: string,
  lat: number | null,
  lon: number | null,
  address: string | null | undefined,
): Promise<string | null> {
  const { error } = await admin.rpc("update_place_location", { p_id: placeId, p_lat: lat, p_lon: lon });
  if (error) return error.message;
  const { data: row } = await admin.from("places").select("attributes").eq("id", placeId).single();
  const attrs = { ...((row?.attributes ?? {}) as Record<string, unknown>) };
  delete attrs.location_precision;
  const update: Record<string, unknown> = { attributes: attrs };
  if (address !== undefined) update.address = address;
  const { error: upErr } = await admin.from("places").update(update).eq("id", placeId);
  return upErr?.message ?? null;
}

/** Places with at least one approved owner, and when an owner last changed something there. */
export async function ownerManagedInfo(admin: SupabaseClient, placeId: string): Promise<{ managed: boolean; owner_updated_at: string | null }> {
  const [{ data: claims }, { data: d }, { data: l }] = await Promise.all([
    admin.from("place_owner_claims").select("id").eq("place_id", placeId).eq("status", "approved").limit(1),
    admin.from("place_detail_requests").select("reviewed_at").eq("place_id", placeId).eq("auto_applied", true)
      .is("reverted_at", null).order("reviewed_at", { ascending: false }).limit(1),
    admin.from("place_location_requests").select("reviewed_at").eq("place_id", placeId).eq("auto_applied", true)
      .is("reverted_at", null).order("reviewed_at", { ascending: false }).limit(1),
  ]);
  const dates = [d?.[0]?.reviewed_at, l?.[0]?.reviewed_at].filter(Boolean).sort() as string[];
  return { managed: (claims ?? []).length > 0, owner_updated_at: dates[dates.length - 1] ?? null };
}

/**
 * An owner asks to remove their listing (decision 2026-11-07). A reason is required.
 * The place is hidden at once and the request waits for the admin: approve keeps it hidden,
 * decline shows it again. Hidden, never deleted.
 */
export async function requestPlaceRemoval(
  admin: SupabaseClient,
  args: { placeId: string; userId: string; reason: string; details: string | null; origin: string },
): Promise<{ hidden: true } | { error: string; status: number }> {
  if (!REMOVAL_REASONS[args.reason]) return { error: "נא לבחור סיבה", status: 400 };
  if (args.reason === "other" && !args.details) return { error: "נא לכתוב את הסיבה", status: 400 };

  const { data: place } = await admin.from("places").select("name,is_hidden").eq("id", args.placeId).maybeSingle();
  if (!place) return { error: "מקום לא נמצא", status: 404 };
  if (place.is_hidden) return { error: "המקום כבר לא מוצג באתר", status: 409 };
  const { data: open } = await admin.from("place_detail_requests")
    .select("id").eq("place_id", args.placeId).eq("status", "pending").contains("changes", { remove_listing: true }).limit(1);
  if (open?.length) return { error: "הבקשה להסרה כבר אצלנו", status: 409 };

  const { error: hideErr } = await admin.from("places").update({ is_hidden: true, updated_at: new Date().toISOString() }).eq("id", args.placeId);
  if (hideErr) return { error: hideErr.message, status: 500 };
  const { data: inserted, error } = await admin.from("place_detail_requests").insert({
    place_id: args.placeId, user_id: args.userId,
    changes: { remove_listing: true, removal_reason: args.reason, removal_details: args.details },
    previous: { remove_listing: false },
  }).select("id").single();
  if (error || !inserted) return { error: error?.message ?? "שגיאה בשמירה", status: 500 };

  const reason = `${REMOVAL_REASONS[args.reason]}${args.details ? `: ${args.details}` : ""}`;
  await notifyAdmins({
    subject: `הוסתר לבקשת בעלי המקום: ${place.name}`,
    html: `<p>בעלי <strong>${escapeHtml(place.name)}</strong> ביקשו להסיר את הרישום.</p>
      <p>סיבה: ${escapeHtml(reason)}</p>
      <p>המקום כבר מוסתר מהאתר. אישור ישאיר אותו מוסתר, דחייה תחזיר אותו לאתר.</p>
      ${requestLinksHtml(args.origin, "place-detail-requests", inserted.id)}`,
  });
  return { hidden: true };
}
