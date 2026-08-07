import "server-only";

// Normalized Levenshtein similarity (0..1). Strips quotes/diacritics-adjacent
// punctuation that WhatsApp recs often vary on (e.g. גן שקד vs גן "שקד").
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/["'׳״]/g, "").replace(/\s+/g, " ");
}

export function nameSimilarity(a: string, b: string): number {
  const s = normalize(a);
  const t = normalize(b);
  if (s === t) return 1;
  if (!s || !t) return 0;
  const m = s.length, n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s[i - 1] === t[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

// Looks for an existing place in the same category whose name closely matches
// — used at triage-approval time so two independent WhatsApp recs for the
// same business don't silently create two place rows.
export async function findSimilarPlace(
  admin: any,
  category: string,
  name: string,
  minSimilarity = 0.82
): Promise<{ id: string; name: string; address: string | null } | null> {
  const { data } = await admin.from("places").select("id, name, address").eq("place_category", category);
  let best: { id: string; name: string; address: string | null; sim: number } | null = null;
  for (const p of (data ?? []) as { id: string; name: string; address: string | null }[]) {
    const sim = nameSimilarity(name, p.name);
    if (sim >= minSimilarity && (!best || sim > best.sim)) {
      best = { id: p.id, name: p.name, address: p.address, sim };
    }
  }
  return best ? { id: best.id, name: best.name, address: best.address } : null;
}
