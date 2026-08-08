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
  Share2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import type { Gan } from "@/types/ganim";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContactReviewerModal } from "@/components/gan/ContactReviewerModal";
import { GanEditForm, type EditSaveResult } from "@/components/gan/GanEditForm";
import { GanReviewModal } from "@/components/gan/GanReviewModal";
import { GanAttributeIcons } from "@/components/gan/GanAttributeIcons";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import { getWhatsAppUrl, isPhoneWhatsApp } from "@/lib/phone-utils";
import { cn, normalizeWebsiteUrl } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { tryNavigatorShare } from "@/lib/native-share";
import { getGanShareUrl } from "@/lib/site-url";
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

interface GanDetailProps {
  gan: Gan;
  onClose: () => void;
  onBack?: () => void;
  onSelectGanForContribution?: (ganId: string) => boolean;
  canViewReviews: boolean; // Give-to-Get: true if user has contributed
  unlockDefaults?: {
    review_full_access_days: number;
    bounty_full_access_days: number;
    bounty_required_tasks: number;
    onboarding_review_quota: number;
  };
  unlockFlags?: {
    bounty_unlock: boolean;
    referral_unlock: boolean;
    onboarding_unlock: boolean;
  };
  onRequestLogin?: () => void;
  onReviewSaved?: () => void;
  onEntitlementChanged?: () => void;
}

interface UnlockProgressPayload {
  threshold_x?: number;
  mission?: {
    qualifies_on_submit?: boolean;
    has_written_review_submission?: boolean;
    has_stars_submission?: boolean;
    latest_review_status?: string | null;
    latest_edit_status?: string | null;
    latest_edit_changed_fields?: number;
    best_edit_changed_fields?: number;
    pending_count?: number;
    approved_count?: number;
  };
  access?: {
    can_view_reviews?: boolean;
    has_full_access?: boolean;
    review_quota_remaining?: number;
  };
}

export function GanDetail({
  gan,
  onClose,
  onBack,
  onSelectGanForContribution,
  canViewReviews,
  unlockDefaults,
  unlockFlags,
  onRequestLogin,
  onReviewSaved,
  onEntitlementChanged,
}: GanDetailProps) {
  const REJECTED_NOTICE_DURATION_MS = 24 * 60 * 60 * 1000;
  const { user, session } = useSession();
  const [showAvgFacets, setShowAvgFacets] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
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
  const [showUnlockOptions, setShowUnlockOptions] = useState(false);
  const [unlockStep, setUnlockStep] = useState<"full" | "fallback">("full");
  const [showContributionInUnlock, setShowContributionInUnlock] = useState(false);
  const [contributionGanQuery, setContributionGanQuery] = useState("");
  const [contributionGanLoading, setContributionGanLoading] = useState(false);
  const [contributionGanOptions, setContributionGanOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedContributionGan, setSelectedContributionGan] = useState<{ id: string; label: string }>({
    id: gan.id,
    label: gan.name_he,
  });
  const [showOnboardingInUnlock, setShowOnboardingInUnlock] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  const [unlockProgress, setUnlockProgress] = useState<UnlockProgressPayload | null>(null);
  const [unlockProgressError, setUnlockProgressError] = useState<string | null>(null);
  const [hasUnlockJourneyStarted, setHasUnlockJourneyStarted] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [onboardingCity, setOnboardingCity] = useState("");
  const [onboardingKidsCount, setOnboardingKidsCount] = useState("1");
  const [onboardingKidsAges, setOnboardingKidsAges] = useState("");
  const [onboardingNeighborhood, setOnboardingNeighborhood] = useState("");
  const [onboardingBudgetRange, setOnboardingBudgetRange] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  const reviewFullAccessDays = Math.max(1, Math.floor(unlockDefaults?.review_full_access_days ?? 365));
  const onboardingReviewQuota = Math.max(1, Math.floor(unlockDefaults?.onboarding_review_quota ?? 3));
  const contributionMinFields = Math.max(
    1,
    Math.floor(unlockProgress?.threshold_x ?? unlockDefaults?.bounty_required_tasks ?? 3)
  );

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

  const shareOrCopyLink = useCallback(async () => {
    const url = getGanShareUrl(gan.id);
    const title = `${gan.name_he} | GanMatch`;
    const text = `מצאתי גן ב-GanMatch שאולי יעניין אותך: ${gan.name_he}`;

    const outcome = await tryNavigatorShare({ title, text, url });
    if (outcome === "shared") {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
      return;
    }
    if (outcome === "aborted") return;

    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      try {
        window.prompt("העתיקו את הקישור:", url);
      } catch {
        // ignore
      }
    }
  }, [gan.id, gan.name_he]);

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

  const [localWebsiteUrl, setLocalWebsiteUrl] = useState<string | null>(() =>
    normalizeWebsiteUrl((gan as any).website_url)
  );

  const [pendingPreview, setPendingPreview] = useState<Record<string, unknown> | null>(null);
  const [ownLatestEditStatus, setOwnLatestEditStatus] = useState<"pending" | "rejected" | null>(
    null
  );
  const [showRejectedNotice, setShowRejectedNotice] = useState(false);
  const contributionPanelRef = useRef<HTMLDivElement | null>(null);
  const prevGanIdRef = useRef<string | null>(null);
  const lastLockWallTrackedGanRef = useRef<string | null>(null);
  const unlockRefreshTriggeredRef = useRef(false);
  const [showMissingDetails, setShowMissingDetails] = useState(false);

  useEffect(() => {
    // Reset transient UI state only when moving to a different gan id.
    const ganChanged = prevGanIdRef.current !== gan.id;
    if (ganChanged) {
      prevGanIdRef.current = gan.id;
      setShowEditForm(false);
      setPendingPreview(null);
      setOwnLatestEditStatus(null);
      setShowRejectedNotice(false);
      setShowMissingDetails(false);
      setShowReviewModal(false);
      setShowUnlockOptions(false);
      setUnlockStep("full");
      setShowContributionInUnlock(false);
      setContributionGanQuery("");
      setContributionGanOptions([]);
      setSelectedContributionGan({ id: gan.id, label: gan.name_he });
      setShowOnboardingInUnlock(false);
      setUnlockMessage(null);
    }

    setLocalWebsiteUrl(normalizeWebsiteUrl((gan as any).website_url));
  }, [gan]);

  useEffect(() => {
    if (!supabase || !user?.id || !gan.id) {
      setOwnLatestEditStatus(null);
      setPendingPreview(null);
      setShowRejectedNotice(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: pendingData, error: pendingError } = await supabase
          .from("user_inputs")
          .select("*")
          .eq("user_id", user.id)
          .eq("gan_id", gan.id)
          .eq("input_type", "edit")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (pendingError) {
          setOwnLatestEditStatus(null);
          setPendingPreview(null);
          setShowRejectedNotice(false);
          return;
        }
        if (pendingData) {
          setOwnLatestEditStatus("pending");
          const raw = pendingData as Record<string, unknown>;
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
          setOwnLatestEditStatus(null);
          setPendingPreview(null);
        }

        const { data: rejectedData, error: rejectedError } = await supabase
          .from("user_inputs")
          .select("id")
          .eq("user_id", user.id)
          .eq("gan_id", gan.id)
          .eq("input_type", "edit")
          .eq("status", "rejected")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (rejectedError || !rejectedData?.id) {
          setShowRejectedNotice(false);
          return;
        }

        const now = Date.now();
        const { data: windowRow, error: windowReadError } = await supabase
          .from("user_rejection_notice_windows")
          .select("rejected_input_id,visible_until")
          .eq("user_id", user.id)
          .eq("gan_id", gan.id)
          .maybeSingle();
        if (cancelled) return;
        if (windowReadError) {
          // Graceful fallback if migration isn't applied yet.
          setShowRejectedNotice(true);
          return;
        }

        const existingRejectedId =
          typeof (windowRow as any)?.rejected_input_id === "string"
            ? String((windowRow as any).rejected_input_id)
            : null;
        const existingVisibleUntil = Number(
          Date.parse(typeof (windowRow as any)?.visible_until === "string" ? (windowRow as any).visible_until : "")
        );

        if (!windowRow || existingRejectedId !== rejectedData.id) {
          const visibleUntilIso = new Date(now + REJECTED_NOTICE_DURATION_MS).toISOString();
          const { error: upsertErr } = await supabase
            .from("user_rejection_notice_windows")
            .upsert(
              {
                user_id: user.id,
                gan_id: gan.id,
                rejected_input_id: rejectedData.id,
                visible_until: visibleUntilIso,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,gan_id" }
            );
          if (cancelled) return;
          if (upsertErr) {
            setShowRejectedNotice(true);
            return;
          }
          setShowRejectedNotice(true);
          return;
        }

        setShowRejectedNotice(Number.isFinite(existingVisibleUntil) && existingVisibleUntil > now);
      } catch {
        if (!cancelled) {
          setOwnLatestEditStatus(null);
          setPendingPreview(null);
          setShowRejectedNotice(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gan.id, user?.id, REJECTED_NOTICE_DURATION_MS]);

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
    setShowReviewModal(false);
    requestAnimationFrame(() => {
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
        (document.getElementById("gan-edit-address") as HTMLElement | null)?.focus?.();
      }
    });
  };

  const openReviewAndFocus = () => {
    if (!user) {
      (onRequestLogin ?? signIn)();
      return;
    }
    setShowReviewModal(true);
    setShowEditForm(false);
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

  const missionPending = useMemo(() => {
    return (
      unlockProgress?.mission?.latest_review_status === "pending" ||
      unlockProgress?.mission?.latest_edit_status === "pending" ||
      Number(unlockProgress?.mission?.pending_count ?? 0) > 0
    );
  }, [unlockProgress]);

  const missionQualifiesOnSubmit = Boolean(unlockProgress?.mission?.qualifies_on_submit);
  const missionHasFullAccess = Boolean(canViewReviews || unlockProgress?.access?.has_full_access);
  const missionQuotaRemaining = Math.max(0, Number(unlockProgress?.access?.review_quota_remaining ?? 0));
  const missionHasAnyProgress =
    missionHasFullAccess ||
    missionQualifiesOnSubmit ||
    missionPending ||
    Number(unlockProgress?.mission?.best_edit_changed_fields ?? 0) > 0 ||
    !!unlockProgress?.mission?.latest_review_status ||
    !!unlockProgress?.mission?.latest_edit_status ||
    missionQuotaRemaining > 0;
  const showModalMissionTracker = showUnlockOptions && (hasUnlockJourneyStarted || missionHasAnyProgress);

  const signIn = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  };

  const getBearerToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const shouldRefresh =
      (session?.expires_at != null && session.expires_at - nowSec < 60) || !session?.access_token;
    if (shouldRefresh) {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore and fall back to latest cached session/getSession response
      }
    }
    return (
      (await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null)) ??
      session?.access_token ??
      null
    );
  }, [session?.access_token, session?.expires_at]);

  const refreshUnlockProgress = useCallback(async () => {
    if (!user || canViewReviews) return;
    const token = await getBearerToken();
    if (!token) return;
    try {
      const res = await fetch("/api/entitlements/progress", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnlockProgressError(typeof payload?.error === "string" ? payload.error : "שגיאה בטעינת סטטוס פתיחה");
        return;
      }
      const progress = payload as UnlockProgressPayload;
      setUnlockProgress(progress);
      setUnlockProgressError(null);
      if (progress?.access?.can_view_reviews) setHasUnlockJourneyStarted(true);
    } catch {
      setUnlockProgressError("שגיאת רשת בטעינת סטטוס פתיחה.");
    }
  }, [canViewReviews, getBearerToken, user]);

  const handleEditSaved = useCallback((result: EditSaveResult) => {
    setLocalWebsiteUrl(result.normalizedWebsiteUrl);
    if (result.status === "approved") {
      setPendingPreview(null);
      setOwnLatestEditStatus(null);
    } else {
      setPendingPreview(result.patch);
      setOwnLatestEditStatus("pending");
    }
    setShowEditForm(false);
    setHasUnlockJourneyStarted(true);
    onReviewSaved?.();
    onEntitlementChanged?.();
    void refreshUnlockProgress();
  }, [onEntitlementChanged, onReviewSaved, refreshUnlockProgress]);

  const trackUnlockTelemetry = useCallback(
    async (
      eventName:
        | "lock_wall_viewed"
        | "unlock_path_selected"
        | "contribution_submitted"
        | "contribution_approved"
        | "entitlement_granted"
        | "review_viewed"
        | "quota_consumed",
      path: "review" | "bounty" | "referral" | "onboarding",
      metadata?: Record<string, unknown>
    ) => {
      if (!user) return;
      const token = await getBearerToken();
      if (!token) return;
      try {
        await fetch("/api/telemetry/track", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            event_name: eventName,
            path,
            source_surface: "gan_detail_reviews",
            entity_id: gan.id,
            metadata: metadata ?? null,
          }),
        });
      } catch {
        // Telemetry is best-effort only.
      }
    },
    [gan.id, getBearerToken, user]
  );

  useEffect(() => {
    if (canViewReviews || !user) return;
    if (lastLockWallTrackedGanRef.current === gan.id) return;
    lastLockWallTrackedGanRef.current = gan.id;
    void trackUnlockTelemetry("lock_wall_viewed", "review");
  }, [canViewReviews, gan.id, trackUnlockTelemetry, user]);

  useEffect(() => {
    if (!user || canViewReviews) {
      setUnlockProgress(null);
      setUnlockProgressError(null);
      return;
    }
    void refreshUnlockProgress();
  }, [canViewReviews, refreshUnlockProgress, user, gan.id]);

  useEffect(() => {
    if (!user || canViewReviews) return;
    const timer = window.setInterval(() => {
      void refreshUnlockProgress();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [canViewReviews, refreshUnlockProgress, user]);

  useEffect(() => {
    if (canViewReviews) {
      unlockRefreshTriggeredRef.current = false;
      return;
    }
    if (!unlockProgress?.access?.can_view_reviews) return;
    if (unlockRefreshTriggeredRef.current) return;
    unlockRefreshTriggeredRef.current = true;
    onEntitlementChanged?.();
  }, [canViewReviews, onEntitlementChanged, unlockProgress?.access?.can_view_reviews]);

  useEffect(() => {
    if (!showUnlockOptions || unlockStep !== "full" || !showContributionInUnlock) {
      setContributionGanOptions([]);
      setContributionGanLoading(false);
      return;
    }
    const q = contributionGanQuery.trim();
    if (q.length < 2) {
      setContributionGanOptions([]);
      setContributionGanLoading(false);
      return;
    }

    let cancelled = false;
    setContributionGanLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/ganim/search?q=${encodeURIComponent(q)}&limit=8`, {
            cache: "no-store",
          });
          const payload = await res.json().catch(() => ({}));
          if (cancelled) return;
          const rows = Array.isArray(payload?.ganim) ? payload.ganim : [];
          const next = rows
            .map((r: any) => {
              const id = typeof r?.id === "string" ? r.id : "";
              const name = typeof r?.name_he === "string" ? r.name_he : "";
              const city = typeof r?.city === "string" ? r.city : "";
              const address = typeof r?.address === "string" ? r.address : "";
              const label = [name, city || address].filter(Boolean).join(" · ");
              if (!id || !label) return null;
              return { id, label };
            })
            .filter(Boolean) as Array<{ id: string; label: string }>;
          setContributionGanOptions(next);
        } catch {
          if (!cancelled) setContributionGanOptions([]);
        } finally {
          if (!cancelled) setContributionGanLoading(false);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contributionGanQuery, showContributionInUnlock, showUnlockOptions, unlockStep]);

  const submitOnboardingUnlock = async () => {
    setOnboardingMessage(null);
    if (!user) {
      (onRequestLogin ?? signIn)();
      return;
    }
    const kidsAges = onboardingKidsAges
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 18)
      .map((n) => Math.floor(n));
    const numberOfKids = Math.floor(Number(onboardingKidsCount));
    if (!onboardingCity.trim()) {
      setOnboardingMessage("יש למלא עיר.");
      return;
    }
    if (!Number.isFinite(numberOfKids) || numberOfKids <= 0) {
      setOnboardingMessage("יש למלא מספר ילדים תקין.");
      return;
    }
    if (kidsAges.length === 0) {
      setOnboardingMessage("יש למלא גילאי ילדים (לדוגמה: 2,4).");
      return;
    }
    const token = await getBearerToken();
    if (!token) {
      setOnboardingMessage("פג תוקף ההתחברות. התחבר/י מחדש ונסה/י שוב.");
      return;
    }
    setOnboardingSaving(true);
    try {
      await trackUnlockTelemetry("unlock_path_selected", "onboarding", {
        city: onboardingCity.trim() || null,
        number_of_kids: numberOfKids,
      });
      const res = await fetch("/api/entitlements/unlock/onboarding", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          city: onboardingCity.trim(),
          number_of_kids: numberOfKids,
          kids_ages: kidsAges,
          neighborhood: onboardingNeighborhood.trim() || null,
          budget_range: onboardingBudgetRange.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOnboardingMessage(typeof data?.error === "string" ? data.error : "שגיאה בפתיחת הגישה.");
        return;
      }
      setOnboardingMessage("הגישה נפתחה לפי מכסת צפייה.");
      setShowOnboardingInUnlock(false);
      setShowUnlockOptions(false);
      setHasUnlockJourneyStarted(true);
      onEntitlementChanged?.();
      void refreshUnlockProgress();
    } catch {
      setOnboardingMessage("שגיאת רשת. נסה/י שוב.");
    } finally {
      setOnboardingSaving(false);
    }
  };

  useEffect(() => {
    if (!canViewReviews || !supabase || !user) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError(null);

    (async () => {
      try {
        const token = await getBearerToken();
        if (!token) throw new Error("נדרשת התחברות כדי לצפות בביקורות.");
        const res = await fetch(`/api/reviews?gan_id=${encodeURIComponent(gan.id)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setReviewsError(typeof payload?.error === "string" ? payload.error : "שגיאה בטעינת ביקורות");
          setReviews([]);
          return;
        }
        const rows = Array.isArray(payload?.reviews) ? payload.reviews : [];
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
  }, [canViewReviews, gan.id, getBearerToken, refreshReviewsKey, user]);

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void shareOrCopyLink()}
            aria-label={shareCopied ? "בוצע" : "שיתוף (מערכת או העתקה)"}
            title={shareCopied ? "בוצע" : "שיתוף"}
          >
            {shareCopied ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
          </Button>
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
              title="לחץ לפירוט קטגוריות. כדי לדרג בעצמך לחצו על 'יש לי מה לומר על הגן הזה'."
            >
              <div className="font-hebrew font-semibold text-gan-dark">דירוג הורים</div>
              <div className="mt-1">
                <StarRating value={gan.avg_rating} count={gan.recommendation_count} showValue />
              </div>
              <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                לחץ לפירוט קטגוריות
              </div>
              <div className="mt-1 text-[11px] text-gray-500 font-hebrew">
                כדי לדרג בעצמך: יש לי מה לומר על הגן הזה
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
          {showRejectedNotice ? (
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

          {(showEditForm || showReviewModal) && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-3">
              <Card ref={contributionPanelRef} className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="font-hebrew text-base">תרומה לגן</CardTitle>
                    <div className="mt-1 text-xs text-gray-600 font-hebrew">{gan.name_he}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowReviewModal(false);
                      setShowEditForm(false);
                    }}
                    aria-label="סגור"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
              <div className="rounded-lg border border-gan-accent/30 bg-gan-muted/10 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReviewModal(true);
                      setShowEditForm(false);
                    }}
                    aria-expanded={showReviewModal}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs font-hebrew transition-colors",
                      showReviewModal
                        ? "border-gan-primary bg-white text-gan-dark font-semibold"
                        : "border-gan-accent/40 bg-white/70 text-gray-600 hover:bg-white"
                    )}
                  >
                    יש לי מה לומר על הגן הזה
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditForm(true);
                      setShowReviewModal(false);
                    }}
                    aria-expanded={showEditForm}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs font-hebrew transition-colors",
                      showEditForm
                        ? "border-gan-primary bg-white text-gan-dark font-semibold"
                        : "border-gan-accent/40 bg-white/70 text-gray-600 hover:bg-white"
                    )}
                  >
                    ערכו פרטים
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-gan-accent/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setShowReviewModal((v) => {
                      const next = !v;
                      if (next) setShowEditForm(false);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-hebrew text-gan-dark hover:bg-gan-muted/20"
                  aria-expanded={showReviewModal}
                >
                  <span>יש לי מה לומר על הגן הזה</span>
                  {showReviewModal ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {showReviewModal ? (
                  <div className="border-t border-gan-accent/20 px-3 py-3">
                    <GanReviewModal
                      mode="inline"
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
                        setHasUnlockJourneyStarted(true);
                        onReviewSaved?.();
                        onEntitlementChanged?.();
                        void refreshUnlockProgress();
                      }}
                      onOpenEditGan={() => {
                        setShowReviewModal(false);
                        setShowEditForm(true);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-gan-accent/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setShowEditForm((v) => {
                      const next = !v;
                      if (next) setShowReviewModal(false);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-hebrew text-gan-dark hover:bg-gan-muted/20"
                  aria-expanded={showEditForm}
                >
                  <span>ערכו פרטים</span>
                  {showEditForm ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {showEditForm ? (
                  <GanEditForm
                    gan={gan}
                    onSaved={handleEditSaved}
                    onCancel={() => setShowEditForm(false)}
                  />
                ) : null}
              </div>
                </CardContent>
              </Card>
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
              onClick={openReviewAndFocus}
            >
              <UsersRound className="w-4 h-4" />
              יש לי מה לומר על הגן הזה
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
                תוכן הביקורות מוסתר. אפשר לפתוח גישה דרך אחת מדרכי ה-Give-to-Get.
              </p>
            </div>
          )}
          {!canViewReviews && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-gray-600 font-hebrew">
                הגישה לביקורות סגורה כרגע. לחצו כדי לבחור דרך לפתיחת הגישה.
              </div>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => {
                  if (!user) {
                    (onRequestLogin ?? signIn)();
                    return;
                  }
                  setUnlockMessage(null);
                  setUnlockStep("full");
                  setShowContributionInUnlock(false);
                  setShowOnboardingInUnlock(false);
                  setShowUnlockOptions(true);
                }}
              >
                <Lock className="w-4 h-4" />
                רוצים גישה לביקורות?
              </Button>
              {unlockMessage ? (
                <div className="text-[11px] text-gray-600 font-hebrew">{unlockMessage}</div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
      {showUnlockOptions && user ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-3">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
              <div className="min-w-0">
                <CardTitle className="font-hebrew text-base">כדי לצפות בביקורות, בחרו מסלול פתיחה</CardTitle>
                <div className="mt-1 text-xs text-gray-600 font-hebrew">
                  גישה מלאה מתקבלת אחרי אישור תרומה (לשנה), או גישה מוגבלת דרך שאלון.
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowUnlockOptions(false)} aria-label="סגור">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {showModalMissionTracker ? (
                <div className="rounded-lg border border-gan-accent/40 bg-gan-muted/10 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-hebrew text-gray-700">התקדמות לפתיחת גישה</div>
                    {missionHasFullAccess ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 font-hebrew">
                        אושר - הגישה פתוחה
                      </span>
                    ) : missionPending ? (
                      <span className="rounded-full bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-hebrew">
                        נשלח, ממתין לאישור
                      </span>
                    ) : missionQualifiesOnSubmit ? (
                      <span className="rounded-full bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 font-hebrew">
                        גישה זמנית פעילה
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 font-hebrew">
                        התחלתם מסלול
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 font-hebrew">
                    כלל הפתיחה: ביקורת או דירוג, או השלמת לפחות {contributionMinFields} שדות מידע.
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-hebrew">
                    <span className="rounded-full bg-white border border-gan-accent/30 px-2 py-0.5">
                      ביקורת: {unlockProgress?.mission?.latest_review_status ?? "אין"}
                    </span>
                    <span className="rounded-full bg-white border border-gan-accent/30 px-2 py-0.5">
                      עריכה: {unlockProgress?.mission?.latest_edit_status ?? "אין"}
                    </span>
                    <span className="rounded-full bg-white border border-gan-accent/30 px-2 py-0.5">
                      שדות: {unlockProgress?.mission?.best_edit_changed_fields ?? 0}/{contributionMinFields}
                    </span>
                    <span className="rounded-full bg-white border border-gan-accent/30 px-2 py-0.5">
                      גישה זמנית: {missionQuotaRemaining}
                    </span>
                  </div>
                  {unlockProgressError ? (
                    <div className="text-[11px] text-amber-700 font-hebrew">{unlockProgressError}</div>
                  ) : null}
                </div>
              ) : null}
              {unlockStep === "full" ? (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start font-hebrew"
                    onClick={() => {
                      void trackUnlockTelemetry("unlock_path_selected", "bounty", { mode: "combined_gan_info" });
                      setHasUnlockJourneyStarted(true);
                      setShowContributionInUnlock((v) => !v);
                      setUnlockMessage(null);
                    }}
                  >
                    תפרגנו קצת עם מודיעין גנים
                  </Button>

                  {showContributionInUnlock ? (
                    <div className="rounded-lg border border-gan-accent/40 bg-gan-muted/10 p-3 space-y-2">
                      <div className="text-xs text-gray-600 font-hebrew">
                        אפשר להוסיף ביקורת ו/או פרטים חסרים. סף השלמת פרטים חסרים הוא מינימום {contributionMinFields}
                        שדות. אחרי אישור תרומה אחת - תקבלו גישה מלאה לשנה.
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-hebrew text-gray-600">בחרו גן לתרומה</div>
                        <input
                          value={contributionGanQuery}
                          onChange={(e) => setContributionGanQuery(e.target.value)}
                          placeholder="חפשו גן (שם/עיר)"
                          className="w-full rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={selectedContributionGan.id === gan.id ? "default" : "outline"}
                            onClick={() => setSelectedContributionGan({ id: gan.id, label: gan.name_he })}
                          >
                            {gan.name_he} (הגן הנוכחי)
                          </Button>
                          {contributionGanLoading ? (
                            <span className="text-xs text-gray-500 font-hebrew">מחפש גנים...</span>
                          ) : null}
                          {contributionGanOptions.map((opt) => (
                            <Button
                              key={opt.id}
                              size="sm"
                              variant={selectedContributionGan.id === opt.id ? "default" : "outline"}
                              onClick={() => setSelectedContributionGan(opt)}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 font-hebrew">
                          נבחר: {selectedContributionGan.label}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void trackUnlockTelemetry("unlock_path_selected", "bounty", {
                              action: "open_selected_gan_card",
                              selected_gan_id: selectedContributionGan.id,
                              selected_gan_label: selectedContributionGan.label,
                            });
                            const isCurrent = selectedContributionGan.id === gan.id;
                            if (isCurrent) {
                              setShowUnlockOptions(false);
                              setUnlockMessage("בחרתם את הגן הנוכחי. בכרטיס הגן אפשר לכתוב ביקורת ו/או להשלים פרטים.");
                              return;
                            }
                            const moved = onSelectGanForContribution?.(selectedContributionGan.id) ?? false;
                            if (moved) {
                              setShowUnlockOptions(false);
                              setUnlockMessage(null);
                              return;
                            }
                            setUnlockMessage("לא הצלחנו לפתוח את הגן שנבחר. נסו לבחור אותו ישירות מהמפה.");
                          }}
                        >
                          פתיחת הגן הנבחר
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <Button
                    variant="ghost"
                    className="w-full justify-start font-hebrew"
                    onClick={() => {
                      setHasUnlockJourneyStarted(true);
                      setUnlockStep("fallback");
                      setShowContributionInUnlock(false);
                      setUnlockMessage(null);
                    }}
                  >
                    אין לי מודיעין, בשביל זה אני פה!
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 font-hebrew">
                    אפשר לבחור אחד מהמסלולים הבאים:
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start font-hebrew"
                    onClick={() => {
                      void trackUnlockTelemetry("unlock_path_selected", "referral");
                      setHasUnlockJourneyStarted(true);
                      setUnlockMessage(
                        unlockFlags?.referral_unlock
                          ? "הזמינו חבר/ה. אחרי שימלאו ביקורת או פרטים - תקבלו גישה מלאה לשנה."
                          : "מסלול ההזמנות עדיין לא פתוח בסביבה הזו."
                      );
                    }}
                  >
                    הזמנת חבר/ה (מעניק גישה מלאה אחרי תרומה)
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start font-hebrew"
                    onClick={() => {
                      void trackUnlockTelemetry("unlock_path_selected", "onboarding");
                      setHasUnlockJourneyStarted(true);
                      setShowOnboardingInUnlock((v) => !v);
                    }}
                  >
                    הוספת מידע על עצמכם (גישה מוגבלת)
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start font-hebrew"
                    onClick={() => {
                      setUnlockStep("full");
                      setShowOnboardingInUnlock(false);
                      setUnlockMessage(null);
                    }}
                  >
                    חזרה למסלול גישה מלאה
                  </Button>
                </div>
              )}

              {showOnboardingInUnlock ? (
                <div className="rounded-lg border border-gan-accent/40 bg-gan-muted/10 p-3 space-y-2">
                  <div className="text-xs text-gray-600 font-hebrew">
                    מילוי השאלון פותח מכסה של {onboardingReviewQuota} ביקורות.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={onboardingCity}
                      onChange={(e) => setOnboardingCity(e.target.value)}
                      placeholder="עיר *"
                      className="rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew"
                    />
                    <input
                      value={onboardingKidsCount}
                      onChange={(e) => setOnboardingKidsCount(e.target.value)}
                      placeholder="מספר ילדים *"
                      className="rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew"
                    />
                    <input
                      value={onboardingKidsAges}
                      onChange={(e) => setOnboardingKidsAges(e.target.value)}
                      placeholder="גילאים בפסיקים (לדוגמה: 2,4) *"
                      className="rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew md:col-span-2"
                    />
                    <input
                      value={onboardingNeighborhood}
                      onChange={(e) => setOnboardingNeighborhood(e.target.value)}
                      placeholder="שכונה (אופציונלי)"
                      className="rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew"
                    />
                    <input
                      value={onboardingBudgetRange}
                      onChange={(e) => setOnboardingBudgetRange(e.target.value)}
                      placeholder="טווח תקציב (אופציונלי)"
                      className="rounded border border-gan-accent/40 px-2 py-1 text-xs font-hebrew"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={submitOnboardingUnlock} disabled={onboardingSaving}>
                      {onboardingSaving ? "שומר..." : "שליחה ופתיחת גישה"}
                    </Button>
                    {onboardingMessage ? (
                      <span className="text-xs font-hebrew text-gray-600">{onboardingMessage}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {unlockMessage ? <div className="text-xs font-hebrew text-gray-600">{unlockMessage}</div> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {contactReviewId ? (
        <ContactReviewerModal
          targetId={contactReviewId}
          kind="gan"
          placeName={gan.name_he}
          onClose={() => setContactReviewId(null)}
        />
      ) : null}
    </Card>
  );
}
