import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/require-admin";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const CATEGORIES = new Set(["kids", "doctor", "cosmetics", "cafe", "sport", "attraction", "food"]);

// GET /api/admin/analytics?days=1|7|30|0&category=kids — analytics_summary() for the range, plus the
// previous range of the same length (for trends), with signed-in people's names/emails from auth.users.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const daysRaw = Number(params.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) && daysRaw >= 0 ? Math.min(daysRaw, 3650) : 7;
  const category = CATEGORIES.has(params.get("category") ?? "") ? params.get("category") : null;

  const now = Date.now();
  const until = new Date(now);
  const since = days === 0 ? new Date(0) : new Date(now - days * 86_400_000);
  const prevSince = new Date(now - 2 * days * 86_400_000);

  const [cur, prev] = await Promise.all([
    auth.admin.rpc("analytics_summary", { p_since: since.toISOString(), p_until: until.toISOString(), p_category: category }),
    days === 0
      ? Promise.resolve({ data: null, error: null })
      : auth.admin.rpc("analytics_summary", { p_since: prevSince.toISOString(), p_until: since.toISOString(), p_category: category }),
  ]);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  const data = cur.data;

  const ids = new Set<string>();
  for (const p of (data?.people ?? []) as { person: string }[]) if (UUID_RE.test(p.person)) ids.add(p.person);
  for (const r of (data?.recent ?? []) as { person: string }[]) if (UUID_RE.test(r.person)) ids.add(r.person);

  const users: Record<string, { name: string | null; email: string | null }> = {};
  await Promise.all(
    Array.from(ids).map(async (id) => {
      const { data: u } = await auth.admin.auth.admin.getUserById(id);
      if (!u?.user) return;
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      const name = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
      users[id] = { name: name ?? null, email: u.user.email ?? null };
    })
  );

  return NextResponse.json({ ...data, prev_pulse: prev.data?.pulse ?? null, users, days, category });
}
