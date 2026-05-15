"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Star, Phone, Globe, Clock, MapPin,
  BadgeCheck, ChevronLeft, Send, Loader2,
} from "lucide-react";
import type { Place } from "@/types/places";
import type { PlaceReview } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
  HMO_LABELS,
} from "@/types/places";
import { useSession } from "@/lib/useSession";

// ─── Category emoji ───────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧩",
  wellness: "🧘", attraction: "🎡", food: "🍽️",
};

// ─── Star rating input ────────────────────────────────────────────────────────

function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform active:scale-90"
          aria-label={`${n} כוכבים`}
        >
          <Star
            style={{
              width: 28,
              height: 28,
              fill: (hover || value) >= n ? "#C8A24B" : "none",
              color: (hover || value) >= n ? "#C8A24B" : "#CBD5E0",
            }}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: PlaceReview }) {
  const name =
    review.is_anonymous
      ? "אנונימי"
      : review.reviewer_public_name ?? "משתמש";
  const date = new Date(review.created_at).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        border: "1px solid #E5E9F0",
        boxShadow: "0 1px 3px rgba(10,43,107,.04)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-hebrew font-semibold text-sm text-[#0F1A2E]">{name}</p>
          <p className="font-hebrew text-[11px] text-[#8A95A8]">{date}</p>
        </div>
        <div className="flex" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              style={{
                width: 12,
                height: 12,
                fill: review.rating >= n ? "#C8A24B" : "none",
                color: review.rating >= n ? "#C8A24B" : "#CBD5E0",
              }}
            />
          ))}
        </div>
      </div>
      {review.text && (
        <p className="font-hebrew text-sm text-[#374151] leading-relaxed">
          {review.text}
        </p>
      )}
    </div>
  );
}

// ─── Kids attribute chips ─────────────────────────────────────────────────────

function KidsAttributeChips({ attrs }: { attrs: Record<string, unknown> }) {
  const chips: string[] = [];
  if (attrs.min_age_months != null && attrs.max_age_months != null) {
    const toLabel = (m: number) =>
      m < 24 ? `${m} חודשים` : `${Math.floor(m / 12)} שנים`;
    chips.push(
      `גיל: ${toLabel(Number(attrs.min_age_months))}–${toLabel(Number(attrs.max_age_months))}`
    );
  }
  if (attrs.meal_type) chips.push(`ארוחות: ${String(attrs.meal_type)}`);
  if (attrs.has_outdoor_space) chips.push("חצר חיצונית");
  if (attrs.monthly_price_nis) {
    chips.push(
      `${Number(attrs.monthly_price_nis).toLocaleString("he-IL")} ₪ לחודש`
    );
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {chips.map((c) => (
        <span
          key={c}
          className="font-hebrew"
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 9px",
            borderRadius: 8,
            background: "#E8F0FB",
            color: "#0A2B6B",
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

// ─── Info row (icon + text) ───────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  color,
  children,
  href,
}: {
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-2.5 font-hebrew text-sm">
      <span
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{ width: 32, height: 32, background: `${color}18` }}
      >
        <Icon style={{ width: 14, height: 14, color }} />
      </span>
      <span className="flex-1 text-[#374151] pt-1 leading-snug break-words">
        {children}
      </span>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("tel:") ? undefined : "_blank"}
        rel={href.startsWith("tel:") ? undefined : "noopener noreferrer"}
        className="block hover:opacity-80"
      >
        {content}
      </a>
    );
  }
  return content;
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
}

export function PlaceDetail({ place, onClose }: PlaceDetailProps) {
  const { user, session } = useSession();
  const color = PLACE_CATEGORY_COLORS[place.place_category];
  const emoji = CATEGORY_EMOJI[place.place_category] ?? "📍";
  const neighborhood = place.neighborhood
    ? NEIGHBORHOOD_LABELS[place.neighborhood]
    : null;
  const attrs = place.attributes as Record<string, unknown>;

  // ── Reviews state ────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await fetch(
        `/api/place-reviews?place_id=${encodeURIComponent(place.id)}`
      );
      const d = await res.json();
      setReviews(d.reviews ?? []);
    } catch {
      // Silently fail — reviews not available
    } finally {
      setReviewsLoading(false);
    }
  }, [place.id]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // ── Review form state ────────────────────────────────────────────────────────
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/place-reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          place_id: place.id,
          rating: formRating,
          text: formText.trim() || null,
          is_anonymous: formAnonymous,
          reviewer_public_name: formAnonymous ? null : formName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשליחה");
      setSubmitSuccess(true);
      setShowForm(false);
      await loadReviews();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "שגיאה בשליחה");
    } finally {
      setSubmitting(false);
    }
  }, [
    formRating,
    formText,
    formAnonymous,
    formName,
    place.id,
    user,
    session,
    loadReviews,
  ]);

  const cancelForm = () => {
    setShowForm(false);
    setFormRating(0);
    setFormText("");
    setSubmitError(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full bg-white overflow-hidden"
      style={{ borderRadius: "inherit" }}
      dir="rtl"
    >
      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid #E5E9F0" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 font-hebrew text-sm font-semibold text-[#0A2B6B]"
          style={{ background: "none", border: 0, cursor: "pointer", padding: "4px 0" }}
        >
          <ChevronLeft
            style={{ width: 17, height: 17, transform: "rotate(180deg)" }}
          />
          חזור
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#F5F6FA",
            border: "none",
            cursor: "pointer",
          }}
          aria-label="סגור"
        >
          <X style={{ width: 15, height: 15, color: "#4A5568" }} />
        </button>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: 40 }}
      >
        {/* Hero */}
        <div
          className="relative flex flex-col items-start justify-end"
          style={{
            background: `linear-gradient(135deg, ${color}BB 0%, ${color} 100%)`,
            minHeight: 148,
            padding: "20px 20px 16px",
          }}
        >
          {/* Watermark emoji */}
          <span
            className="absolute bottom-0 end-4 select-none pointer-events-none"
            style={{ fontSize: 88, opacity: 0.16, lineHeight: 1 }}
          >
            {emoji}
          </span>

          {/* Category badge */}
          <span
            className="font-hebrew font-bold mb-2 inline-block"
            style={{
              fontSize: 10,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              background: "rgba(255,255,255,.22)",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            {PLACE_CATEGORY_LABELS[place.place_category]}
          </span>

          <h2
            className="font-hebrew text-white leading-tight"
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif",
            }}
          >
            {place.name}
          </h2>

          <p className="font-hebrew text-sm mt-0.5" style={{ color: "rgba(255,255,255,.8)" }}>
            {[neighborhood, place.address?.split(",")[0]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Rating row */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid #F0F3FA" }}
        >
          {place.avg_rating != null ? (
            <>
              <div className="flex" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    style={{
                      width: 14,
                      height: 14,
                      fill: place.avg_rating! >= n ? "#C8A24B" : "none",
                      color: place.avg_rating! >= n ? "#C8A24B" : "#CBD5E0",
                    }}
                  />
                ))}
              </div>
              <span className="font-semibold text-sm text-[#0F1A2E]">
                {place.avg_rating.toFixed(1)}
              </span>
              <span className="font-hebrew text-xs text-[#8A95A8]">
                ({place.rec_count} המלצות)
              </span>
            </>
          ) : (
            <span className="font-hebrew text-xs text-[#8A95A8]">
              אין דירוג עדיין
            </span>
          )}
          {place.is_verified && (
            <div className="flex items-center gap-1 text-[#1F5BB5] ms-auto">
              <BadgeCheck style={{ width: 14, height: 14 }} />
              <span className="font-hebrew text-xs font-semibold">מאומת</span>
            </div>
          )}
        </div>

        {/* Content sections */}
        <div className="px-4 pt-4 space-y-5">

          {/* Description */}
          {place.description && (
            <p className="font-hebrew text-sm text-[#374151] leading-relaxed">
              {place.description}
            </p>
          )}

          {/* Contact */}
          {(!!place.phone?.length ||
            !!place.website ||
            !!place.hours ||
            !!place.address) && (
            <div>
              <h4
                className="font-hebrew font-bold text-[11px] uppercase tracking-wider mb-3"
                style={{ color: "#8A95A8" }}
              >
                פרטי קשר
              </h4>
              <div className="space-y-2.5">
                {place.phone?.map((p) => (
                  <InfoRow
                    key={p}
                    icon={Phone}
                    color={color}
                    href={`tel:${p}`}
                  >
                    <span className="font-medium text-[#0A2B6B]">{p}</span>
                  </InfoRow>
                ))}
                {place.website && (
                  <InfoRow
                    icon={Globe}
                    color={color}
                    href={
                      place.website.startsWith("http")
                        ? place.website
                        : `https://${place.website}`
                    }
                  >
                    <span className="font-medium text-[#0A2B6B] truncate block">
                      {place.website.replace(/^https?:\/\//, "")}
                    </span>
                  </InfoRow>
                )}
                {place.hours && (
                  <InfoRow icon={Clock} color={color}>
                    {place.hours}
                  </InfoRow>
                )}
                {place.address && (
                  <InfoRow icon={MapPin} color={color}>
                    {place.address}
                  </InfoRow>
                )}
              </div>
            </div>
          )}

          {/* HMO chips — doctors */}
          {place.place_category === "doctor" &&
            !!place.hmo?.length && (
              <div>
                <h4
                  className="font-hebrew font-bold text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "#8A95A8" }}
                >
                  קופות חולים
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {place.hmo.map((h) => (
                    <span
                      key={h}
                      className="font-hebrew font-semibold"
                      style={{
                        fontSize: 12,
                        padding: "5px 12px",
                        borderRadius: 8,
                        background: "#E8F0FB",
                        color: "#0A2B6B",
                      }}
                    >
                      {HMO_LABELS[h] ?? h}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Kids attributes */}
          {place.place_category === "kids" &&
            Object.keys(attrs).length > 0 && (
              <div>
                <h4
                  className="font-hebrew font-bold text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "#8A95A8" }}
                >
                  פרטים נוספים
                </h4>
                <KidsAttributeChips attrs={attrs} />
              </div>
            )}

          {/* Reviews section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-hebrew font-bold text-sm text-[#0F1A2E]">
                המלצות
                {reviews.length > 0 && (
                  <span
                    className="font-normal ms-1.5"
                    style={{ color: "#8A95A8" }}
                  >
                    ({reviews.length})
                  </span>
                )}
              </h4>
            </div>

            {reviewsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2
                  className="animate-spin"
                  style={{ width: 20, height: 20, color: "#0A2B6B" }}
                />
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8">
                <span style={{ fontSize: 32 }}>💬</span>
                <p className="font-hebrew text-sm mt-2" style={{ color: "#8A95A8" }}>
                  אין המלצות עדיין
                </p>
                <p
                  className="font-hebrew text-xs mt-0.5"
                  style={{ color: "#8A95A8" }}
                >
                  היה/י הראשון/ה להמליץ!
                </p>
              </div>
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}

            {/* Submit-success banner */}
            {submitSuccess && (
              <div
                className="font-hebrew text-sm text-center py-3 rounded-xl mb-3"
                style={{
                  background: "#DCF3E6",
                  color: "#1D7F4F",
                  fontWeight: 600,
                }}
              >
                ההמלצה נשלחה! תודה רבה 🙏
              </div>
            )}

            {/* Write-review CTA */}
            {!submitSuccess && user && !showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="w-full font-hebrew font-bold flex items-center justify-center gap-2"
                style={{
                  padding: "13px 0",
                  borderRadius: 14,
                  marginTop: 4,
                  background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
                  color: "#fff",
                  fontSize: 14,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 6px 16px rgba(10,43,107,.25)",
                }}
              >
                <Star style={{ width: 15, height: 15 }} />
                כתוב/י המלצה
              </button>
            )}

            {!user && (
              <p
                className="font-hebrew text-xs text-center py-3"
                style={{ color: "#8A95A8" }}
              >
                התחבר/י כדי לכתוב המלצה
              </p>
            )}

            {/* Inline review form */}
            {showForm && (
              <div
                className="mt-3 p-4 rounded-2xl"
                style={{ background: "#F6F9FE", border: "1px solid #E5E9F0" }}
              >
                <h5 className="font-hebrew font-bold text-sm text-[#0A2B6B] mb-3">
                  ההמלצה שלך
                </h5>

                <div className="mb-3">
                  <StarInput value={formRating} onChange={setFormRating} />
                </div>

                <textarea
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="שתף/י את הניסיון שלך..."
                  rows={3}
                  className="w-full font-hebrew text-sm resize-none"
                  style={{
                    background: "#fff",
                    border: "1px solid #E5E9F0",
                    borderRadius: 12,
                    padding: "10px 12px",
                    outline: "none",
                    color: "#0F1A2E",
                    lineHeight: 1.6,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />

                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formAnonymous}
                    onChange={(e) => setFormAnonymous(e.target.checked)}
                    style={{ accentColor: "#0A2B6B" }}
                  />
                  <span
                    className="font-hebrew text-xs"
                    style={{ color: "#4A5568" }}
                  >
                    שלח/י באנונימיות
                  </span>
                </label>

                {!formAnonymous && (
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="שם לתצוגה (אופציונלי)"
                    className="w-full font-hebrew text-sm mt-2"
                    style={{
                      background: "#fff",
                      border: "1px solid #E5E9F0",
                      borderRadius: 12,
                      padding: "9px 12px",
                      outline: "none",
                      color: "#0F1A2E",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                )}

                {submitError && (
                  <p
                    className="font-hebrew text-xs mt-1.5"
                    style={{ color: "#C53030" }}
                  >
                    {submitError}
                  </p>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={submitReview}
                    disabled={formRating === 0 || submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 font-hebrew font-bold text-sm"
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      background:
                        formRating === 0
                          ? "#C5CDD8"
                          : "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
                      color: "#fff",
                      border: "none",
                      cursor: formRating === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? (
                      <Loader2
                        className="animate-spin"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : (
                      <>
                        <Send style={{ width: 13, height: 13 }} />
                        שלח
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={cancelForm}
                    className="font-hebrew font-semibold text-sm px-4"
                    style={{
                      borderRadius: 12,
                      background: "#fff",
                      border: "1px solid #E5E9F0",
                      color: "#4A5568",
                      cursor: "pointer",
                    }}
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
