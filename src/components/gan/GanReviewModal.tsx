"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = 2015;
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - START_YEAR + 1 }, (_, i) => CURRENT_YEAR - i);

export interface GanReviewInitialData {
  rating: number;
  cleanliness_rating: number | null;
  staff_rating: number | null;
  safety_rating: number | null;
  advice_to_parents_text: string | null;
  enrollment_years: string | null;
  is_anonymous: boolean;
  allow_contact: boolean;
}

export function GanReviewModal({
  ganId,
  ganName,
  initialData,
  onClose,
  onSaved,
  onOpenEditGan,
}: {
  ganId: string;
  ganName?: string | null;
  initialData?: GanReviewInitialData | null;
  onClose: () => void;
  onSaved?: () => void;
  onOpenEditGan?: () => void;
}) {
  const { user } = useSession();
  const [rating, setRating] = useState(4);
  const [cleanliness, setCleanliness] = useState<number | null>(null);
  const [staff, setStaff] = useState<number | null>(null);
  const [safety, setSafety] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [fromYear, setFromYear] = useState<string>(String(CURRENT_YEAR - 2));
  const [toYear, setToYear] = useState<string>(String(CURRENT_YEAR - 1));
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowContact, setAllowContact] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showEditGan, setShowEditGan] = useState(false);

  useEffect(() => {
    if (initialData) {
      setRating(initialData.rating);
      setCleanliness(initialData.cleanliness_rating);
      setStaff(initialData.staff_rating);
      setSafety(initialData.safety_rating);
      setReviewText(initialData.advice_to_parents_text ?? "");
      setIsAnonymous(initialData.is_anonymous);
      setAllowContact(initialData.allow_contact ?? true);
      if (initialData.enrollment_years) {
        const parts = initialData.enrollment_years.split("-");
        if (parts.length >= 2) {
          setFromYear(parts[0].trim());
          setToYear(parts[1].trim());
        } else {
          setFromYear(parts[0].trim());
          setToYear(parts[0].trim());
        }
      }
    }
  }, [initialData]);

  const maskEmail = (email: string): string => {
    const e = String(email ?? "").trim();
    const at = e.indexOf("@");
    if (at <= 0) return e;
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    const keep = local.length >= 2 ? local.slice(0, 2) : local.slice(0, 1);
    return `${keep}***@${domain}`;
  };

  const enrollmentYears =
    fromYear === toYear ? fromYear : `${Math.min(Number(fromYear), Number(toYear))}-${Math.max(Number(fromYear), Number(toYear))}`;

  const submit = async () => {
    setError(null);
    if (!supabase || !user) {
      setError("נדרשת התחברות.");
      return;
    }

    const fullName =
      typeof (user as any)?.user_metadata?.full_name === "string"
        ? String((user as any).user_metadata.full_name).trim()
        : "";
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    const reviewerPublicName = !isAnonymous ? (fullName || null) : null;
    const reviewerPublicEmailMasked = !isAnonymous && email ? maskEmail(email) : null;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        gan_id: ganId,
        rating,
        cleanliness_rating: cleanliness,
        staff_rating: staff,
        safety_rating: safety,
        advice_to_parents_text: reviewText.trim() || null,
        enrollment_years: enrollmentYears,
        is_anonymous: isAnonymous,
        allow_contact: allowContact,
        is_private_reference: false,
        reviewer_public_name: reviewerPublicName,
        reviewer_public_email_masked: reviewerPublicEmailMasked,
        updated_at: new Date().toISOString(),
      };

      const { error: err } = await supabase
        .from("reviews")
        .upsert(payload, { onConflict: "user_id,gan_id" });

      if (err) throw err;
      setSuccess(true);
      onSaved?.();
    } catch (e: unknown) {
      let msg = "שגיאה בשמירה";
      if (e instanceof Error) msg = e.message;
      else if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string")
        msg = (e as { message: string }).message;
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-3">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
          <div className="min-w-0">
            <CardTitle className="font-hebrew text-base">הייתי הורה כאן</CardTitle>
            {ganName ? <div className="mt-1 text-xs text-gray-600 font-hebrew">{ganName}</div> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Section 1: Mandatory ratings - overall first, then specific */}
          <div>
            <div className="text-xs font-hebrew font-semibold text-gan-dark mb-2">דירוגים (חובה)</div>
            <div className="space-y-3">
              <div className="pb-2 border-b border-gan-accent/20">
                <StarRatingInput value={rating} onChange={(v) => setRating(v)} label="דירוג כללי" />
              </div>
              <div className="space-y-2">
                <StarRatingInput value={cleanliness} onChange={setCleanliness} label="ניקיון" />
                <StarRatingInput value={staff} onChange={setStaff} label="צוות" />
                <StarRatingInput value={safety} onChange={setSafety} label="בטיחות" />
              </div>
            </div>
          </div>

          {/* Section 2: Optional text */}
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">
              טקסט חופשי <span className="text-gray-400">(אופציונלי)</span>
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew focus:outline-none focus:ring-2 focus:ring-gan-primary/40"
              placeholder="מה היה טוב/פחות טוב? טיפים להורים?"
            />
          </div>

          {/* Enrollment years */}
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew font-semibold">
              שנות לימוד (מתי הילד/ה שלך היה/היתה בגן)
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={fromYear}
                onChange={(e) => setFromYear(e.target.value)}
                className="flex-1 rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
              <span className="text-gray-500 font-hebrew">עד</span>
              <select
                value={toYear}
                onChange={(e) => setToYear(e.target.value)}
                className="flex-1 rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Collapsible: Edit gan info (optional) */}
          {onOpenEditGan ? (
            <div className="rounded-lg border border-gan-accent/30 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowEditGan((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-hebrew text-gan-dark hover:bg-gan-muted/20"
                aria-expanded={showEditGan}
              >
                <span className="flex items-center gap-2">
                  <Pencil className="w-4 h-4" />
                  ערוך פרטי הגן <span className="text-gray-400 font-normal">(אופציונלי)</span>
                </span>
                {showEditGan ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showEditGan ? (
                <div className="px-3 pb-3 pt-0 border-t border-gan-accent/20">
                  <p className="text-xs text-gray-600 font-hebrew mb-2">
                    ניתן לעדכן כתובת, מחיר, שעות פעילות ועוד.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onOpenEditGan();
                    }}
                    className="gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    ערוך פרטים
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Section 3: Privacy toggles */}
          <div className="space-y-2">
            <div className="text-xs font-hebrew font-semibold text-gan-dark">פרטיות</div>
            <label className="flex items-center gap-2 text-sm font-hebrew cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              פרסם כאנונימי
            </label>
            <label className="flex items-center gap-2 text-sm font-hebrew cursor-pointer">
              <input
                type="checkbox"
                checked={allowContact}
                onChange={(e) => setAllowContact(e.target.checked)}
              />
              אפשר להורים אחרים לשלוח הודעה פרטית
            </label>
            <div className="text-[11px] text-gray-600 font-hebrew">
              האימייל שלך לא יוצג לשולח אלא אם תבחר/י להשיב.
            </div>
          </div>

          {error ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-hebrew">
              נשמר בהצלחה.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
