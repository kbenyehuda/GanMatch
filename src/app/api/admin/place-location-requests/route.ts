import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";

type QueueStatus = "pending" | "approved" | "rejected";

function parseLimit(raw: string | null, fallback = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 500);
}

// GET /api/admin/place-location-requests?status=pending&limit=100
export async function GET(req: Request) {
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

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!serverEnv.ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  await ensureAdminFullAccessForUser({ userId: userData.user.id, email });

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") ?? "pending").trim();
  const status: QueueStatus | null =
    statusParam === "pending" || statusParam === "approved" || statusParam === "rejected"
      ? (statusParam as QueueStatus)
      : null;
  const limit = parseLimit(searchParams.get("limit"));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let query = admin
    .from("place_location_requests")
    .select(
      "id,place_id,user_id,requested_lat,requested_lon,requested_address,note,previous_lat,previous_lon,previous_address,status,moderation_reason,created_at,reviewed_at,reviewed_by,places(name,address,place_category)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

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
        const r = await admin.auth.admin.getUserById(userId);
        emailByUserId[userId] = r.data.user?.email ?? null;
      } catch {
        emailByUserId[userId] = null;
      }
    })
  );

  const items = rows.map((row) => ({
    ...row,
    user_email: row.user_id ? emailByUserId[String(row.user_id)] ?? null : null,
  }));

  return NextResponse.json({ items });
}
