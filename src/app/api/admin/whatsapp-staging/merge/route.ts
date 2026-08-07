import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { nameSimilarity as similarity } from "@/lib/dedupe";
import * as crypto from "crypto";

function findGroups(records: { id: string; place_name: string }[], minSim: number): string[][] {
  const clusters: { id: string; name: string }[][] = [];
  for (const rec of records) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some(c => similarity(rec.place_name, c.name) >= minSim)) {
        cluster.push({ id: rec.id, name: rec.place_name });
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([{ id: rec.id, name: rec.place_name }]);
  }
  return clusters.filter(c => c.length >= 2).map(c => c.map(x => x.id));
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

  let body: any = {};
  try { body = await req.json(); } catch { /* no body is fine */ }
  const minSim: number = typeof body?.min_similarity === "number" ? body.min_similarity : 0.82;

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const { data: records, error } = await admin.from("whatsapp_import_staging").select("id,place_name,category").eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear existing merge_group_id on pending records (idempotent re-runs)
  const allIds = (records ?? []).map((r: any) => r.id);
  if (allIds.length > 0) {
    await admin.from("whatsapp_import_staging").update({ merge_group_id: null }).in("id", allIds);
  }

  const byCategory: Record<string, { id: string; place_name: string }[]> = {};
  for (const r of records ?? []) byCategory[r.category] = [...(byCategory[r.category] ?? []), r];

  let totalGroups = 0, totalAffected = 0;
  const groupsSummary: { category: string; group_id: string; names: string[] }[] = [];

  for (const [category, recs] of Object.entries(byCategory)) {
    const groups = findGroups(recs, minSim);
    for (const groupIds of groups) {
      const gid = crypto.randomUUID();
      await admin.from("whatsapp_import_staging").update({ merge_group_id: gid }).in("id", groupIds);
      const names = groupIds.map(id => recs.find(r => r.id === id)?.place_name ?? id);
      groupsSummary.push({ category, group_id: gid, names });
      totalGroups++;
      totalAffected += groupIds.length;
    }
  }

  return NextResponse.json({ groups_created: totalGroups, records_affected: totalAffected, groups: groupsSummary });
}
