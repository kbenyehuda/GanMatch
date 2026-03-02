"use client";

import { Shield, Phone, X, Lock, ArrowRight, Sparkles, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import type { Gan } from "@/types/ganim";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContactReviewerModal } from "@/components/gan/ContactReviewerModal";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import {
  formatAgesHe,
  formatGanCategoryAddonLabelHe,
  formatGanCategoryHe,
  formatPriceHe,
} from "@/lib/gan-display";

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
  const [showAvgFacets, setShowAvgFacets] = useState(false);
  const [showRecommendFacets, setShowRecommendFacets] = useState(false);
  const [showRecommendForm, setShowRecommendForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
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
        : null;

  const suggestedTypeText =
    typeof gan.metadata?.suggested_type === "string" && gan.metadata.suggested_type.trim()
      ? gan.metadata.suggested_type.trim()
      : "לא ידוע";

  const categoryText = formatGanCategoryHe(gan.category);
  const addon = formatGanCategoryAddonLabelHe(gan);
  const agesText = formatAgesHe(gan);
  const priceText = formatPriceHe(gan);

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

  const neighborhood = getGanNeighborhoodForDisplay(gan);

  const [editAddress, setEditAddress] = useState<string>("");
  const [editCity, setEditCity] = useState<string>("");
  const [editNeighborhood, setEditNeighborhood] = useState<string>("");
  const [editPikuach, setEditPikuach] = useState<"unknown" | "yes" | "no">("unknown");
  const [editSuggestedType, setEditSuggestedType] = useState<string>("");
  const [editPriceNotes, setEditPriceNotes] = useState<string>("");
  const [editCategory, setEditCategory] = useState<Gan["category"]>("UNSPECIFIED");
  const [editMaonSymbolCode, setEditMaonSymbolCode] = useState<string>("");
  const [editPrivateSupervision, setEditPrivateSupervision] = useState<NonNullable<Gan["private_supervision"]>>(
    "UNKNOWN"
  );
  const [editMishpachtonAffiliation, setEditMishpachtonAffiliation] = useState<
    NonNullable<Gan["mishpachton_affiliation"]>
  >("UNKNOWN");
  const [editMunicipalGrade, setEditMunicipalGrade] = useState<NonNullable<Gan["municipal_grade"]>>("UNKNOWN");
  const [editMinAgeYears, setEditMinAgeYears] = useState<string>("");
  const [editMaxAgeYears, setEditMaxAgeYears] = useState<string>("");
  const [editMonthlyPrice, setEditMonthlyPrice] = useState<string>("");
  const [editCctv, setEditCctv] = useState<"unknown" | "none" | "exceptional" | "online">("unknown");
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const editFormTopRef = useRef<HTMLDivElement | null>(null);
  const editFirstMissingFieldRef = useRef<HTMLElement | null>(null);
  const [showMissingDetails, setShowMissingDetails] = useState(false);

  useEffect(() => {
    // When changing gan, reset edit form fields to current values.
    setShowEditForm(false);
    setEditSaveError(null);
    setEditSaved(false);
    setShowRecommendForm(false);
    setShowRecommendFacets(false);
    setShowMissingDetails(false);

    const street = getGanStreetAddressForDisplay(gan);
    const city = getGanCityForDisplay(gan);
    setEditAddress(street === "אין כתובת" ? "" : street);
    setEditCity(city === "—" ? "" : city);
    setEditNeighborhood(getGanNeighborhoodForDisplay(gan) ?? "");
    setEditPikuach(gan.metadata?.pikuach_ironi === true ? "yes" : gan.metadata?.pikuach_ironi === false ? "no" : "unknown");
    setEditSuggestedType(typeof gan.metadata?.suggested_type === "string" ? gan.metadata.suggested_type : "");
    setEditPriceNotes(typeof gan.price_notes === "string" ? gan.price_notes : "");
    setEditCategory(gan.category);
    setEditMaonSymbolCode(gan.maon_symbol_code ?? "");
    setEditPrivateSupervision((gan.private_supervision ?? "UNKNOWN") as any);
    setEditMishpachtonAffiliation((gan.mishpachton_affiliation ?? "UNKNOWN") as any);
    setEditMunicipalGrade((gan.municipal_grade ?? "UNKNOWN") as any);
    setEditMinAgeYears(gan.min_age_months == null ? "" : String(Math.round((Number(gan.min_age_months) / 12) * 2) / 2));
    setEditMaxAgeYears(gan.max_age_months == null ? "" : String(Math.round((Number(gan.max_age_months) / 12) * 2) / 2));
    setEditMonthlyPrice(gan.monthly_price_nis == null ? "" : String(Math.round(Number(gan.monthly_price_nis))));
    setEditCctv(
      gan.has_cctv
        ? gan.cctv_streamed_online === true
          ? "online"
          : gan.cctv_streamed_online === false
            ? "exceptional"
            : "exceptional"
        : "none"
    );
  }, [gan]);

  const missingInfo = useMemo(() => {
    const items: Array<{ key: string; label: string; focus?: "category" | "addon" | "ages" | "price" | "neighborhood" }> = [];

    if (gan.category === "UNSPECIFIED") {
      items.push({ key: "category", label: "סוג", focus: "category" });
    } else if (gan.category === "MAON_SYMBOL") {
      if (!gan.maon_symbol_code) items.push({ key: "maon_symbol_code", label: "סמל מעון", focus: "addon" });
    } else if (gan.category === "PRIVATE_GAN") {
      if ((gan.private_supervision ?? "UNKNOWN") === "UNKNOWN") items.push({ key: "private_supervision", label: "פיקוח", focus: "addon" });
    } else if (gan.category === "MISHPACHTON") {
      if ((gan.mishpachton_affiliation ?? "UNKNOWN") === "UNKNOWN") items.push({ key: "mishpachton_affiliation", label: "שיוך", focus: "addon" });
    } else if (gan.category === "MUNICIPAL_GAN") {
      if ((gan.municipal_grade ?? "UNKNOWN") === "UNKNOWN") items.push({ key: "municipal_grade", label: "שכבה", focus: "addon" });
    }

    if (gan.min_age_months == null && gan.max_age_months == null) {
      items.push({ key: "ages", label: "גילאים", focus: "ages" });
    }
    if (gan.monthly_price_nis == null) {
      items.push({ key: "price", label: "מחיר", focus: "price" });
    }
    if (!neighborhood) {
      items.push({ key: "neighborhood", label: "שכונה", focus: "neighborhood" });
    }

    return items;
  }, [gan, neighborhood]);

  const openEditAndFocus = (focus?: (typeof missingInfo)[number]["focus"]) => {
    setShowEditForm(true);
    setEditSaved(false);
    setEditSaveError(null);
    requestAnimationFrame(() => {
      editFormTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Focus the first missing field if we have a known target.
      if (focus === "category") {
        (document.getElementById("gan-edit-category") as HTMLElement | null)?.focus?.();
      } else if (focus === "addon") {
        (document.getElementById("gan-edit-addon") as HTMLElement | null)?.focus?.();
      } else if (focus === "ages") {
        (document.getElementById("gan-edit-min-age") as HTMLElement | null)?.focus?.();
      } else if (focus === "price") {
        (document.getElementById("gan-edit-monthly-price") as HTMLElement | null)?.focus?.();
      } else if (focus === "neighborhood") {
        (document.getElementById("gan-edit-neighborhood") as HTMLElement | null)?.focus?.();
      } else {
        editFirstMissingFieldRef.current?.focus?.();
      }
    });
  };

  const submitGanEdit = async () => {
    setEditSaveError(null);
    setEditSaved(false);
    if (!supabase || !user) {
      setEditSaveError("נדרשת התחברות כדי לערוך פרטים.");
      return;
    }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Authentication required");

      const parseYearsToMonths = (s: string): number | null => {
        const t = s.trim();
        if (!t) return null;
        const n = Number(t.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) return null;
        return Math.round(n * 12);
      };
      const minAgeMonths = parseYearsToMonths(editMinAgeYears);
      const maxAgeMonths = parseYearsToMonths(editMaxAgeYears);

      const monthlyPrice = (() => {
        const t = editMonthlyPrice.trim();
        if (!t) return null;
        const n = Number(t.replace(/[^\d.]/g, ""));
        if (!Number.isFinite(n) || n < 0) return null;
        return Math.round(n);
      })();

      if (editCategory === "MAON_SYMBOL" && !editMaonSymbolCode.trim()) {
        setEditSaveError("במעון סמל חייבים למלא סמל מעון.");
        return;
      }

      const patch: Record<string, unknown> = {
        address: editAddress.trim() ? editAddress.trim() : null,
        city: editCity.trim() ? editCity.trim() : null,
        neighborhood: editNeighborhood.trim() ? editNeighborhood.trim() : null,
        pikuach_ironi: editPikuach === "unknown" ? null : editPikuach === "yes",
        suggested_type: editSuggestedType.trim() ? editSuggestedType.trim() : null,
        price_notes: editPriceNotes.trim() ? editPriceNotes.trim() : null,
        category: editCategory,
        maon_symbol_code: editMaonSymbolCode.trim() ? editMaonSymbolCode.trim() : null,
        private_supervision: editPrivateSupervision,
        mishpachton_affiliation: editMishpachtonAffiliation,
        municipal_grade: editMunicipalGrade,
        monthly_price_nis: monthlyPrice,
        min_age_months: minAgeMonths,
        max_age_months: maxAgeMonths,
      };

      if (editCctv !== "unknown") {
        patch.has_cctv = editCctv !== "none";
        patch.cctv_streamed_online = editCctv === "online" ? true : editCctv === "exceptional" ? false : null;
      }

      const res = await fetch("/api/ganim/edit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ganId: gan.id, patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === "string" ? data.error : "שגיאה בשמירת פרטים";
        throw new Error(msg);
      }
      setEditSaved(true);
      onReviewSaved?.(); // refresh gan list/details (temporary reuse)
    } catch (e: any) {
      setEditSaveError(typeof e?.message === "string" ? e.message : "שגיאה בשמירת פרטים");
    } finally {
      setSaving(false);
    }
  };

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
      setShowRecommendFacets(false);
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
              onClick={() => setShowAvgFacets((v) => !v)}
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
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-900 border border-amber-200"
                  title="נוסף לאחרונה ע״י משתמש — עדיין לא אושר"
                  aria-label="נוסף לאחרונה ע״י משתמש — עדיין לא אושר"
                >
                  <Info className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>

          {showAvgFacets && (
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
        </div>

        {/* Unified info block (same style as search cards) */}
        <div className="rounded-lg border border-gan-accent/30 bg-white p-4 space-y-3">
          {missingInfo.length > 0 ? (
            <div className="rounded-lg border border-gan-accent/30 bg-gan-muted/20 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowMissingDetails((v) => !v)}
                  className="min-w-0 inline-flex items-center gap-2 text-xs font-hebrew font-semibold text-gan-dark hover:underline"
                  aria-expanded={showMissingDetails}
                  title={showMissingDetails ? "הסתר פרטים חסרים" : "הצג פרטים חסרים"}
                >
                  <span>חסרים פרטים</span>
                  {showMissingDetails ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <div className="shrink-0">
                  {!user ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onRequestLogin ?? signIn}
                      className="gap-2 h-8 px-2 text-xs text-gan-primary hover:text-gan-dark"
                    >
                      <Lock className="w-4 h-4" />
                      התחבר כדי לתרום
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditAndFocus(missingInfo[0]?.focus)}
                      className="h-8 px-2 text-xs text-gan-primary hover:text-gan-dark"
                    >
                      ערכו פרטים
                    </Button>
                  )}
                </div>
              </div>
              {showMissingDetails ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missingInfo.slice(0, 6).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => openEditAndFocus(m.focus)}
                        className="text-[12px] font-hebrew px-2 py-1 rounded-full border border-gan-accent/40 bg-white text-gan-dark hover:bg-gan-muted/30"
                        title="לחצו כדי למלא"
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500 font-hebrew">
                    בשלב הזה השינויים נשמרים מיידית (לניפוי שגיאות). בהמשך נוכל לעבור לאישור/אגרגציה.
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">כתובת</dt>
            <dd className="text-gray-600 font-hebrew">{getGanStreetAddressForDisplay(gan)}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">עיר</dt>
            <dd className="text-gray-600 font-hebrew">{getGanCityForDisplay(gan)}</dd>
            {neighborhood ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">שכונה</dt>
                <dd className="text-gray-600 font-hebrew">{neighborhood}</dd>
              </>
            ) : null}
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סוג</dt>
            <dd className="text-gray-600 font-hebrew">{categoryText}</dd>
            {addon ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">{addon.label}</dt>
                <dd className="text-gray-600 font-hebrew">{addon.value}</dd>
              </>
            ) : null}
            {pikuachText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">פיקוח עירוני</dt>
                <dd className="text-gray-600 font-hebrew">{pikuachText}</dd>
              </>
            ) : null}
            {agesText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">גילאים</dt>
                <dd className="text-gray-600 font-hebrew">{agesText}</dd>
              </>
            ) : null}
            {priceText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">מחיר</dt>
                <dd className="text-gray-600 font-hebrew">
                  <div>{priceText}</div>
                  {gan.price_notes ? (
                    <div className="mt-1 text-[12px] text-gray-500 font-hebrew whitespace-pre-wrap">
                      {gan.price_notes}
                    </div>
                  ) : null}
                </dd>
              </>
            ) : null}
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">CCTV</dt>
            <dd className="text-gray-600 font-hebrew">{cctvText}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">טלפון</dt>
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

          {showEditForm && (
            <div className="border-t border-gan-accent/30 pt-4 space-y-3">
              <div ref={editFormTopRef} />
              <div className="text-sm font-hebrew font-semibold text-gan-dark">עריכת פרטים</div>
              {!user ? (
                <div className="text-sm text-gray-600 font-hebrew">צריך להתחבר כדי לערוך.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">כתובת (רחוב + מספר)</label>
                      <input
                        ref={(el) => {
                          if (el && !editFirstMissingFieldRef.current) editFirstMissingFieldRef.current = el;
                        }}
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="אבן גבירול 30"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">סוג</label>
                      <select
                        id="gan-edit-category"
                        value={editCategory}
                        onChange={(e) => {
                          const next = e.target.value as Gan["category"];
                          setEditCategory(next);
                          // Reset dependent fields so we never save mismatched add-ons.
                          setEditMaonSymbolCode("");
                          setEditPrivateSupervision("UNKNOWN");
                          setEditMishpachtonAffiliation("UNKNOWN");
                          setEditMunicipalGrade("UNKNOWN");
                        }}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="UNSPECIFIED">לא ידוע</option>
                        <option value="MAON_SYMBOL">מעון סמל</option>
                        <option value="PRIVATE_GAN">גן פרטי</option>
                        <option value="MISHPACHTON">משפחתון</option>
                        <option value="MUNICIPAL_GAN">גן עירוני</option>
                      </select>
                    </div>

                    {editCategory === "MAON_SYMBOL" ? (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-600 mb-1 font-hebrew">סמל מעון</label>
                        <input
                          id="gan-edit-addon"
                          value={editMaonSymbolCode}
                          onChange={(e) => setEditMaonSymbolCode(e.target.value)}
                          className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                          placeholder="לדוגמה: 73874"
                          inputMode="numeric"
                        />
                      </div>
                    ) : null}

                    {editCategory === "PRIVATE_GAN" ? (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-600 mb-1 font-hebrew">מפוקח?</label>
                        <select
                          id="gan-edit-addon"
                          value={editPrivateSupervision}
                          onChange={(e) => setEditPrivateSupervision(e.target.value as any)}
                          className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                        >
                          <option value="UNKNOWN">לא ידוע</option>
                          <option value="SUPERVISED">🛡️ מפוקח</option>
                          <option value="NOT_SUPERVISED">לא מפוקח</option>
                        </select>
                      </div>
                    ) : null}

                    {editCategory === "MISHPACHTON" ? (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-600 mb-1 font-hebrew">פרטי או תמ״ת?</label>
                        <select
                          id="gan-edit-addon"
                          value={editMishpachtonAffiliation}
                          onChange={(e) => setEditMishpachtonAffiliation(e.target.value as any)}
                          className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                        >
                          <option value="UNKNOWN">לא ידוע</option>
                          <option value="PRIVATE">פרטי</option>
                          <option value="TAMAT">תמ״ת</option>
                        </select>
                      </div>
                    ) : null}

                    {editCategory === "MUNICIPAL_GAN" ? (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-600 mb-1 font-hebrew">טט״ח/ט״ח/חובה</label>
                        <select
                          id="gan-edit-addon"
                          value={editMunicipalGrade}
                          onChange={(e) => setEditMunicipalGrade(e.target.value as any)}
                          className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                        >
                          <option value="UNKNOWN">לא ידוע</option>
                          <option value="TTAH">טט״ח</option>
                          <option value="TAH">ט״ח</option>
                          <option value="HOVA">חובה</option>
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">עיר</label>
                      <input
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="תל אביב"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">שכונה (אופציונלי)</label>
                      <input
                        id="gan-edit-neighborhood"
                        value={editNeighborhood}
                        onChange={(e) => setEditNeighborhood(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="קטמונים"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">פיקוח עירוני</label>
                      <select
                        value={editPikuach}
                        onChange={(e) => setEditPikuach(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="unknown">לא ידוע</option>
                        <option value="yes">קיים</option>
                        <option value="no">לא קיים</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">CCTV</label>
                      <select
                        value={editCctv}
                        onChange={(e) => setEditCctv(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="unknown">לא ידוע</option>
                        <option value="none">אין</option>
                        <option value="exceptional">יש (פתוח למקרים חריגים)</option>
                        <option value="online">יש ואפשר להתחבר אונליין</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">גיל מינימום (בשנים)</label>
                      <input
                        id="gan-edit-min-age"
                        value={editMinAgeYears}
                        onChange={(e) => setEditMinAgeYears(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="0.5"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">גיל מקסימום (בשנים)</label>
                      <input
                        value={editMaxAgeYears}
                        onChange={(e) => setEditMaxAgeYears(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="3"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">מחיר חודשי (₪)</label>
                      <input
                        id="gan-edit-monthly-price"
                        value={editMonthlyPrice}
                        onChange={(e) => setEditMonthlyPrice(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="4200"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">הערת מחיר (אופציונלי)</label>
                      <input
                        value={editPriceNotes}
                        onChange={(e) => setEditPriceNotes(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="לדוגמה: כולל אוכל / כולל צהרון / מחיר משתנה לפי גיל..."
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">סוג (טקסט חופשי, אופציונלי)</label>
                      <input
                        value={editSuggestedType}
                        onChange={(e) => setEditSuggestedType(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="לדוגמה: 'גן עירייה', 'פרטי', 'מעון יום'..."
                      />
                      <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                        נשמר לשקיפות (ב־metadata), אבל הסיווג הראשי הוא “סוג”.
                      </div>
                    </div>
                  </div>

                  {editSaveError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
                      {editSaveError}
                    </div>
                  ) : null}
                  {editSaved ? (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-hebrew">
                      השינויים נשמרו.
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEditForm(false)}
                      disabled={saving}
                    >
                      ביטול
                    </Button>
                    <Button type="button" size="sm" onClick={submitGanEdit} disabled={saving}>
                      {saving ? "שומר..." : "שמור שינויים"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Give-to-Get: Reviews section - blurred if no contribution */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="font-medium text-gan-dark">ביקורות הורים</h4>
            <Button
              size="sm"
              variant="ghost"
              className="gap-2 whitespace-nowrap h-8 px-2 text-xs text-gan-primary hover:text-gan-dark"
              onClick={() => setShowRecommendForm((v) => !v)}
            >
              <Sparkles className="w-4 h-4" />
              כתבו המלצה
            </Button>
          </div>

          {showRecommendForm && (
            <div className="mb-3 rounded-lg border border-gan-accent/30 bg-white p-4 space-y-3">
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
                    onClick={() => setShowRecommendFacets((v) => !v)}
                  >
                    {showRecommendFacets ? "הסתר דירוג קטגוריות" : "הוסף דירוג קטגוריות"}
                  </button>

                  {showRecommendFacets && (
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
