"use client";

import { Shield, Phone, X, Lock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import type { Gan } from "@/types/ganim";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { useEffect, useMemo, useState } from "react";
import { ContactReviewerModal } from "@/components/gan/ContactReviewerModal";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";

interface GanDetailProps {
  gan: Gan;
  onClose: () => void;
  onBack?: () => void;
  canViewReviews: boolean; // Give-to-Get: true if user has contributed
  onRequestLogin?: () => void;
  onReviewSaved?: () => void;
}

export function GanDetail({
  gan,
  onClose,
  onBack,
  canViewReviews,
  onRequestLogin,
  onReviewSaved,
}: GanDetailProps) {
  const { user } = useSession();
  const [showFacets, setShowFacets] = useState(false);
  const [showRecommendForm, setShowRecommendForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<
    Array<{
      id: string;
      user_id: string;
      rating: number;
      is_anonymous: boolean;
      reviewer_public_name?: string | null;
      reviewer_public_email_masked?: string | null;
      advice_to_parents_text: string | null;
      created_at: string;
    }>
  >([]);
  const [contactReviewId, setContactReviewId] = useState<string | null>(null);

  const maskEmail = useMemo(() => {
    return (email: string): string => {
      const e = String(email ?? "").trim();
      const at = e.indexOf("@");
      if (at <= 0) return e;
      const local = e.slice(0, at);
      const domain = e.slice(at + 1);
      const keep = local.length >= 2 ? local.slice(0, 2) : local.slice(0, 1);
      return `${keep}***@${domain}`;
    };
  }, []);

  const [rating, setRating] = useState(4.0);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [comment, setComment] = useState("");
  const [cleanliness, setCleanliness] = useState<number | null>(null);
  const [staff, setStaff] = useState<number | null>(null);
  const [communication, setCommunication] = useState<number | null>(null);
  const [food, setFood] = useState<number | null>(null);
  const [location, setLocation] = useState<number | null>(null);

  const formatReviewDate = useMemo(() => {
    return (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("he-IL", { year: "numeric", month: "2-digit", day: "2-digit" });
    };
  }, []);

  const phones = Array.isArray(gan.metadata?.phone)
    ? gan.metadata.phone
    : gan.metadata?.phone
      ? [String(gan.metadata.phone)]
      : [];

  const pikuachText =
    gan.metadata?.pikuach_ironi === true
      ? "קיים"
      : gan.metadata?.pikuach_ironi === false
        ? "לא קיים"
        : "לא ידוע";

  const suggestedTypeText =
    typeof gan.metadata?.suggested_type === "string" && gan.metadata.suggested_type.trim()
      ? gan.metadata.suggested_type.trim()
      : "לא ידוע";

  const govTypeText =
    gan.type === "Private" ? "פרטי" : gan.type === "Maon" ? "מעון" : "מפוקח (רישוי)";

  const cctvText = (() => {
    // Prefer DB field when available, then user-suggested metadata, then legacy boolean.
    if (gan.has_cctv) {
      if (gan.cctv_streamed_online === true) return "יש ואפשר להתחבר אונליין";
      if (gan.cctv_streamed_online === false) return "יש (פתוח למקרים חריגים)";
    }
    const v = gan.metadata?.cctv_access;
    if (v === "none") return "אין";
    if (v === "online") return "יש ואפשר להתחבר אונליין";
    if (v === "exceptional") return "יש (פתוח למקרים חריגים)";
    return gan.has_cctv ? "יש (פתוח למקרים חריגים)" : "אין";
  })();

  const facetAverages = useMemo(
    () => [
      { key: "cleanliness", label: "ניקיון", value: gan.avg_cleanliness ?? null },
      { key: "staff", label: "צוות", value: gan.avg_staff ?? null },
      { key: "communication", label: "תקשורת", value: gan.avg_communication ?? null },
      { key: "food", label: "אוכל", value: gan.avg_food ?? null },
      { key: "location", label: "מיקום", value: gan.avg_location ?? null },
    ],
    [gan]
  );

  const signIn = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  };

  const submitRecommendation = async () => {
    setSubmitError(null);
    setSubmitted(false);
    if (!supabase || !user) {
      setSubmitError("נדרשת התחברות כדי לפרסם המלצה (אפשר לפרסם כאנונימי).");
      return;
    }
    setSaving(true);
    try {
      const fullName =
        typeof (user as any)?.user_metadata?.full_name === "string"
          ? String((user as any).user_metadata.full_name).trim()
          : "";
      const email = typeof user?.email === "string" ? user.email.trim() : "";
      const reviewerPublicName = !isAnonymous ? (fullName || null) : null;
      const reviewerPublicEmailMasked = !isAnonymous && email ? maskEmail(email) : null;

      const basePayload: Record<string, unknown> = {
        user_id: user.id,
        gan_id: gan.id,
        rating,
        is_anonymous: isAnonymous,
        advice_to_parents_text: comment.trim() ? comment.trim() : null,
        cleanliness_rating: cleanliness,
        staff_rating: staff,
        communication_rating: communication,
        food_rating: food,
        location_rating: location,
      };

      const identityPayload: Record<string, unknown> = {
        reviewer_public_name: reviewerPublicName,
        reviewer_public_email_masked: reviewerPublicEmailMasked,
      };

      let { error } = await supabase
        .from("reviews")
        .upsert({ ...basePayload, ...identityPayload }, { onConflict: "user_id,gan_id" });

      // Backwards compatible: if the DB columns don't exist yet, retry without them.
      if (error) {
        const msg = typeof (error as any)?.message === "string" ? String((error as any).message) : "";
        const missingCol =
          msg.includes("does not exist") &&
          (msg.includes("reviewer_public_name") || msg.includes("reviewer_public_email_masked"));
        if (missingCol) {
          ({ error } = await supabase.from("reviews").upsert(basePayload, { onConflict: "user_id,gan_id" }));
        }
      }
      if (error) throw error;
      setSubmitted(true);
      onReviewSaved?.();
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "";
      if (msg === "review_limit_reached") {
        setSubmitError("אפשר לפרסם עד 10 המלצות בסך הכל.");
      } else {
        setSubmitError(msg || "שגיאה בפרסום המלצה");
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!showRecommendForm) {
      setSubmitted(false);
      setSubmitError(null);
    }
  }, [showRecommendForm]);

  useEffect(() => {
    if (!canViewReviews || !supabase) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError(null);

    (async () => {
      try {
        const queryNew = supabase
          .from("reviews")
          .select(
            "id,user_id,rating,is_anonymous,reviewer_public_name,reviewer_public_email_masked,advice_to_parents_text,created_at"
          )
          .eq("gan_id", gan.id)
          .order("created_at", { ascending: false });
        let data: any[] | null = null;
        let error: any = null;
        ({ data, error } = (await (queryNew as any)) as any);

        // Backwards compatible: if the DB columns don't exist yet, retry without them.
        if (error) {
          const msg = typeof (error as any)?.message === "string" ? String((error as any).message) : "";
          const missingCol =
            msg.includes("does not exist") &&
            (msg.includes("reviewer_public_name") || msg.includes("reviewer_public_email_masked"));
          if (missingCol) {
            ({ data, error } = (await (supabase
              .from("reviews")
              .select("id,user_id,rating,is_anonymous,advice_to_parents_text,created_at")
              .eq("gan_id", gan.id)
              .order("created_at", { ascending: false }) as any)) as any);
          }
        }

        if (cancelled) return;
        if (error) {
          setReviewsError(error.message);
          setReviews([]);
          return;
        }

        setReviews(
          (data ?? []).map((r: any) => ({
            id: String(r.id),
            user_id: String(r.user_id),
            rating: Number(r.rating),
            is_anonymous: Boolean(r.is_anonymous),
            reviewer_public_name:
              typeof r.reviewer_public_name === "string" ? r.reviewer_public_name : null,
            reviewer_public_email_masked:
              typeof r.reviewer_public_email_masked === "string"
                ? r.reviewer_public_email_masked
                : null,
            advice_to_parents_text:
              typeof r.advice_to_parents_text === "string" ? r.advice_to_parents_text : null,
            created_at: String(r.created_at),
          }))
        );
      } catch (err) {
        if (cancelled) return;
        setReviewsError(err instanceof Error ? err.message : "שגיאה בטעינת ביקורות");
        setReviews([]);
      } finally {
        if (cancelled) return;
        setReviewsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canViewReviews, gan.id]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
        <div className="flex items-start gap-2 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="חזרה לרשימה"
              title="חזרה לרשימה"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          )}
          <CardTitle className="font-hebrew text-lg min-w-0 truncate">
            {gan.name_he}
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <div className="rounded-lg border border-gan-accent/30 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              className="text-start"
              onClick={() => setShowFacets((v) => !v)}
              title="לחץ לפירוט קטגוריות"
            >
              <div className="font-hebrew font-semibold text-gan-dark">דירוג הורים</div>
              <div className="mt-1">
                <StarRating value={gan.avg_rating} count={gan.recommendation_count} showValue />
              </div>
              <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                לחץ לפירוט קטגוריות
              </div>
            </button>

            <div className="flex flex-col items-end gap-2">
              {!gan.is_verified ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                  נוסף לאחרונה ע״י משתמש — עדיין לא אושר
                </span>
              ) : null}
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setShowRecommendForm((v) => !v)}
              >
                <Sparkles className="w-4 h-4" />
                כתבו המלצה
              </Button>
            </div>
          </div>

          {showFacets && (
            <div className="mt-4 border-t border-gan-accent/30 pt-3">
              <div className="grid grid-cols-1 gap-2">
                {facetAverages.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-3">
                    <div className="text-sm font-hebrew font-semibold text-gan-dark">
                      {f.label}
                    </div>
                    <StarRating value={f.value} showValue={false} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {showRecommendForm && (
            <div className="mt-4 border-t border-gan-accent/30 pt-4 space-y-3">
              <div className="text-xs text-gray-600 font-hebrew">
                כדי למנוע בוטים צריך להתחבר, אבל אפשר לפרסם כ״אנונימי״.
              </div>

              {!user ? (
                <Button size="sm" onClick={onRequestLogin ?? signIn} className="gap-2">
                  <Lock className="w-4 h-4" />
                  התחברות עם Google
                </Button>
              ) : (
                <>
                  <StarRatingInput value={rating} onChange={setRating} label="דירוג כללי" />
                  <button
                    type="button"
                    className="text-sm font-hebrew text-gan-primary hover:underline"
                    onClick={() => setShowFacets((v) => !v)}
                  >
                    {showFacets ? "הסתר דירוג קטגוריות" : "הוסף דירוג קטגוריות"}
                  </button>

                  {showFacets && (
                    <div className="grid grid-cols-1 gap-3">
                      <StarRatingInput
                        value={cleanliness}
                        onChange={(v) => setCleanliness(v)}
                        label="ניקיון"
                      />
                      <StarRatingInput
                        value={staff}
                        onChange={(v) => setStaff(v)}
                        label="צוות"
                      />
                      <StarRatingInput
                        value={communication}
                        onChange={(v) => setCommunication(v)}
                        label="תקשורת"
                      />
                      <StarRatingInput
                        value={food}
                        onChange={(v) => setFood(v)}
                        label="אוכל"
                      />
                      <StarRatingInput
                        value={location}
                        onChange={(v) => setLocation(v)}
                        label="מיקום"
                      />
                      <div className="text-[11px] text-gray-500 font-hebrew">
                        אם לא תמלאו קטגוריות — רק הדירוג הכללי ייספר.
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                    />
                    פרסם כאנונימי
                  </label>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-hebrew">
                      טקסט חופשי (אופציונלי)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      disabled={submitted}
                      className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew focus:outline-none focus:ring-2 focus:ring-gan-primary/40"
                      placeholder="מה היה טוב/פחות טוב? טיפים להורים?"
                    />
                  </div>

                  {submitError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
                      {submitError}
                    </div>
                  )}
                  {submitted && (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-hebrew">
                      תודה! ההמלצה נשמרה.
                    </div>
                  )}

                  {!submitted ? (
                    <Button size="sm" onClick={submitRecommendation} disabled={saving}>
                      {saving ? "שומר..." : "פרסם המלצה"}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        {/* Community-provided fields (especially for unverified ganim) */}
        {!gan.is_verified ? (
          <div className="rounded-lg border border-gan-accent/30 bg-white p-4 space-y-2">
            <h4 className="font-medium text-gan-dark flex items-center gap-2 font-hebrew">
              <Sparkles className="w-4 h-4" />
              מידע שהוזן ע״י משתמש
            </h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סוג</dt>
              <dd className="text-gray-600 font-hebrew">{suggestedTypeText}</dd>
              <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">פיקוח עירוני</dt>
              <dd className="text-gray-600 font-hebrew">{pikuachText}</dd>
              <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">CCTV</dt>
              <dd className="text-gray-600 font-hebrew">{cctvText}</dd>
            </dl>
          </div>
        ) : null}

        {/* Government licensing data (only when verified) */}
        {gan.is_verified ? (
          <div className="rounded-lg bg-gan-muted/50 p-4 space-y-2">
            <h4 className="font-medium text-gan-dark flex items-center gap-2">
              <Shield className="w-4 h-4" />
              נתוני רישוי ממשלתי
            </h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סוג מסגרת (רישוי)</dt>
              <dd className="text-gray-600 font-hebrew">{govTypeText}</dd>
              {gan.license_status !== "Permanent" ? (
                <>
                  <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סטטוס רישוי</dt>
                  <dd className="text-gray-600 font-hebrew">
                    {gan.license_status === "Temporary"
                      ? "זמני"
                      : gan.license_status === "Under Observation"
                        ? "תחת מעקב"
                        : gan.license_status}
                  </dd>
                </>
              ) : null}
              <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">CCTV</dt>
              <dd className="text-gray-600 font-hebrew">{cctvText}</dd>
            </dl>
          </div>
        ) : null}

        {/* Address & contact */}
        <div className="rounded-lg border border-gan-accent/30 bg-white p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              כתובת
            </dt>
            <dd className="text-gray-600 font-hebrew">{getGanStreetAddressForDisplay(gan)}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              עיר
            </dt>
            <dd className="text-gray-600 font-hebrew">{getGanCityForDisplay(gan)}</dd>
            {getGanNeighborhoodForDisplay(gan) ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">שכונה</dt>
                <dd className="text-gray-600 font-hebrew">{getGanNeighborhoodForDisplay(gan)}</dd>
              </>
            ) : null}
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              טלפון
            </dt>
            <dd className="text-gray-600">
              {phones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {phones.map((p) => (
                    <a
                      key={p}
                      href={`tel:${p}`}
                      className="inline-flex items-center gap-1 text-gan-primary hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {p}
                    </a>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>

        {/* Give-to-Get: Reviews section - blurred if no contribution */}
        <div>
          <h4 className="font-medium text-gan-dark mb-2">ביקורות הורים</h4>
          {canViewReviews ? (
            <div className="space-y-3">
              {reviewsLoading ? (
                <div className="text-sm text-gray-600 font-hebrew">טוען ביקורות…</div>
              ) : reviewsError ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
                  {reviewsError}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-sm text-gray-600 font-hebrew">אין עדיין ביקורות.</div>
              ) : (
                <div className="space-y-2">
                  {reviews.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-gan-accent/30 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StarRating value={r.rating} showValue />
                            <span className="text-[11px] text-gray-500 font-hebrew">
                              {r.is_anonymous
                                ? "אנונימי"
                                : r.user_id === user?.id
                                  ? (() => {
                                      const fullName =
                                        typeof (user as any)?.user_metadata?.full_name === "string"
                                          ? String((user as any).user_metadata.full_name).trim()
                                          : "";
                                      const email = typeof user?.email === "string" ? user.email.trim() : "";
                                      if (fullName && email && fullName !== email) return `${fullName} (${email})`;
                                      return fullName || email || "לא אנונימי";
                                    })()
                                  : r.reviewer_public_name || r.reviewer_public_email_masked
                                    ? `${r.reviewer_public_name ?? ""}${
                                        r.reviewer_public_name && r.reviewer_public_email_masked
                                          ? ` (${r.reviewer_public_email_masked})`
                                          : r.reviewer_public_email_masked
                                            ? r.reviewer_public_email_masked
                                            : ""
                                      }`.trim()
                                    : "לא אנונימי"}
                            </span>
                            <span className="text-[11px] text-gray-500 font-hebrew">
                              {formatReviewDate(r.created_at)}
                            </span>
                          </div>
                          {r.advice_to_parents_text ? (
                            <div className="mt-2 text-sm text-gray-700 font-hebrew whitespace-pre-wrap">
                              {r.advice_to_parents_text}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-gray-500 font-hebrew">
                              (ללא טקסט חופשי)
                            </div>
                          )}
                        </div>

                        {user && r.user_id !== user.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="whitespace-nowrap"
                            onClick={() => setContactReviewId(r.id)}
                          >
                            שלח שאלה
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="relative rounded-lg border border-gan-accent/50 p-4 bg-gan-muted/20"
              style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}
            >
              <p className="text-sm text-gray-500">
                תוכן הביקורות מוסתר. התחבר ופרסם ביקורת או &quot;הערת ביקור&quot; כדי לצפות.
              </p>
            </div>
          )}
          {!canViewReviews && (
            <div className="mt-2">
              <Button
                size="sm"
                onClick={onRequestLogin ?? signIn}
                className="gap-2"
              >
                <Lock className="w-4 h-4" />
                התחבר כדי לצפות
              </Button>
            </div>
          )}
        </div>
      </CardContent>
      {contactReviewId ? (
        <ContactReviewerModal
          reviewId={contactReviewId}
          ganName={gan.name_he}
          onClose={() => setContactReviewId(null)}
        />
      ) : null}
    </Card>
  );
}
