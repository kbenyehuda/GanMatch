import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Names/emails of signed-in users for the admin analytics page. It used to ask Auth about every person
// one by one on every page load (about 140 requests each time, which competed with real visitors during the
// 2026-11-18 launch). Now: a short in-memory cache, and one paged listing when many are missing.

type Info = { name: string | null; email: string | null };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; info: Info }>();

const toInfo = (u: { email?: string | null; user_metadata?: unknown }): Info => {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  return { name: name ?? null, email: u.email ?? null };
};

export async function lookupUsers(admin: SupabaseClient, ids: string[]): Promise<Record<string, Info>> {
  const now = Date.now();
  const out: Record<string, Info> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) out[id] = hit.info;
    else missing.push(id);
  }
  if (!missing.length) return out;

  try {
    if (missing.length > 8) {
      // Many at once: one paged listing instead of one request per person
      const want = new Set(missing);
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        const users = data?.users ?? [];
        for (const u of users) {
          const info = toInfo(u);
          cache.set(u.id, { at: now, info });
          if (want.has(u.id)) out[u.id] = info;
        }
        if (users.length < 1000) break;
      }
    } else {
      await Promise.all(missing.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (!data?.user) return;
        const info = toInfo(data.user);
        cache.set(id, { at: now, info });
        out[id] = info;
      }));
    }
  } catch (e) {
    console.error("[user-lookup] failed:", e); // names are a nicety: the page still works without them
  }
  return out;
}
