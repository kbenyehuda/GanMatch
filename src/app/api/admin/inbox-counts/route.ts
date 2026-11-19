import { requireAdmin } from "@/lib/server/require-admin";
import { privateJson } from "@/lib/server/no-store";

export const dynamic = "force-dynamic";

// GET /api/admin/inbox-counts?location=<ISO>&detail=<ISO>&triage=<ISO>
// For each moderation queue: how many requests are waiting ("pending") and how many of those
// arrived after the admin last opened that queue ("unseen"; all of them if no time is given).
// Read-only, counts only.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const { admin } = auth;

  const { searchParams } = new URL(req.url);
  const since = (key: string): string | null => {
    const raw = searchParams.get(key);
    return raw && Number.isFinite(new Date(raw).getTime()) ? new Date(raw).toISOString() : null;
  };
  // Pending also includes owner edits that went live and weren't seen or undone yet (as in the queue pages)
  const WAITING = "status.eq.pending,and(auto_applied.eq.true,admin_seen_at.is.null,reverted_at.is.null)";

  async function count(table: string, orFilter: string | null, sinceIso: string | null, statusEq?: string): Promise<number> {
    let q = admin.from(table).select("id", { count: "exact", head: true });
    if (orFilter) q = q.or(orFilter);
    if (statusEq) q = q.eq("status", statusEq);
    if (sinceIso) q = q.gt("created_at", sinceIso);
    const { count: n, error } = await q;
    if (error) throw new Error(error.message);
    return n ?? 0;
  }

  try {
    const [lp, lu, dp, du, tp, tu] = await Promise.all([
      count("place_location_requests", WAITING, null),
      count("place_location_requests", WAITING, since("location")),
      count("place_detail_requests", WAITING, null),
      count("place_detail_requests", WAITING, since("detail")),
      count("user_inputs", null, null, "pending"),
      count("user_inputs", null, since("triage"), "pending"),
    ]);
    return privateJson({
      location: { pending: lp, unseen: lu },
      detail: { pending: dp, unseen: du },
      triage: { pending: tp, unseen: tu },
      total_unseen: lu + du + tu,
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
