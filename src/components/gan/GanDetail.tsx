"use client";

import {
  Shield,
  Phone,
  X,
  Lock,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  UsersRound,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import type { Gan } from "@/types/ganim";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContactReviewerModal } from "@/components/gan/ContactReviewerModal";
import { GanReviewModal } from "@/components/gan/GanReviewModal";
import { GanAttributeIcons } from "@/components/gan/GanAttributeIcons";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import { getWhatsAppUrl, isPhoneWhatsApp } from "@/lib/phone-utils";
import { cn } from "@/lib/utils";
import {
  formatAgesHe,
  formatGanCategoryAddonLabelHe,
  formatGanCategoryHe,
  formatPriceHe,
  formatFridayScheduleHe,
  formatMealTypeHe,
  formatKosherStatusHe,
  formatSpokenLanguageHe,
  formatVacancyStatusHe,
} from "@/lib/gan-display";

/** Small WhatsApp-style icon for links */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("text-[#25D366]", className)}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.865 9.865 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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
  const { user, session } = useSession();
  const [showAvgFacets, setShowAvgFacets] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<
    Array<{
      id: string;
      user_id: string;
      rating: number;
      is_anonymous: boolean;
      allow_contact: boolean;
      reviewer_public_name?: string | null;
      reviewer_public_email_masked?: string | null;
      advice_to_parents_text: string | null;
      enrollment_years: string | null;
      created_at: string;
      cleanliness_rating?: number | null;
      staff_rating?: number | null;
      safety_rating?: number | null;
    }>
  >([]);
  const [contactReviewId, setContactReviewId] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [refreshReviewsKey, setRefreshReviewsKey] = useState(0);
  const [reviewSort, setReviewSort] = useState<"newest" | "year" | "rating_asc" | "rating_desc">("newest");

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

  const normalizeWebsiteUrl = useMemo(() => {
    return (raw: string | null | undefined): string | null => {
      const s = String(raw ?? "").trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return s;
      // Allow bare domains like "facebook.com/..." and normalize to https.
      if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(s)) return `https://${s}`;
      return null;
    };
  }, []);

  const [localWebsiteUrl, setLocalWebsiteUrl] = useState<string | null>(() =>
    normalizeWebsiteUrl((gan as any).website_url)
  );

  const [editAddress, setEditAddress] = useState<string>("");
  const [editCity, setEditCity] = useState<string>("");
  const [editNeighborhood, setEditNeighborhood] = useState<string>("");
  const [editPikuach, setEditPikuach] = useState<"unknown" | "yes" | "no">("unknown");
  const [editSuggestedType, setEditSuggestedType] = useState<string>("");
  const [editPriceNotes, setEditPriceNotes] = useState<string>("");
  const [editWebsiteUrl, setEditWebsiteUrl] = useState<string>("");
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
  const [editOperatingHours, setEditOperatingHours] = useState<string>("");
  const [editFridaySchedule, setEditFridaySchedule] = useState<NonNullable<Gan["friday_schedule"]>>("UNKNOWN");
  const [editMealType, setEditMealType] = useState<NonNullable<Gan["meal_type"]>>("UNKNOWN");
  const [editVeganFriendly, setEditVeganFriendly] = useState<boolean | null>(null);
  const [editVegetarianFriendly, setEditVegetarianFriendly] = useState<boolean | null>(null);
  const [editMeatServed, setEditMeatServed] = useState<boolean | null>(null);
  const [editAllergyFriendly, setEditAllergyFriendly] = useState<boolean | null>(null);
  const [editKosherStatus, setEditKosherStatus] = useState<NonNullable<Gan["kosher_status"]>>("UNKNOWN");
  const [editKosherCertifier, setEditKosherCertifier] = useState<string>("");
  const [editStaffChildRatio, setEditStaffChildRatio] = useState<string>("");
  const [editFirstAidTrained, setEditFirstAidTrained] = useState<boolean | null>(null);
  const [editLanguagesSpoken, setEditLanguagesSpoken] = useState<NonNullable<Gan["languages_spoken"]>>([]);
  const [editHasOutdoorSpace, setEditHasOutdoorSpace] = useState<boolean | null>(null);
  const [editHasMamad, setEditHasMamad] = useState<boolean | null>(null);
  const [editChugimTypes, setEditChugimTypes] = useState<string>("");
  const [editVacancyStatus, setEditVacancyStatus] = useState<NonNullable<Gan["vacancy_status"]>>("UNKNOWN");
  const [editPhones, setEditPhones] = useState<Array<{ number: string; whatsapp: boolean }>>([]);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [editSavedStatus, setEditSavedStatus] = useState<"approved" | "pending">("pending");
  const [pendingPreview, setPendingPreview] = useState<Record<string, unknown> | null>(null);
  const [ownLatestEditStatus, setOwnLatestEditStatus] = useState<"pending" | "rejected" | null>(
    null
  );
  const editFormTopRef = useRef<HTMLDivElement | null>(null);
  const editFirstMissingFieldRef = useRef<HTMLElement | null>(null);
  const prevGanIdRef = useRef<string | null>(null);
  const [showMissingDetails, setShowMissingDetails] = useState(false);

  useEffect(() => {
    // Reset transient UI state only when moving to a different gan id.
    const ganChanged = prevGanIdRef.current !== gan.id;
    if (ganChanged) {
      prevGanIdRef.current = gan.id;
      setShowEditForm(false);
      setEditSaveError(null);
      setEditSaved(false);
      setEditSavedStatus("pending");
      setPendingPreview(null);
      setOwnLatestEditStatus(null);
      setShowMissingDetails(false);
      setShowReviewModal(false);
    }

    setLocalWebsiteUrl(normalizeWebsiteUrl((gan as any).website_url));

    const street = getGanStreetAddressForDisplay(gan);
    const city = getGanCityForDisplay(gan);
    setEditAddress(street === "אין כתובת" ? "" : street);
    setEditCity(city === "—" ? "" : city);
    setEditNeighborhood(getGanNeighborhoodForDisplay(gan) ?? "");
    setEditPikuach(gan.metadata?.pikuach_ironi === true ? "yes" : gan.metadata?.pikuach_ironi === false ? "no" : "unknown");
    setEditSuggestedType(typeof gan.metadata?.suggested_type === "string" ? gan.metadata.suggested_type : "");
    setEditPriceNotes(typeof gan.price_notes === "string" ? gan.price_notes : "");
    setEditWebsiteUrl(typeof gan.website_url === "string" ? gan.website_url : "");
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
    setEditOperatingHours(gan.operating_hours ?? "");
    setEditFridaySchedule((gan.friday_schedule ?? "UNKNOWN") as any);
    setEditMealType((gan.meal_type ?? "UNKNOWN") as any);
    setEditVeganFriendly(gan.vegan_friendly ?? null);
    setEditVegetarianFriendly(gan.vegetarian_friendly ?? null);
    setEditMeatServed(gan.meat_served ?? null);
    setEditAllergyFriendly(gan.allergy_friendly ?? null);
    setEditKosherStatus((gan.kosher_status ?? "UNKNOWN") as any);
    setEditKosherCertifier(gan.kosher_certifier ?? "");
    setEditStaffChildRatio(gan.staff_child_ratio != null ? String(gan.staff_child_ratio) : "");
    setEditFirstAidTrained(gan.first_aid_trained ?? null);
    setEditLanguagesSpoken(gan.languages_spoken ?? []);
    setEditHasOutdoorSpace(gan.has_outdoor_space ?? null);
    setEditHasMamad(gan.has_mamad ?? null);
    setEditChugimTypes(Array.isArray(gan.chugim_types) ? gan.chugim_types.join(", ") : "");
    setEditVacancyStatus((gan.vacancy_status ?? "UNKNOWN") as any);
    const ph = Array.isArray(gan.metadata?.phone)
      ? gan.metadata.phone
      : gan.metadata?.phone
        ? [String(gan.metadata.phone)]
        : [];
    setEditPhones(
      ph.map((n) => ({ number: String(n).trim(), whatsapp: isPhoneWhatsApp(gan, n) }))
    );
  }, [gan, normalizeWebsiteUrl]);

  useEffect(() => {
    if (!supabase || !user?.id || !gan.id) {
      setOwnLatestEditStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_inputs")
          .select("*")
          .eq("user_id", user.id)
          .eq("gan_id", gan.id)
          .eq("input_type", "edit")
          .in("status", ["pending", "rejected"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setOwnLatestEditStatus(null);
          return;
        }
        if (data) {
          const status = data.status === "pending" ? "pending" : data.status === "rejected" ? "rejected" : null;
          setOwnLatestEditStatus(status);
          if (status === "pending") {
            const raw = data as Record<string, unknown>;
            const cleaned: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(raw)) {
              if (k === "status" || k === "created_at" || k === "id" || k === "user_id" || k === "gan_id") continue;
              if (v !== null) cleaned[k] = v;
            }
            const meta = raw.metadata;
            if (meta && typeof meta === "object" && !Array.isArray(meta)) {
              for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
                if (v !== null && v !== undefined) cleaned[k] = v;
              }
            }
            setPendingPreview((prev) => prev ?? cleaned);
          } else {
            setPendingPreview(null);
          }
        } else {
          setOwnLatestEditStatus(null);
        }
      } catch {
        if (!cancelled) setOwnLatestEditStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gan.id, user?.id]);

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
    setEditSavedStatus("pending");
    if (!supabase || !user) {
      setEditSaveError("נדרשת התחברות כדי לערוך פרטים.");
      return;
    }
    setSaving(true);
    try {
      // Ensure we have a fresh access token (auto-refresh isn't guaranteed to have run yet).
      const nowSec = Math.floor(Date.now() / 1000);
      const shouldRefresh =
        (session?.expires_at != null && session.expires_at - nowSec < 60) || !session?.access_token;
      if (shouldRefresh) {
        try {
          await supabase.auth.refreshSession();
        } catch {
          // ignore; we'll fall back to current session/getSession below
        }
      }

      const token =
        (await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null)) ??
        session?.access_token ??
        null;

      if (!token) throw new Error("פג תוקף ההתחברות. אנא התחבר/י מחדש כדי לשמור שינויים.");

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

      const draftPatch: Record<string, unknown> = {
        address: editAddress.trim() ? editAddress.trim() : null,
        city: editCity.trim() ? editCity.trim() : null,
        neighborhood: editNeighborhood.trim() ? editNeighborhood.trim() : null,
        pikuach_ironi: editPikuach === "unknown" ? null : editPikuach === "yes",
        suggested_type: editSuggestedType.trim() ? editSuggestedType.trim() : null,
        price_notes: editPriceNotes.trim() ? editPriceNotes.trim() : null,
        website_url: editWebsiteUrl.trim() ? editWebsiteUrl.trim() : null,
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
        draftPatch.has_cctv = editCctv !== "none";
        draftPatch.cctv_streamed_online = editCctv === "online" ? true : editCctv === "exceptional" ? false : null;
      }

      draftPatch.operating_hours = editOperatingHours.trim() ? editOperatingHours.trim() : null;
      draftPatch.friday_schedule = editFridaySchedule === "UNKNOWN" ? null : editFridaySchedule;
      draftPatch.meal_type = editMealType === "UNKNOWN" ? null : editMealType;
      draftPatch.vegan_friendly = editVeganFriendly;
      draftPatch.vegetarian_friendly = editVegetarianFriendly;
      draftPatch.meat_served = editMeatServed;
      draftPatch.allergy_friendly = editAllergyFriendly;
      draftPatch.kosher_status = editKosherStatus === "UNKNOWN" ? null : editKosherStatus;
      draftPatch.kosher_certifier = editKosherCertifier.trim() ? editKosherCertifier.trim() : null;
      const ratioNum = editStaffChildRatio.trim() ? Number(editStaffChildRatio.replace(",", ".")) : null;
      draftPatch.staff_child_ratio = ratioNum != null && Number.isFinite(ratioNum) ? ratioNum : null;
      draftPatch.first_aid_trained = editFirstAidTrained;
      draftPatch.languages_spoken = editLanguagesSpoken.length ? editLanguagesSpoken : null;
      draftPatch.has_outdoor_space = editHasOutdoorSpace;
      draftPatch.has_mamad = editHasMamad;
      const chugimArr = editChugimTypes
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      draftPatch.chugim_types = chugimArr.length ? chugimArr : null;
      draftPatch.vacancy_status = editVacancyStatus === "UNKNOWN" ? null : editVacancyStatus;

      const phoneNumbers = editPhones.map((p) => p.number.trim()).filter(Boolean);
      draftPatch.phone = phoneNumbers.length ? phoneNumbers : null;
      draftPatch.phone_whatsapp = phoneNumbers.length
        ? editPhones.filter((p) => p.number.trim() && p.whatsapp).map((p) => p.number.trim())
        : null;

      const normalizeForCompare = (key: string, value: unknown): unknown => {
        if (Array.isArray(value)) {
          return [...value]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "he"));
        }
        if (typeof value === "string") return value.trim() || null;
        return value ?? null;
      };
      const currentComparable: Record<string, unknown> = {
        address: gan.address ?? null,
        city: gan.city ?? null,
        neighborhood: typeof gan.metadata?.neighborhood === "string" ? gan.metadata.neighborhood : null,
        pikuach_ironi:
          typeof gan.metadata?.pikuach_ironi === "boolean" ? gan.metadata.pikuach_ironi : null,
        suggested_type:
          typeof gan.metadata?.suggested_type === "string" ? gan.metadata.suggested_type : null,
        price_notes: gan.price_notes ?? null,
        website_url: gan.website_url ?? null,
        category: gan.category,
        maon_symbol_code: gan.maon_symbol_code ?? null,
        private_supervision: gan.private_supervision ?? "UNKNOWN",
        mishpachton_affiliation: gan.mishpachton_affiliation ?? "UNKNOWN",
        municipal_grade: gan.municipal_grade ?? "UNKNOWN",
        monthly_price_nis: gan.monthly_price_nis == null ? null : Math.round(Number(gan.monthly_price_nis)),
        min_age_months: gan.min_age_months ?? null,
        max_age_months: gan.max_age_months ?? null,
        has_cctv: gan.has_cctv,
        cctv_streamed_online: gan.cctv_streamed_online ?? null,
        operating_hours: gan.operating_hours ?? null,
        friday_schedule: gan.friday_schedule && gan.friday_schedule !== "UNKNOWN" ? gan.friday_schedule : null,
        meal_type: gan.meal_type && gan.meal_type !== "UNKNOWN" ? gan.meal_type : null,
        vegan_friendly: gan.vegan_friendly ?? null,
        vegetarian_friendly: gan.vegetarian_friendly ?? null,
        meat_served: gan.meat_served ?? null,
        allergy_friendly: gan.allergy_friendly ?? null,
        kosher_status: gan.kosher_status && gan.kosher_status !== "UNKNOWN" ? gan.kosher_status : null,
        kosher_certifier: gan.kosher_certifier ?? null,
        staff_child_ratio: gan.staff_child_ratio ?? null,
        first_aid_trained: gan.first_aid_trained ?? null,
        languages_spoken: gan.languages_spoken ?? null,
        has_outdoor_space: gan.has_outdoor_space ?? null,
        has_mamad: gan.has_mamad ?? null,
        chugim_types: gan.chugim_types ?? null,
        vacancy_status: gan.vacancy_status && gan.vacancy_status !== "UNKNOWN" ? gan.vacancy_status : null,
        phone: Array.isArray(gan.metadata?.phone) ? gan.metadata.phone : null,
        phone_whatsapp: Array.isArray(gan.metadata?.phone_whatsapp) ? gan.metadata.phone_whatsapp : null,
      };
      const patch: Record<string, unknown> = {};
      for (const [key, nextRaw] of Object.entries(draftPatch)) {
        const next = normalizeForCompare(key, nextRaw);
        const current = normalizeForCompare(key, currentComparable[key]);
        const changed = JSON.stringify(next) !== JSON.stringify(current);
        // No delete semantics in this flow: null means "no update", not "clear".
        if (!changed) continue;
        if (nextRaw === null) continue;
        patch[key] = nextRaw;
      }
      if (Object.keys(patch).length === 0) {
        setEditSaveError("לא זוהו שינויים לשמירה.");
        return;
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
        const raw = typeof data?.error === "string" ? data.error : "שגיאה בשמירת פרטים";
        const msg =
          raw === "Authentication required"
            ? "פג תוקף ההתחברות. אנא התחבר/י מחדש כדי לשמור שינויים."
            : raw;
        throw new Error(msg);
      }
      // Update link immediately (don’t wait for a full reload).
      setLocalWebsiteUrl(normalizeWebsiteUrl(editWebsiteUrl));
      const savedStatus =
        data?.status === "approved" ? "approved" : "pending";
      if (savedStatus === "approved") {
        setPendingPreview(null);
        setOwnLatestEditStatus(null);
      } else {
        setPendingPreview(patch);
        setOwnLatestEditStatus("pending");
      }
      setEditSavedStatus(savedStatus);
      setEditSaved(true);
      setShowEditForm(false);
      onReviewSaved?.(); // refresh gan list/details (Python script updates ganim_v2)
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

  const pendingPreviewEntries = useMemo(() => {
    if (!pendingPreview) return [];
    const entries: Array<{ key: string; label: string; value: string }> = [];
    const yesNo = (v: unknown) => (v === true ? "כן" : v === false ? "לא" : "לא ידוע");
    const push = (key: string, label: string, value: string) => {
      entries.push({ key, label, value });
    };
    const formatValue = (key: string, value: unknown): string => {
      if (value === null) return "";
      if (key === "friday_schedule") return formatFridayScheduleHe(value as any) ?? "לא ידוע";
      if (key === "vacancy_status") return formatVacancyStatusHe(value as any) ?? "לא ידוע";
      if (key === "meal_type") return formatMealTypeHe(value as any) ?? "לא ידוע";
      if (key === "kosher_status") return formatKosherStatusHe(value as any) ?? "לא ידוע";
      if (key === "category") return formatGanCategoryHe(value as any);
      if (key === "monthly_price_nis") return `${Number(value).toLocaleString("he-IL")}₪`;
      if (key === "has_mamad" || key === "has_outdoor_space" || key === "first_aid_trained") return yesNo(value);
      if (key === "vegan_friendly" || key === "vegetarian_friendly" || key === "meat_served" || key === "allergy_friendly") return yesNo(value);
      if (key === "languages_spoken" && Array.isArray(value)) {
        const labels = value.map((v) => formatSpokenLanguageHe(v as any)).filter(Boolean);
        return labels.length ? labels.join(", ") : "לא ידוע";
      }
      if ((key === "phone" || key === "phone_whatsapp" || key === "chugim_types") && Array.isArray(value)) {
        return value.map((v) => String(v)).join(", ");
      }
      if (key === "cctv_streamed_online" || key === "has_cctv") {
        const has =
          key === "has_cctv" ? value === true : pendingPreview.has_cctv === true;
        const streamed =
          key === "cctv_streamed_online" ? value : pendingPreview.cctv_streamed_online;
        if (!has) return "אין";
        if (streamed === true) return "יש ואפשר להתחבר אונליין";
        if (streamed === false) return "יש (פתוח למקרים חריגים)";
        return "יש";
      }
      if (value === undefined) return "";
      return String(value).trim();
    };
    const labels: Record<string, string> = {
      address: "כתובת",
      city: "עיר",
      neighborhood: "שכונה",
      website_url: "אתר",
      category: "סוג",
      maon_symbol_code: "סמל מעון",
      private_supervision: "פיקוח פרטי",
      mishpachton_affiliation: "שיוך משפחתון",
      municipal_grade: "שכבה",
      monthly_price_nis: "מחיר חודשי",
      price_notes: "הערת מחיר",
      min_age_months: "גיל מינימום (חודשים)",
      max_age_months: "גיל מקסימום (חודשים)",
      operating_hours: "שעות פעילות",
      friday_schedule: "ימי שישי",
      meal_type: "סוג אוכל",
      vegan_friendly: "טבעוני",
      vegetarian_friendly: "צמחוני",
      meat_served: "מגיש בשר",
      allergy_friendly: "ידידותי לאלרגיות",
      kosher_status: "כשרות",
      kosher_certifier: "גוף כשרות",
      staff_child_ratio: "יחס צוות-ילד",
      first_aid_trained: "עזרה ראשונה",
      languages_spoken: "שפות",
      has_outdoor_space: "חצר חיצונית",
      has_mamad: "ממ\"ד / מיקלט",
      chugim_types: "חוגים",
      vacancy_status: "מקום פנוי",
      phone: "טלפון",
      phone_whatsapp: "טלפון וואטסאפ",
      has_cctv: "CCTV",
      cctv_streamed_online: "CCTV",
    };
    const shownCctv = new Set<string>();
    for (const [key, label] of Object.entries(labels)) {
      if (!(key in pendingPreview)) continue;
      if ((key === "has_cctv" || key === "cctv_streamed_online") && shownCctv.size > 0) continue;
      const raw = (pendingPreview as Record<string, unknown>)[key];
      const val = formatValue(key, raw);
      if (!val) continue;
      push(key, label, val);
      if (key === "has_cctv" || key === "cctv_streamed_online") {
        shownCctv.add("cctv");
      }
    }
    return entries;
  }, [pendingPreview]);

  const displayOperatingHours =
    ownLatestEditStatus === "pending" && typeof pendingPreview?.operating_hours === "string"
      ? pendingPreview.operating_hours
      : gan.operating_hours;
  const displayFridaySchedule =
    ownLatestEditStatus === "pending" && pendingPreview?.friday_schedule != null
      ? (pendingPreview.friday_schedule as Gan["friday_schedule"])
      : gan.friday_schedule;
  const displayPriceText =
    ownLatestEditStatus === "pending"
      ? formatPriceHe({
          ...gan,
          monthly_price_nis:
            typeof pendingPreview?.monthly_price_nis === "number"
              ? Number(pendingPreview.monthly_price_nis)
              : gan.monthly_price_nis ?? null,
        })
      : priceText;
  const displayPriceNotes =
    ownLatestEditStatus === "pending" && typeof pendingPreview?.price_notes === "string"
      ? pendingPreview.price_notes
      : gan.price_notes;

  const signIn = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  };

  useEffect(() => {
    if (!canViewReviews || !supabase) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError(null);

    (async () => {
      try {
        const selectCols =
          "id,user_id,rating,is_anonymous,allow_contact,reviewer_public_name,reviewer_public_email_masked,advice_to_parents_text,enrollment_years,created_at,cleanliness_rating,staff_rating,safety_rating";
        const queryNew = supabase
          .from("confirmed_reviews")
          .select(selectCols)
          .eq("gan_id", gan.id)
          .order("created_at", { ascending: false });
        let data: any[] | null = null;
        let error: any = null;
        ({ data, error } = (await (queryNew as any)) as any);

        // Backwards compatible: if allow_contact doesn't exist, retry without it
        if (error) {
          const msg = typeof (error as any)?.message === "string" ? String((error as any).message) : "";
          if (msg.includes("does not exist")) {
            ({ data, error } = (await (supabase
              .from("confirmed_reviews")
              .select("id,user_id,rating,is_anonymous,reviewer_public_name,reviewer_public_email_masked,advice_to_parents_text,created_at,allow_contact,enrollment_years")
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

        const rows = data ?? [];
        setReviews(
          rows.map((r: any) => ({
            id: String(r.id),
            user_id: String(r.user_id),
            rating: Number(r.rating ?? 0),
            is_anonymous: Boolean(r.is_anonymous),
            allow_contact: r.allow_contact ?? r.available_for_private_messages ?? true,
            reviewer_public_name:
              typeof r.reviewer_public_name === "string" ? r.reviewer_public_name : null,
            reviewer_public_email_masked:
              typeof r.reviewer_public_email_masked === "string"
                ? r.reviewer_public_email_masked
                : null,
            advice_to_parents_text:
              typeof r.advice_to_parents_text === "string" ? r.advice_to_parents_text : null,
            enrollment_years:
              typeof r.enrollment_years === "string" ? r.enrollment_years : null,
            created_at: String(r.created_at),
            cleanliness_rating: r.cleanliness_rating,
            staff_rating: r.staff_rating,
            safety_rating: r.safety_rating,
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
  }, [canViewReviews, gan.id, refreshReviewsKey]);

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
            {localWebsiteUrl ? (
              <a
                href={localWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:underline"
                title="פתח אתר"
              >
                <span className="truncate">{gan.name_he}</span>
                <ExternalLink className="w-4 h-4 shrink-0" />
              </a>
            ) : (
              gan.name_he
            )}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
            <X className="w-5 h-5" />
          </Button>
        </div>
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
        <div className="rounded-lg border border-gan-accent/30 bg-white p-4 space-y-3 min-w-0">
          {ownLatestEditStatus === "rejected" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="text-xs font-hebrew font-semibold text-rose-900">
                העדכון האחרון ששלחת נדחה. אפשר לערוך ולשלוח שוב.
              </div>
            </div>
          ) : null}
          {ownLatestEditStatus === "pending" && pendingPreviewEntries.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-hebrew font-semibold text-amber-900">
                יש לך עדכון ממתין לאימות בגן הזה.
              </div>
            </div>
          ) : null}
          {pendingPreviewEntries.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-hebrew font-semibold text-amber-900">
                העדכון שלך ממתין לאימות (מוצג לך בלבד)
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1">
                {pendingPreviewEntries.map((e) => (
                  <div key={e.key} className="text-xs font-hebrew text-amber-900">
                    <span className="font-semibold">{e.label}: </span>
                    <span>{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
                    שינויים חדשים נשמרים קודם במצב ממתין לאימות ורק לאחר אישור מפורסמים לכולם.
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm min-w-0">
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">כתובת</dt>
            <dd className="text-gray-600 font-hebrew min-w-0 break-words">{getGanStreetAddressForDisplay(gan)}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">טלפון</dt>
            <dd className="text-gray-600 min-w-0 break-words">
              {phones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {phones.map((p) => {
                    const useWhatsApp = isPhoneWhatsApp(gan, p);
                    return useWhatsApp ? (
                      <a
                        key={p}
                        href={getWhatsAppUrl(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-gan-primary hover:underline"
                        title="שלח הודעה בוואטסאפ"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        {p}
                      </a>
                    ) : (
                      <a
                        key={p}
                        href={`tel:${p}`}
                        className="inline-flex items-center gap-1 text-gan-primary hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {p}
                      </a>
                    );
                  })}
                </div>
              ) : (
                "—"
              )}
            </dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">עיר</dt>
            <dd className="text-gray-600 font-hebrew min-w-0 break-words">{getGanCityForDisplay(gan)}</dd>
            {localWebsiteUrl ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">אתר</dt>
                <dd className="text-gray-600 font-hebrew min-w-0">
                  <a
                    href={localWebsiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0 text-gan-primary hover:underline"
                    title={localWebsiteUrl}
                  >
                    <span className="break-all min-w-0 flex-1">{localWebsiteUrl}</span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                </dd>
              </>
            ) : null}
            {neighborhood ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">שכונה</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{neighborhood}</dd>
              </>
            ) : null}
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">סוג</dt>
            <dd className="text-gray-600 font-hebrew min-w-0 break-words">{categoryText}</dd>
            {addon ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">{addon.label}</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{addon.value}</dd>
              </>
            ) : null}
            {pikuachText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">פיקוח עירוני</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{pikuachText}</dd>
              </>
            ) : null}
            {agesText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">גילאים</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{agesText}</dd>
              </>
            ) : null}
            {displayOperatingHours && String(displayOperatingHours).trim() ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">שעות פעילות</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{displayOperatingHours}</dd>
              </>
            ) : null}
            {displayFridaySchedule &&
            displayFridaySchedule !== "UNKNOWN" &&
            formatFridayScheduleHe(displayFridaySchedule) ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">ימי שישי</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">
                  {formatFridayScheduleHe(displayFridaySchedule)}
                </dd>
              </>
            ) : null}
            {gan.staff_child_ratio != null && Number.isFinite(Number(gan.staff_child_ratio)) ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">יחס צוות-ילד</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">
                  {(() => {
                    const r = Number(gan.staff_child_ratio);
                    return r >= 1 ? `1:${Math.round(1 / r)}` : `1:${(1 / r).toFixed(1)}`;
                  })()}
                </dd>
              </>
            ) : null}
            {gan.chugim_types && gan.chugim_types.length > 0 ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">חוגים</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">{gan.chugim_types.join(", ")}</dd>
              </>
            ) : null}
            {displayPriceText ? (
              <>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">מחיר</dt>
                <dd className="text-gray-600 font-hebrew min-w-0 break-words">
                  <div>{displayPriceText}</div>
                  {displayPriceNotes ? (
                    <div className="mt-1 text-[12px] text-gray-500 font-hebrew whitespace-pre-wrap">
                      {displayPriceNotes}
                    </div>
                  ) : null}
                </dd>
              </>
            ) : null}
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap shrink-0">CCTV</dt>
            <dd className="text-gray-600 font-hebrew min-w-0 break-words">{cctvText}</dd>
            <div className="col-span-2 min-w-0">
              <GanAttributeIcons gan={gan} />
            </div>
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
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">אתר (אופציונלי)</label>
                      <input
                        value={editWebsiteUrl}
                        onChange={(e) => setEditWebsiteUrl(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="https://facebook.com/... / https://linkedin.com/... / https://example.com"
                        inputMode="url"
                      />
                      <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                        נשמר כקישור (http/https). אם אין https:// נוסיף אוטומטית.
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">טלפון</label>
                      <div className="space-y-2">
                        {editPhones.map((entry, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={entry.number}
                              onChange={(e) =>
                                setEditPhones((prev) =>
                                  prev.map((p, i) =>
                                    i === idx ? { ...p, number: e.target.value } : p
                                  )
                                )
                              }
                              className="flex-1 rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                              placeholder="050-1234567"
                              inputMode="tel"
                            />
                            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer font-hebrew text-sm text-gray-600">
                              <input
                                type="checkbox"
                                checked={entry.whatsapp}
                                onChange={(e) =>
                                  setEditPhones((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, whatsapp: e.target.checked } : p
                                    )
                                  )
                                }
                                className="rounded border-gan-accent/50"
                              />
                              <span>וואטסאפ</span>
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setEditPhones((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 text-gray-500 hover:text-red-600 rounded"
                              title="הסר"
                              aria-label="הסר"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditPhones((prev) => [...prev, { number: "", whatsapp: true }])}
                          className="inline-flex items-center gap-1.5 text-sm text-gan-primary hover:underline font-hebrew"
                        >
                          <Plus className="w-4 h-4" />
                          הוסף מספר
                        </button>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                        סמן וואטסאפ אם אפשר לשלוח הודעה במספר הזה.
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">שעות פעילות</label>
                      <input
                        value={editOperatingHours}
                        onChange={(e) => setEditOperatingHours(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="07:30–16:00, א'-ה'"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">ימי שישי</label>
                      <select
                        value={editFridaySchedule}
                        onChange={(e) => setEditFridaySchedule(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="UNKNOWN">לא ידוע</option>
                        <option value="NONE">ללא</option>
                        <option value="EVERY_FRIDAY">כל שישי</option>
                        <option value="EVERY_OTHER_FRIDAY">כל שבועיים</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">סוג אוכל</label>
                      <select
                        value={editMealType}
                        onChange={(e) => setEditMealType(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="UNKNOWN">לא ידוע</option>
                        <option value="IN_HOUSE_COOK">בישול במקום</option>
                        <option value="EXTERNAL_CATERING">קייטרינג חיצוני</option>
                        <option value="PARENTS_BRING">הורים מביאים</option>
                        <option value="MIXED">מעורב</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">טבעוני</label>
                      <select
                        value={editVeganFriendly === null ? "" : editVeganFriendly ? "yes" : "no"}
                        onChange={(e) =>
                          setEditVeganFriendly(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">צמחוני</label>
                      <select
                        value={editVegetarianFriendly === null ? "" : editVegetarianFriendly ? "yes" : "no"}
                        onChange={(e) =>
                          setEditVegetarianFriendly(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">מגיש בשר</label>
                      <select
                        value={editMeatServed === null ? "" : editMeatServed ? "yes" : "no"}
                        onChange={(e) =>
                          setEditMeatServed(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">ידידותי לאלרגיות</label>
                      <select
                        value={editAllergyFriendly === null ? "" : editAllergyFriendly ? "yes" : "no"}
                        onChange={(e) =>
                          setEditAllergyFriendly(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">כשרות</label>
                      <select
                        value={editKosherStatus}
                        onChange={(e) => setEditKosherStatus(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="UNKNOWN">לא ידוע</option>
                        <option value="CERTIFIED">כשר</option>
                        <option value="NOT_CERTIFIED">לא כשר</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">גוף כשרות (אופציונלי)</label>
                      <input
                        value={editKosherCertifier}
                        onChange={(e) => setEditKosherCertifier(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="רבנות, בד״ץ..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">יחס צוות-ילד</label>
                      <input
                        value={editStaffChildRatio}
                        onChange={(e) => setEditStaffChildRatio(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="0.33 = 1:3"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">עזרה ראשונה</label>
                      <select
                        value={editFirstAidTrained === null ? "" : editFirstAidTrained ? "yes" : "no"}
                        onChange={(e) =>
                          setEditFirstAidTrained(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">חצר חיצונית</label>
                      <select
                        value={editHasOutdoorSpace === null ? "" : editHasOutdoorSpace ? "yes" : "no"}
                        onChange={(e) =>
                          setEditHasOutdoorSpace(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">ממ&quot;ד / מיקלט</label>
                      <select
                        value={editHasMamad === null ? "" : editHasMamad ? "yes" : "no"}
                        onChange={(e) =>
                          setEditHasMamad(e.target.value === "" ? null : e.target.value === "yes")
                        }
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="">לא ידוע</option>
                        <option value="yes">כן</option>
                        <option value="no">לא</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">מקום פנוי</label>
                      <select
                        value={editVacancyStatus}
                        onChange={(e) => setEditVacancyStatus(e.target.value as any)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white"
                      >
                        <option value="UNKNOWN">לא ידוע</option>
                        <option value="Available">יש מקום</option>
                        <option value="Limited">מקומות מוגבלים</option>
                        <option value="Full">מלא / רשימת המתנה</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">שפות (בחרו את כולן)</label>
                      <div className="flex flex-wrap gap-2">
                        {(["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"] as const).map((lang) => (
                          <label key={lang} className="flex items-center gap-2 text-sm font-hebrew">
                            <input
                              type="checkbox"
                              checked={editLanguagesSpoken.includes(lang)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditLanguagesSpoken([...editLanguagesSpoken, lang]);
                                } else {
                                  setEditLanguagesSpoken(editLanguagesSpoken.filter((l) => l !== lang));
                                }
                              }}
                            />
                            {formatSpokenLanguageHe(lang)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1 font-hebrew">חוגים (מופרדים בפסיק)</label>
                      <input
                        value={editChugimTypes}
                        onChange={(e) => setEditChugimTypes(e.target.value)}
                        className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
                        placeholder="מוזיקה, אמנות, ספורט..."
                      />
                    </div>
                  </div>

                  {editSaveError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
                      {editSaveError}
                    </div>
                  ) : null}
                  {editSaved ? (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-hebrew">
                      {editSavedStatus === "approved"
                        ? "השינויים נשמרו ואושרו אוטומטית."
                        : "השינויים נשמרו וממתינים לאימות לפני פרסום."}
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
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <h4 className="font-medium text-gan-dark">ביקורות הורים</h4>
            <Button
              size="sm"
              variant="ghost"
              className="gap-2 whitespace-nowrap h-8 px-2 text-xs text-gan-primary hover:text-gan-dark"
              onClick={() => {
                if (!user) {
                  (onRequestLogin ?? signIn)();
                } else {
                  setShowReviewModal(true);
                }
              }}
            >
              <UsersRound className="w-4 h-4" />
              הייתי הורה כאן
            </Button>
          </div>
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
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-hebrew text-gray-600">מיון:</label>
                    <select
                      value={reviewSort}
                      onChange={(e) => setReviewSort(e.target.value as typeof reviewSort)}
                      className="rounded border border-gan-accent/50 px-2 py-1 text-xs font-hebrew bg-white"
                    >
                      <option value="newest">חדש ביותר</option>
                      <option value="year">לפי שנה</option>
                      <option value="rating_desc">דירוג גבוה לנמוך</option>
                      <option value="rating_asc">דירוג נמוך לגבוה</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    {[...reviews]
                      .sort((a, b) => {
                        if (reviewSort === "newest")
                          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        if (reviewSort === "year") {
                          const ya = a.enrollment_years ?? "";
                          const yb = b.enrollment_years ?? "";
                          return yb.localeCompare(ya);
                        }
                        if (reviewSort === "rating_desc") return b.rating - a.rating;
                        if (reviewSort === "rating_asc") return a.rating - b.rating;
                        return 0;
                      })
                      .map((r) => {
                        const isSilentRef = !r.advice_to_parents_text && r.allow_contact;
                        const displayName = r.is_anonymous
                          ? "הורה אנונימי"
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
                            : r.reviewer_public_name
                              ? r.reviewer_public_email_masked
                                ? `${r.reviewer_public_name} (${r.reviewer_public_email_masked})`
                                : r.reviewer_public_name
                              : r.reviewer_public_email_masked || "הורה";

                        return (
                          <div
                            key={r.id}
                            className={`rounded-lg p-3 ${
                              isSilentRef
                                ? "border border-dashed border-gan-accent/40 bg-gan-muted/10"
                                : "border border-gan-accent/30 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <StarRating value={r.rating} showValue />
                                  <span className="text-[11px] text-gray-500 font-hebrew">
                                    {displayName}
                                  </span>
                                  {r.enrollment_years ? (
                                    <span className="text-[11px] text-gray-500 font-hebrew">
                                      מחזור {r.enrollment_years}
                                    </span>
                                  ) : null}
                                  <span className="text-[11px] text-gray-500 font-hebrew">
                                    {formatReviewDate(r.created_at)}
                                  </span>
                                </div>
                                {r.advice_to_parents_text ? (
                                  <div className="mt-2 text-sm text-gray-700 font-hebrew whitespace-pre-wrap">
                                    {r.advice_to_parents_text}
                                  </div>
                                ) : isSilentRef ? (
                                  <div className="mt-2 text-sm text-gray-600 font-hebrew italic">
                                    ההורה הזה לא כתב ביקורת ציבורית אך זמין/ה לשאלות פרטיות.
                                  </div>
                                ) : null}
                              </div>
                              {user && r.user_id !== user.id && r.allow_contact ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 gap-1"
                                  onClick={() => setContactReviewId(r.id)}
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  שלח הודעה
                                </Button>
                              ) : r.user_id === user?.id ? (
                                <div className="text-[11px] text-gray-500 font-hebrew">זו הביקורת שלך</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
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
      {showReviewModal ? (
        <GanReviewModal
          ganId={gan.id}
          ganName={gan.name_he}
          initialData={(() => {
            const r = reviews.find((rev) => rev.user_id === user?.id);
            if (!r) return null;
            return {
              rating: r.rating,
              cleanliness_rating: r.cleanliness_rating ?? null,
              staff_rating: r.staff_rating ?? null,
              safety_rating: r.safety_rating ?? null,
              advice_to_parents_text: r.advice_to_parents_text,
              enrollment_years: r.enrollment_years,
              is_anonymous: r.is_anonymous,
              allow_contact: r.allow_contact,
            };
          })()}
          onClose={() => setShowReviewModal(false)}
          onSaved={() => {
            setRefreshReviewsKey((k) => k + 1);
            onReviewSaved?.();
          }}
          onOpenEditGan={() => {
            setShowReviewModal(false);
            setShowEditForm(true);
            requestAnimationFrame(() => {
              editFormTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      ) : null}
    </Card>
  );
}
