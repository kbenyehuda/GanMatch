"use client";

import { KIDS_FIELD_LABELS, formatKidsValue } from "@/lib/kids-attributes";
import { BASIC_FIELD_LABELS, formatBasicValue } from "@/lib/place-basic-details";
import { OwnerLabels, type OwnerContextView } from "@/components/admin/OwnerLabels";
import {
  Banner, DecisionBar, DiffRow, EmptyState, FocusBanner, InboxCard, InboxShell, InboxStyles, InboxTabs,
  QuietLink, ReasonField, SkippedToggle, relTime, useInboxQueue, type InboxBase,
} from "@/components/admin/inbox";

const fieldLabel = (k: string) => KIDS_FIELD_LABELS[k] ?? BASIC_FIELD_LABELS[k] ?? k;
const fieldValue = (k: string, v: unknown) => (k in KIDS_FIELD_LABELS ? formatKidsValue(k, v) : formatBasicValue(k, v));

type QueueItem = InboxBase & {
  place_id: string;
  user_id: string | null;
  changes: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  places?: { name?: string | null; address?: string | null; place_category?: string | null } | null;
  user_email?: string | null;
  owner?: OwnerContextView | null;
};

const nameOf = (i: QueueItem) => i.places?.name || "המקום";

// "ערכו פרטים" requests: a parent's changes to a place wait here until approved.
export default function AdminPlaceDetailRequestsPage() {
  const q = useInboxQueue<QueueItem>({
    listUrl: "/api/admin/place-detail-requests",
    decisionUrl: "/api/admin/place-detail-requests/decision",
    skipKey: "detail_requests",
    seenKey: "detail",
    nameOf,
  });
  const { decide, busyId } = q;

  if (q.loading) return <div className="p-6">טוען...</div>;
  if (!q.user) return <div className="p-6">יש להתחבר כדי לגשת לכלי הניהול.</div>;

  return (
    <InboxShell title="בקשות עדכון פרטים">
      <InboxStyles />
      <InboxTabs tab={q.tab} onChange={q.setTab} counts={q.counts} onRefresh={q.reload} reloading={q.reloading} />
      {q.error && <div style={{ background: "#FEE4E2", color: "#B42318", borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{q.error}</div>}
      {q.focusId && <FocusBanner onShowAll={q.showAll} />}
      {!q.focusId && q.tab !== "approved" && q.tab !== "declined" && (
        <SkippedToggle count={q.skippedCount} show={q.showHidden} onToggle={() => q.setShowHidden((v) => !v)} />
      )}

      {q.visible.length === 0 && !q.reloading && <EmptyState tab={q.tab} />}

      {q.visible.map(({ item, state }) => {
        const removal = item.changes?.remove_listing === true;
        const ownerLive = !!item.auto_applied && !item.reverted_at;
        const stamp = state === "pending" ? null : relTime(item.reverted_at ?? item.reviewed_at ?? item.created_at);
        const hasBanner = item.auto_applied || removal || item.owner;
        const banner = hasBanner ? (
          <div className="flex flex-col gap-2">
            {item.auto_applied && (
              <Banner tone={item.reverted_at ? "red" : "green"}>
                {item.reverted_at ? "אושר אוטומטית (בעל/ת המקום) · בוטל" : "אושר אוטומטית – בעל/ת המקום. כבר באתר"}
              </Banner>
            )}
            {removal && (
              <Banner tone="red">
                {state === "pending"
                  ? "בקשה להסרת הרישום. המקום כבר מוסתר מהאתר. אישור ישאיר אותו מוסתר, דחייה תחזיר אותו (המידע לא נמחק)."
                  : "בקשה להסרת הרישום."}
              </Banner>
            )}
            <OwnerLabels owner={item.owner} />
          </div>
        ) : null;
        const before = (k: string) => fieldValue(k, item.previous?.[k]);
        return (
          <InboxCard key={item.id} state={state} name={nameOf(item)} chip={item.places?.place_category}
            meta={<>{relTime(item.created_at)} · {item.user_email || item.user_id || "—"}</>}
            stamp={stamp} banner={banner}
            footer={
              state === "pending" ? (
                ownerLive ? (
                  <DecisionBar busy={busyId === item.id} approveLabel="ראיתי, להשאיר" declineLabel="ביטול השינוי"
                    onApprove={() => decide(item, "seen")} onDecline={() => decide(item, "revert")}
                    extra={<ReasonField value={q.reasonById[item.id] ?? ""} onChange={(v) => q.setReasonById((p) => ({ ...p, [item.id]: v }))} />} />
                ) : (
                  <DecisionBar busy={busyId === item.id} onApprove={() => decide(item, "approve")} onDecline={() => decide(item, "reject")}
                    extra={
                      <div className="flex items-center justify-between">
                        <ReasonField value={q.reasonById[item.id] ?? ""} onChange={(v) => q.setReasonById((p) => ({ ...p, [item.id]: v }))} />
                        <button onClick={() => q.toggleHidden(item.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "#6B7689", fontSize: 12.5, fontWeight: 600, padding: "8px 0 0" }}>
                          {q.hiddenIds.has(item.id) ? "החזרה לתור" : "דילוג"}
                        </button>
                      </div>
                    } />
                )
              ) : state === "approved" ? (
                item.auto_applied
                  ? <QuietLink disabled={busyId === item.id} onClick={() => decide(item, "revert")}>ביטול השינוי (החזרה לערכים הקודמים)</QuietLink>
                  : <QuietLink disabled={busyId === item.id} onClick={() => decide(item, "reopen")}>ביטול אישור (החזרה להמתנה)</QuietLink>
              ) : (
                item.auto_applied ? null : <QuietLink disabled={busyId === item.id} onClick={() => decide(item, "reopen")}>שחזור לממתין</QuietLink>
              )
            }>
            {Object.keys(item.changes ?? {}).filter((k) => k !== "remove_listing").map((key) => (
              <DiffRow key={key} state={state} label={fieldLabel(key)} before={before(key)} after={fieldValue(key, item.changes[key])} />
            ))}
            {state !== "pending" && item.moderation_reason && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#6B7689" }}>סיבה: {item.moderation_reason}</div>
            )}
          </InboxCard>
        );
      })}
      {q.toastNode}
    </InboxShell>
  );
}
