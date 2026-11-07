"use client";

/** Same shape as OwnerContext in src/lib/server/place-owners.ts (server-only there). */
export interface OwnerContextView {
  claim_status: "pending" | "approved" | "declined" | "revoked" | null;
  other_places: { name: string; status: string }[];
  approved_edits: number;
  owner_edits: number;
  first_approved_at: string | null;
  last_approved_at: string | null;
}

const CLAIM_LABEL: Record<string, { text: string; bg: string; color: string }> = {
  pending: { text: "ביקש/ה בעלות: ממתין", bg: "#FBF1D8", color: "#8A6D00" },
  approved: { text: "ביקש/ה בעלות: אושר", bg: "#DCF3E6", color: "#1D7F4F" },
  declined: { text: "ביקש/ה בעלות: נדחה", bg: "#FEE4E2", color: "#B42318" },
  revoked: { text: "ביקש/ה בעלות: אושר ← בוטל", bg: "#FEE4E2", color: "#B42318" },
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null;
}

/** Ownership labels and edit history for one person on one place (admin queues). */
export function OwnerLabels({ owner }: { owner: OwnerContextView | null | undefined }) {
  if (!owner) return null;
  const claim = owner.claim_status ? CLAIM_LABEL[owner.claim_status] : null;
  const first = daysAgo(owner.first_approved_at);
  const last = daysAgo(owner.last_approved_at);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-hebrew" dir="rtl">
      {claim && (
        <span className="rounded px-2 py-0.5 font-bold" style={{ background: claim.bg, color: claim.color }}>{claim.text}</span>
      )}
      {owner.other_places.map((p) => (
        <span key={p.name} className="rounded px-2 py-0.5 font-bold" style={{ background: "#FEE4E2", color: "#B42318" }}>
          {p.status === "approved" ? `בעל/ת ${p.name}` : `ביקש/ה בעלות על ${p.name}`} (אותה קטגוריה)
        </span>
      ))}
      <span className="rounded px-2 py-0.5 bg-gray-100 text-gray-700">
        {owner.approved_edits === 0
          ? "אין עריכות שאושרו"
          : `${owner.approved_edits} עריכות שאושרו · הראשונה לפני ${first} ימים · האחרונה לפני ${last} ימים`}
        {owner.owner_edits > 0 ? ` · ${owner.owner_edits} עריכות כבעלים` : ""}
      </span>
    </div>
  );
}
