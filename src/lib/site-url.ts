/**
 * Canonical site origin for server-side metadata (`metadataBase`, OG `url`, etc.).
 *
 * Does **not** affect the in-app "Copy link" button in `GanDetail`, which uses
 * `window.location.origin` (correct for Vercel Preview / staging tabs).
 *
 * Precedence:
 * 1. `NEXT_PUBLIC_SITE_URL` — use for production; omit or point to preview on Preview deploys if needed.
 * 2. `VERCEL_BRANCH_URL` — full URL for the current branch deployment (Preview).
 * 3. `VERCEL_URL` — host-only for this deployment (Preview / Production on Vercel).
 * 4. `http://localhost:3000` — local dev only.
 */
export function getSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const branchUrl = process.env.VERCEL_BRANCH_URL?.trim();
  if (branchUrl) return branchUrl.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}
