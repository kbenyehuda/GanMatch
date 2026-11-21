import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { requireUser } from "@/lib/server/place-owners";
import { noStoreFetch, privateJson } from "@/lib/server/no-store";
import { DAILY_POINT_CAP, POINT_VALUES, pointsForUser } from "@/lib/server/points";

export const dynamic = "force-dynamic";

// GET /api/account/points — the signed-in person's points (counted from approved contributions)
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const db = createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL!, serverEnv.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: noStoreFetch },
  });
  const summary = await pointsForUser(db, auth.user.id);
  return privateJson({ ...summary, values: POINT_VALUES, dailyCap: DAILY_POINT_CAP });
}
