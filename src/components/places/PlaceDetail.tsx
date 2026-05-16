"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, Globe, Clock, MapPin, Loader2, Send, Navigation } from "lucide-react";
import type { Place, PlaceReview } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS, PLACE_CATEGORY_LABELS, NEIGHBORHOOD_LABELS, HMO_LABELS,
} from "@/types/places";
import { useSession } from "@/lib/useSession";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lightenColor(hex: string, t = 0.35): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const mix = (x: number) => Math.round(x + (255 - x) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function distanceLabel(place: Place, user: { lon: number; lat: number } | null): string | null {
  if (!user) return null;
  const R = 6371e3;
  const dLat = ((place.lat - user.lat) * Math.PI) / 180;
  const dLon = ((place.lon - user.lon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((user.lat * Math.PI) / 180) * Math.cos((place.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
}

// ─── Star input ───────────────────────────────────────────────────────────────

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-2 justify-center py-3.5" dir="ltr">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)} className="transition-transform active:scale-[.85]">
          <svg viewBox="0 0 24 24" style={{ width: 36, height: 36, color: (hover || value) >= n ? "#C8A24B" : "#E5E9F0", fill: (hover || value) >= n ? "#C8A24B" : "none", transition: "color .15s" }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
        </button>
      ))}
    </div>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

const AVA_COLORS = ["#1F5BB5","#E59A2C","#2EA86B","#D86B7D","#9C5BBD"];

function ReviewCard({ review, helpfulIds, onHelpful }: { review: PlaceReview; helpfulIds: Set<string>; onHelpful: (id: string) => void }) {
  const name = review.is_anonymous ? "אנונימי" : review.reviewer_public_name ?? "משתמש";
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
  const avaColor = AVA_COLORS[name.charCodeAt(0) % AVA_COLORS.length];
  const isHelpful = helpfulIds.has(review.id);
  const date = new Date(review.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "short" });

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 14, padding: 14, marginBottom: 8 }}>
      {/* Head */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: "50%", background: avaColor, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif" }}>
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-hebrew font-bold" style={{ fontSize: 13, color: "#0F1A2E" }}>{name}</span>
          </div>
          <div className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>{date}</div>
        </div>
        <span className="flex items-center gap-1" style={{ background: "#E8F0FB", color: "#0A2B6B", padding: "2px 6px", borderRadius: 5, fontSize: 9, fontWeight: 700 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 9, height: 9 }}><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
          מאומת
        </span>
      </div>
      {/* Stars */}
      <div className="flex gap-0.5 mb-1.5" dir="ltr">
        {[1,2,3,4,5].map(n => (
          <svg key={n} viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: review.rating >= n ? "#C8A24B" : "none", color: review.rating >= n ? "#C8A24B" : "#E5E9F0" }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
        ))}
      </div>
      {/* Text */}
      {review.text && <p className="font-hebrew" style={{ fontSize: 13, lineHeight: 1.5, color: "#4A5568" }}>&ldquo;{review.text}&rdquo;</p>}
      {/* Footer */}
      <div className="flex items-center gap-3.5 mt-2.5" style={{ fontSize: 11, color: "#8A95A8", fontWeight: 600 }}>
        <button type="button" onClick={() => onHelpful(review.id)}
          className="flex items-center gap-1" style={{ background: "none", border: 0, cursor: "pointer", color: isHelpful ? "#1F5BB5" : "#8A95A8", fontWeight: 600, fontSize: 11 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
            <path d="M14 9V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-3z"/>
          </svg>
          מועיל
        </button>
      </div>
    </div>
  );
}

// ─── Kids attribute chips ─────────────────────────────────────────────────────

function KidsAttributeChips({ attrs }: { attrs: Record<string, unknown> }) {
  const chips: string[] = [];
  if (attrs.min_age_months != null && attrs.max_age_months != null) {
    const toLabel = (m: number) => m < 24 ? `${m} חודשים` : `${Math.floor(m / 12)} שנים`;
    chips.push(`גיל: ${toLabel(Number(attrs.min_age_months))}–${toLabel(Number(attrs.max_age_months))}`);
  }
  if (attrs.meal_type) chips.push(`ארוחות: ${String(attrs.meal_type)}`);
  if (attrs.has_outdoor_space) chips.push("חצר חיצונית");
  if (attrs.monthly_price_nis) chips.push(`${Number(attrs.monthly_price_nis).toLocaleString("he-IL")} ₪ לחודש`);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {chips.map(c => (
        <span key={c} className="font-hebrew" style={{ fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 8, background: "#E8F0FB", color: "#0A2B6B" }}>
          {c}
        </span>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
  isSaved?: boolean;
  onToggleSave?: () => void;
  onShowToast?: (msg: string) => void;
  userLocation?: { lon: number; lat: number } | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlaceDetail({ place, onClose, isSaved = false, onToggleSave, onShowToast, userLocation = null }: PlaceDetailProps) {
  const { user, session } = useSession();
  const color = PLACE_CATEGORY_COLORS[place.place_category];
  const lightColor = lightenColor(color);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;
  const dist = distanceLabel(place, userLocation);
  const attrs = place.attributes as Record<string, unknown>;

  // Reviews
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [helpfulIds, setHelpfulIds] = useState<Set<string>>(new Set());

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await fetch(`/api/place-reviews?place_id=${encodeURIComponent(place.id)}`);
      const d = await res.json();
      setReviews(d.reviews ?? []);
    } catch { /* silent */ }
    finally { setReviewsLoading(false); }
  }, [place.id]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleHelpful = (id: string) => {
    setHelpfulIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    onShowToast?.("סומן כמועיל");
  };

  // Review form
  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(0);
  const [formText, setFormText] = useState("");
  const [formAnonymous, setFormAnonymous] = useState(true);
  const [formName, setFormName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const submitReview = useCallback(async () => {
    if (formRating === 0 || !user || !session) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch("/api/place-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ place_id: place.id, rating: formRating, text: formText.trim() || null, is_anonymous: formAnonymous, reviewer_public_name: formAnonymous ? null : formName.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשליחה");
      setSubmitSuccess(true); setShowForm(false);
      await loadReviews();
      onShowToast?.("ההמלצה נשלחה! תודה 🙏");
    } catch (e) { setSubmitError(e instanceof Error ? e.message : "שגיאה בשליחה"); }
    finally { setSubmitting(false); }
  }, [formRating, formText, formAnonymous, formName, place.id, user, session, loadReviews, onShowToast]);

  // Tags for detail view
  const detailTags: { label: string; style: React.CSSProperties }[] = [
    { label: PLACE_CATEGORY_LABELS[place.place_category], style: { background: "#E8F0FB", color: "#0A2B6B" } },
  ];
  if (place.hmo?.[0] && HMO_LABELS[place.hmo[0]]) {
    detailTags.push({ label: HMO_LABELS[place.hmo[0]], style: { background: "#FBF1D8", color: "#9C7A21" } });
  }
  if (place.kosher === "CERTIFIED") {
    detailTags.push({ label: "כשר", style: { background: "#DCF3E6", color: "#1D7F4F" } });
  }


  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F6F9FE", borderRadius: "inherit" }} dir="rtl">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div
        className="relative shrink-0"
        style={{
          height: 280,
          background: `linear-gradient(135deg, ${color} 0%, ${lightColor} 100%)`,
          overflow: "hidden",
        }}
      >
        {/* Overlay gradients */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(500px 200px at 80% 20%, rgba(200,162,75,.3), transparent), linear-gradient(180deg, rgba(15,26,46,.0) 50%, rgba(15,26,46,.5))`,
        }} />

        {/* Back button */}
        <button type="button" onClick={onClose}
          className="absolute flex items-center justify-center"
          style={{ top: "calc(var(--safe-top, 0px) + 14px)", insetInlineStart: 14, width: 38, height: 38, borderRadius: 14, background: "rgba(255,255,255,.95)", border: 0, cursor: "pointer", boxShadow: "0 2px 8px rgba(10,43,107,.06)", zIndex: 5 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#0A2B6B" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Action buttons */}
        <div className="absolute flex gap-2" style={{ top: "calc(var(--safe-top, 0px) + 14px)", insetInlineEnd: 14, zIndex: 5 }}>
          {/* Share */}
          <button type="button"
            onClick={() => {
              if (navigator.share) navigator.share({ title: place.name, url: location.href }).catch(() => {});
              else { navigator.clipboard?.writeText(location.href).catch(() => {}); onShowToast?.("קישור הועתק"); }
            }}
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: 14, background: "rgba(255,255,255,.95)", border: 0, cursor: "pointer", boxShadow: "0 2px 8px rgba(10,43,107,.06)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0A2B6B" strokeWidth="2" style={{ width: 16, height: 16 }}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          {/* Save */}
          {onToggleSave && (
            <button type="button"
              onClick={() => { onToggleSave(); onShowToast?.(isSaved ? "הוסר מהמועדפים" : "נשמר למועדפים"); }}
              className="flex items-center justify-center"
              style={{ width: 38, height: 38, borderRadius: 14, background: isSaved ? "#D86B7D" : "rgba(255,255,255,.95)", border: 0, cursor: "pointer", boxShadow: "0 2px 8px rgba(10,43,107,.06)" }}>
              <svg viewBox="0 0 24 24" fill={isSaved ? "#fff" : "none"} stroke={isSaved ? "#fff" : "#0A2B6B"} strokeWidth="2" style={{ width: 16, height: 16 }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Image pager dots */}
        <div className="absolute flex gap-1.5" style={{ bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 3 }}>
          {[0,1,2,3].map(i => (
            <span key={i} style={{ height: 3, borderRadius: 2, background: i === 0 ? "#fff" : "rgba(255,255,255,.5)", width: i === 0 ? 28 : 22, transition: "all .2s" }} />
          ))}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 120 }}>
        <div style={{ padding: 20 }}>

          {/* Tags */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {detailTags.map(t => (
              <span key={t.label} className="font-hebrew" style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, ...t.style }}>
                {t.label}
              </span>
            ))}
          </div>

          {/* Name */}
          <div className="flex items-center gap-2 mb-1" style={{ fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", fontSize: 24, fontWeight: 800, color: "#0F1A2E", lineHeight: 1.15 }}>
            {place.name}
            {place.is_verified && (
              <svg viewBox="0 0 24 24" fill="none" stroke="#1F5BB5" strokeWidth="2.5" style={{ width: 18, height: 18, flexShrink: 0 }}>
                <circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>
              </svg>
            )}
          </div>

          {/* Sub */}
          <div className="font-hebrew mb-3.5" style={{ fontSize: 13, color: "#8A95A8" }}>
            {[place.address?.split(",")[0], neighborhood, dist ? `${dist} ממך` : null].filter(Boolean).join(" · ")}
          </div>

          {/* Stats box */}
          <div className="flex mb-4" style={{ background: "linear-gradient(135deg,#F4F8FE,#E8F0FB)", borderRadius: 18, padding: 14 }}>
            <div className="flex-1 text-center">
              <div style={{ fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", fontSize: 20, fontWeight: 800, color: "#0A2B6B", lineHeight: 1 }}>
                {place.avg_rating?.toFixed(1) ?? "—"}
              </div>
              <div className="font-hebrew" style={{ fontSize: 10, color: "#8A95A8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 5 }}>דירוג</div>
            </div>
            <div style={{ width: 1, background: "rgba(31,91,181,.15)", margin: "4px 0" }} />
            <div className="flex-1 text-center">
              <div style={{ fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", fontSize: 20, fontWeight: 800, color: "#0A2B6B", lineHeight: 1 }}>
                {place.rec_count}
              </div>
              <div className="font-hebrew" style={{ fontSize: 10, color: "#8A95A8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 5 }}>המלצות</div>
            </div>
          </div>

          {/* Detail rows */}
          {place.hours && (
            <div className="flex items-start gap-3" style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0" }}>
              <Clock style={{ width: 18, height: 18, color: "#1F5BB5", flexShrink: 0, marginTop: 1 }} />
              <div>
                <span className="font-hebrew block" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 2 }}>שעות פעילות</span>
                <strong className="font-hebrew" style={{ fontSize: 13, fontWeight: 600, color: "#0F1A2E" }}>{place.hours}</strong>
              </div>
            </div>
          )}
          {place.phone?.map(p => (
            <a key={p} href={`tel:${p}`} className="flex items-start gap-3 block" style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0", textDecoration: "none" }}>
              <Phone style={{ width: 18, height: 18, color: "#1F5BB5", flexShrink: 0, marginTop: 1 }} />
              <div>
                <span className="font-hebrew block" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 2 }}>טלפון</span>
                <strong style={{ fontSize: 13, fontWeight: 600, color: "#0A2B6B" }}>{p}</strong>
              </div>
            </a>
          ))}
          {place.address && (
            <div className="flex items-start gap-3" style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0" }}>
              <MapPin style={{ width: 18, height: 18, color: "#1F5BB5", flexShrink: 0, marginTop: 1 }} />
              <div>
                <span className="font-hebrew block" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 2 }}>כתובת</span>
                <strong className="font-hebrew" style={{ fontSize: 13, fontWeight: 600, color: "#0F1A2E" }}>{place.address}</strong>
              </div>
            </div>
          )}
          {place.website && (
            <a href={/^https?:\/\//i.test(place.website) ? place.website : `https://${place.website}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 block" style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0", textDecoration: "none" }}>
              <Globe style={{ width: 18, height: 18, color: "#1F5BB5", flexShrink: 0, marginTop: 1 }} />
              <div>
                <span className="font-hebrew block" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 2 }}>אתר</span>
                <strong style={{ fontSize: 13, fontWeight: 600, color: "#0A2B6B" }}>{place.website.replace(/^https?:\/\//, "")}</strong>
              </div>
            </a>
          )}

          {/* HMO */}
          {place.place_category === "doctor" && !!place.hmo?.length && (
            <div style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0" }}>
              <span className="font-hebrew block mb-2" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>קופות חולים</span>
              <div className="flex flex-wrap gap-1.5">
                {place.hmo.map(h => (
                  <span key={h} className="font-hebrew font-semibold" style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: "#E8F0FB", color: "#0A2B6B" }}>{HMO_LABELS[h] ?? h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Kids attrs */}
          {place.place_category === "kids" && Object.keys(attrs).length > 0 && (
            <div style={{ padding: "14px 0", borderTop: "1px solid #E5E9F0" }}>
              <span className="font-hebrew block mb-2" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>פרטים נוספים</span>
              <KidsAttributeChips attrs={attrs} />
            </div>
          )}

          {/* About */}
          {place.description && (
            <div style={{ paddingTop: 16, borderTop: "1px solid #E5E9F0", marginTop: 6 }}>
              <h4 className="font-hebrew" style={{ fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>אודות</h4>
              <p className="font-hebrew" style={{ fontSize: 13, lineHeight: 1.55, color: "#4A5568" }}>{place.description}</p>
            </div>
          )}

          {/* Reviews section */}
          <div style={{ paddingTop: 16, borderTop: "1px solid #E5E9F0", marginTop: 6 }}>
            <h4 className="font-hebrew" style={{ fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
              המלצות {reviews.length > 0 && <span style={{ fontWeight: 600, color: "#8A95A8", fontSize: 12 }}>{reviews.length}</span>}
            </h4>

            {reviewsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin" style={{ width: 20, height: 20, color: "#0A2B6B" }} /></div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8">
                <span style={{ fontSize: 32 }}>💬</span>
                <p className="font-hebrew text-sm mt-2" style={{ color: "#8A95A8" }}>אין המלצות עדיין</p>
                <p className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8" }}>היה/י הראשון/ה להמליץ!</p>
              </div>
            ) : (
              reviews.map(r => <ReviewCard key={r.id} review={r} helpfulIds={helpfulIds} onHelpful={handleHelpful} />)
            )}

            {submitSuccess && (
              <div className="font-hebrew text-sm text-center py-3 rounded-xl mb-3" style={{ background: "#DCF3E6", color: "#1D7F4F", fontWeight: 600 }}>
                ההמלצה נשלחה! תודה רבה 🙏
              </div>
            )}

            {!submitSuccess && user && !showForm && (
              <button type="button" onClick={() => setShowForm(true)}
                className="w-full font-hebrew font-bold flex items-center justify-center gap-2"
                style={{ padding: "13px 0", borderRadius: 14, marginTop: 4, background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)", color: "#fff", fontSize: 14, border: "none", cursor: "pointer", boxShadow: "0 6px 16px rgba(10,43,107,.25)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                </svg>
                כתוב/י המלצה
              </button>
            )}

            {!user && (
              <p className="font-hebrew text-xs text-center py-3" style={{ color: "#8A95A8" }}>התחבר/י כדי לכתוב המלצה</p>
            )}

            {showForm && (
              <div className="mt-3 p-4 rounded-2xl" style={{ background: "#F6F9FE", border: "1px solid #E5E9F0" }}>
                <h5 className="font-hebrew font-bold text-sm mb-3" style={{ color: "#0A2B6B" }}>ההמלצה שלך</h5>
                <StarInput value={formRating} onChange={setFormRating} />
                <textarea value={formText} onChange={e => setFormText(e.target.value)}
                  placeholder="שתף/י את הניסיון שלך..." rows={3} className="w-full font-hebrew text-sm resize-none"
                  style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12, padding: "10px 12px", outline: "none", color: "#0F1A2E", lineHeight: 1.6, width: "100%", boxSizing: "border-box" }} />
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={formAnonymous} onChange={e => setFormAnonymous(e.target.checked)} style={{ accentColor: "#0A2B6B" }} />
                  <span className="font-hebrew text-xs" style={{ color: "#4A5568" }}>שלח/י באנונימיות</span>
                </label>
                {!formAnonymous && (
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                    placeholder="שם לתצוגה (אופציונלי)" className="w-full font-hebrew text-sm mt-2"
                    style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12, padding: "9px 12px", outline: "none", color: "#0F1A2E", width: "100%", boxSizing: "border-box" }} />
                )}
                {submitError && <p className="font-hebrew text-xs mt-1.5" style={{ color: "#C53030" }}>{submitError}</p>}
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={submitReview} disabled={formRating === 0 || submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 font-hebrew font-bold text-sm"
                    style={{ padding: "10px 0", borderRadius: 12, background: formRating === 0 ? "#C5CDD8" : "linear-gradient(135deg, #0A2B6B, #1F5BB5)", color: "#fff", border: "none", cursor: formRating === 0 ? "not-allowed" : "pointer" }}>
                    {submitting ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <><Send style={{ width: 13, height: 13 }} />שלח</>}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setFormRating(0); setFormText(""); setSubmitError(null); }}
                    className="font-hebrew font-semibold text-sm px-4"
                    style={{ borderRadius: 12, background: "#fff", border: "1px solid #E5E9F0", color: "#4A5568", cursor: "pointer" }}>
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Bottom CTA bar ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 flex gap-2"
        style={{ padding: "14px 18px calc(22px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(180deg,transparent,#F6F9FE 30%)", zIndex: 6 }}
      >
        {/* Directions */}
        <button type="button"
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`, "_blank")}
          className="flex-1 flex items-center justify-center gap-2 font-hebrew font-bold"
          style={{ padding: 14, borderRadius: 16, background: "#0A2B6B", color: "#fff", fontSize: 14, border: "none", cursor: "pointer", boxShadow: "0 10px 22px rgba(10,43,107,.3)" }}>
          <Navigation style={{ width: 16, height: 16 }} />
          ניווט
        </button>
        {/* Call */}
        {place.phone?.[0] && (
          <a href={`tel:${place.phone[0]}`}
            className="flex items-center justify-center"
            style={{ width: 52, background: "#fff", border: "1px solid #E5E9F0", borderRadius: 16, textDecoration: "none" }}>
            <Phone style={{ width: 18, height: 18, color: "#0A2B6B" }} />
          </a>
        )}
      </div>
    </div>
  );
}
