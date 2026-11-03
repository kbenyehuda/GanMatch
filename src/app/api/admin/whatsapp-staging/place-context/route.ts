import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

/**
 * Everything the triage needs to judge "is this the same place?": the existing place's details,
 * its published reviews, and the original WhatsApp texts/questions it came from. Admin only.
 * GET ?id=<place id>
 */
export async function GET(req: Request) {
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

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: place, error } = await admin.from("places")
    .select("id, name, place_category, address, phone, website, description, attributes, location, is_hidden")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!place) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: reviews }, { data: sources }] = await Promise.all([
    admin.from("place_reviews").select("text, rating, created_at").eq("place_id", id).eq("is_hidden", false)
      .order("created_at", { ascending: false }).limit(50),
    admin.from("whatsapp_import_staging").select("place_name, recommendation_text, source_messages, message_date, status")
      .or(`existing_place_id.eq.${id},created_place_id.eq.${id}`).neq("status", "rejected")
      .order("message_date", { ascending: false }).limit(50),
  ]);

  const attrs = (place.attributes ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    place: {
      id: place.id,
      name: place.name,
      category: place.place_category,
      specialty: typeof attrs.specialty === "string" ? attrs.specialty : null,
      address: place.address,
      phone: place.phone,
      website: place.website,
      description: place.description,
      has_pin: place.location != null,
      is_hidden: place.is_hidden,
    },
    reviews: reviews ?? [],
    sources: sources ?? [],
  });
}
