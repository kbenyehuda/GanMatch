import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { requireAdmin } from "@/lib/server/require-admin";
import { noStoreFetch } from "@/lib/server/no-store";
import { lookupUsers } from "@/lib/server/user-lookup";
import { computePoints } from "@/lib/server/points";

export const dynamic = "force-dynamic";

// GET /api/admin/points — everyone with points, highest first (for the raffle later)
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const db = createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL!, serverEnv.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: noStoreFetch },
  });
  const all = await computePoints(db);
  const rows = Array.from(all.entries())
    .filter(([, s]) => s.points > 0 || s.pending > 0)
    .sort((a, b) => b[1].points - a[1].points || b[1].pending - a[1].pending)
    .slice(0, 200);
  const users = await lookupUsers(db, rows.map(([id]) => id));
  const admins = serverEnv.ADMIN_EMAILS;
  return NextResponse.json({
    items: rows.map(([id, s]) => ({
      user_id: id,
      email: users[id]?.email ?? null,
      name: users[id]?.name ?? null,
      is_admin: admins.has(String(users[id]?.email ?? "").toLowerCase()),
      ...s,
    })),
  });
}
