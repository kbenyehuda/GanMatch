"use client";

import { useCallback } from "react";
import { isInGivatayim } from "@/lib/place-location";
import { OwnerLabels, type OwnerContextView } from "@/components/admin/OwnerLabels";
import {
  Banner, DecisionBar, EmptyState, FocusBanner, InboxBase, InboxCard, InboxShell, InboxStyles, InboxTabs,
  QuietLink, ReasonField, SkippedToggle, relTime, useInboxQueue,
} from "@/components/admin/inbox";

type QueueItem = InboxBase & {
  place_id: string;
  user_id: string | null;
  requested_lat: number;
  requested_lon: number;
  requested_address: string | null;
  note: string | null;
  previous_lat: number | null;
  previous_lon: number | null;
  previous_address: string | null;
  places?: { name?: string | null; address?: string | null; place_category?: string | null } | null;
  user_email?: string | null;
  owner?: OwnerContextView | null;
};

function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtMeters = (m: number) => (m < 1000 ? `${Math.round(m)} מטר` : `${(m / 1000).toFixed(1)} ק״מ`);

/** Old pin (gray) and new pin (blue) joined by a line, as a Mapbox static image. */
function PinMoveMap({ item, dim }: { item: QueueItem; dim: boolean }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasOld = item.previous_lat != null && item.previous_lon != null;
  if (!token) return null;
  const nw = `${item.requested_lon},${item.requested_lat}`;
  const overlays: string[] = [];
  if (hasOld) {
    const line = {
      type: "Feature", properties: { stroke: "#64748b", "stroke-width": 3, "stroke-opacity": 0.8 },
      geometry: { type: "LineString", coordinates: [[item.previous_lon, item.previous_lat], [item.requested_lon, item.requested_lat]] },
    };
    overlays.push(`geojson(${encodeURIComponent(JSON.stringify(line))})`);
    overlays.push(`pin-s+9ca3af(${item.previous_lon},${item.previous_lat})`);
  }
  overlays.push(`pin-l+2563eb(${nw})`);
  const view = hasOld ? "auto" : `${nw},16`;
  const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(",")}/${view}/640x280@2x?padding=50&access_token=${token}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="מפה: המיקום הישן והחדש" loading="lazy"
      style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, border: "1px solid #E5E9F0", filter: dim ? "grayscale(.6)" : "none", display: "block" }} />
  );
}

const nameOf = (i: QueueItem) => i.places?.name || "המקום";

// Pin-move requests: someone says the pin of a place is in the wrong spot.
export default function AdminPlaceLocationRequestsPage() {
  const q = useInboxQueue<QueueItem>({
    listUrl: "/api/admin/place-location-requests",
    decisionUrl: "/api/admin/place-location-requests/decision",
    skipKey: "location_requests",
    seenKey: "location",
    nameOf,
  });
  const { decide, busyId } = q;
  const reasonFor = useCallback((id: string) => q.reasonById[id] ?? "", [q.reasonById]);

  if (q.loading) return <div className="p-6">טוען...</div>;
  if (!q.user) return <div className="p-6">יש להתחבר כדי לגשת לכלי הניהול.</div>;

  return (
    <InboxShell title="בקשות שינוי מיקום">
      <InboxStyles />
      <InboxTabs tab={q.tab} onChange={q.setTab} counts={q.counts} onRefresh={q.reload} reloading={q.reloading} />
      {q.error && <div style={{ background: "#FEE4E2", color: "#B42318", borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{q.error}</div>}
      {q.focusId && <FocusBanner onShowAll={q.showAll} />}
      {!q.focusId && q.tab !== "approved" && q.tab !== "declined" && (
        <SkippedToggle count={q.skippedCount} show={q.showHidden} onToggle={() => q.setShowHidden((v) => !v)} />
      )}

      {q.visible.length === 0 && !q.reloading && <EmptyState tab={q.tab} />}

      {q.visible.map(({ item, state }) => {
        const moved = item.previous_lat != null && item.previous_lon != null
          ? metersBetween(item.previous_lat, item.previous_lon, item.requested_lat, item.requested_lon) : null;
        const ownerLive = !!item.auto_applied && !item.reverted_at;
        const stamp = state === "pending" ? relTime(item.created_at) : relTime(item.reverted_at ?? item.reviewed_at ?? item.created_at);
        const outside = !isInGivatayim(item.requested_lat, item.requested_lon);
        const banner = (
          <div className="flex flex-col gap-2">
            {item.auto_applied && (
              <Banner tone={item.reverted_at ? "red" : "green"}>
                {item.reverted_at ? "אושר אוטומטית (בעל/ת המקום) · בוטל" : "אושר אוטומטית – בעל/ת המקום. כבר באתר"}
              </Banner>
            )}
            {outside && <Banner tone="red">מחוץ לגבעתיים</Banner>}
            <OwnerLabels owner={item.owner} />
          </div>
        );
        return (
          <InboxCard key={item.id} state={state} name={nameOf(item)} chip={item.places?.place_category}
            meta={<>{relTime(item.created_at)} · {item.user_email || item.user_id || "—"}</>}
            stamp={state === "pending" ? null : stamp}
            banner={item.auto_applied || outside || item.owner ? banner : null}
            footer={
              state === "pending" ? (
                ownerLive ? (
                  <DecisionBar busy={busyId === item.id} approveLabel="ראיתי, להשאיר" declineLabel="ביטול ההזזה"
                    onApprove={() => decide(item, "seen")} onDecline={() => decide(item, "revert")} />
                ) : (
                  <DecisionBar busy={busyId === item.id} onApprove={() => decide(item, "approve")} onDecline={() => decide(item, "reject")}
                    extra={
                      <div className="flex items-center justify-between">
                        <ReasonField value={reasonFor(item.id)} onChange={(v) => q.setReasonById((p) => ({ ...p, [item.id]: v }))} />
                        <button onClick={() => q.toggleHidden(item.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "#6B7689", fontSize: 12.5, fontWeight: 600, padding: "8px 0 0" }}>
                          {q.hiddenIds.has(item.id) ? "החזרה לתור" : "דילוג"}
                        </button>
                      </div>
                    } />
                )
              ) : state === "approved" ? (
                item.auto_applied ? null : <QuietLink disabled={busyId === item.id} onClick={() => decide(item, "reopen")}>ביטול אישור (החזרה להמתנה)</QuietLink>
              ) : (
                item.auto_applied ? null : <QuietLink disabled={busyId === item.id} onClick={() => decide(item, "reopen")}>שחזור לממתין</QuietLink>
              )
            }>
            {item.note && (
              <div style={{ background: "#FFF7E6", border: "1px solid #F5D9A0", borderRadius: 10, padding: "8px 11px", fontSize: 14, color: "#5C3D00", marginBottom: 10 }}>
                <strong>הערה: </strong>{item.note}
              </div>
            )}
            <PinMoveMap item={item} dim={state === "declined"} />
            <div className="flex flex-wrap items-center gap-2" style={{ margin: "10px 0 4px" }}>
              {moved != null && (
                <span style={{ background: moved > 300 ? "#FFF4E0" : "#E8F7EE", color: moved > 300 ? "#7A4A00" : "#166534", borderRadius: 99, padding: "4px 12px", fontSize: 13, fontWeight: 800 }}>
                  הוזז ב-{fmtMeters(moved)}
                </span>
              )}
              <a href={`https://www.google.com/maps?q=${item.requested_lat},${item.requested_lon}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, fontWeight: 700, color: "#1F5BB5" }}>פתיחה ב-Google Maps ↗</a>
            </div>
            <AddrRow label="עכשיו" value={item.previous_address || (item.previous_lat == null ? "אין מיקום במערכת" : "—")} state={state} role="old" />
            <AddrRow label="מבוקש" value={item.requested_address || `${item.requested_lat.toFixed(5)}, ${item.requested_lon.toFixed(5)}`} state={state} role="new" />
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

function AddrRow({ label, value, state, role }: { label: string; value: string; state: "pending" | "approved" | "declined"; role: "old" | "new" }) {
  const struck = (role === "old" && state === "approved") || (role === "new" && state === "declined");
  const highlight = role === "new" && state === "pending";
  return (
    <div className="flex items-center gap-2" style={{ padding: "7px 0", borderTop: "1px solid #EEF1F6" }}>
      <div style={{ flex: "0 0 22%", fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: struck ? (state === "declined" ? "#FB7185" : "#9CA3AF") : role === "old" ? "#6B7689" : "#047857",
        textDecoration: struck ? "line-through" : "none", fontWeight: role === "new" ? 800 : 500,
        ...(highlight ? { background: "#DBEAFE", color: "#1E40AF", borderRadius: 8, padding: "2px 8px", display: "inline-block" } : null) }}>
        {value}
      </div>
    </div>
  );
}
