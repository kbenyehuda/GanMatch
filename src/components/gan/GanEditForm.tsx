"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Gan } from "@/types/ganim";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { useEffect, useRef, useState } from "react";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import { isPhoneWhatsApp } from "@/lib/phone-utils";
import { normalizeWebsiteUrl } from "@/lib/utils";
import { formatSpokenLanguageHe } from "@/lib/gan-display";

type EditFormState = {
  address: string;
  city: string;
  neighborhood: string;
  pikuach: "unknown" | "yes" | "no";
  suggestedType: string;
  priceNotes: string;
  websiteUrl: string;
  category: Gan["category"];
  maonSymbolCode: string;
  privateSupervision: NonNullable<Gan["private_supervision"]>;
  mishpachtonAffiliation: NonNullable<Gan["mishpachton_affiliation"]>;
  municipalGrade: NonNullable<Gan["municipal_grade"]>;
  minAgeYears: string;
  maxAgeYears: string;
  monthlyPrice: string;
  cctv: "unknown" | "none" | "exceptional" | "online";
  operatingHours: string;
  fridaySchedule: NonNullable<Gan["friday_schedule"]>;
  mealType: NonNullable<Gan["meal_type"]>;
  veganFriendly: boolean | null;
  vegetarianFriendly: boolean | null;
  meatServed: boolean | null;
  allergyFriendly: boolean | null;
  kosherStatus: NonNullable<Gan["kosher_status"]>;
  kosherCertifier: string;
  staffChildRatio: string;
  firstAidTrained: boolean | null;
  languagesSpoken: NonNullable<Gan["languages_spoken"]>;
  hasOutdoorSpace: boolean | null;
  hasMamad: boolean | null;
  chugimTypes: string;
  vacancyStatus: NonNullable<Gan["vacancy_status"]>;
  phones: Array<{ number: string; whatsapp: boolean }>;
};

function initialEditState(gan: Gan): EditFormState {
  const street = getGanStreetAddressForDisplay(gan);
  const city = getGanCityForDisplay(gan);
  const ph = Array.isArray(gan.metadata?.phone)
    ? gan.metadata.phone
    : gan.metadata?.phone
      ? [String(gan.metadata.phone)]
      : [];
  return {
    address: street === "אין כתובת" ? "" : street,
    city: city === "—" ? "" : city,
    neighborhood: getGanNeighborhoodForDisplay(gan) ?? "",
    pikuach: gan.metadata?.pikuach_ironi === true ? "yes" : gan.metadata?.pikuach_ironi === false ? "no" : "unknown",
    suggestedType: typeof gan.metadata?.suggested_type === "string" ? gan.metadata.suggested_type : "",
    priceNotes: typeof gan.price_notes === "string" ? gan.price_notes : "",
    websiteUrl: typeof gan.website_url === "string" ? gan.website_url : "",
    category: gan.category,
    maonSymbolCode: gan.maon_symbol_code ?? "",
    privateSupervision: (gan.private_supervision ?? "UNKNOWN") as NonNullable<Gan["private_supervision"]>,
    mishpachtonAffiliation: (gan.mishpachton_affiliation ?? "UNKNOWN") as NonNullable<Gan["mishpachton_affiliation"]>,
    municipalGrade: (gan.municipal_grade ?? "UNKNOWN") as NonNullable<Gan["municipal_grade"]>,
    minAgeYears: gan.min_age_months == null ? "" : String(Math.round((Number(gan.min_age_months) / 12) * 2) / 2),
    maxAgeYears: gan.max_age_months == null ? "" : String(Math.round((Number(gan.max_age_months) / 12) * 2) / 2),
    monthlyPrice: gan.monthly_price_nis == null ? "" : String(Math.round(Number(gan.monthly_price_nis))),
    cctv: gan.has_cctv ? (gan.cctv_streamed_online === true ? "online" : "exceptional") : "none",
    operatingHours: gan.operating_hours ?? "",
    fridaySchedule: (gan.friday_schedule ?? "UNKNOWN") as NonNullable<Gan["friday_schedule"]>,
    mealType: (gan.meal_type ?? "UNKNOWN") as NonNullable<Gan["meal_type"]>,
    veganFriendly: gan.vegan_friendly ?? null,
    vegetarianFriendly: gan.vegetarian_friendly ?? null,
    meatServed: gan.meat_served ?? null,
    allergyFriendly: gan.allergy_friendly ?? null,
    kosherStatus: (gan.kosher_status ?? "UNKNOWN") as NonNullable<Gan["kosher_status"]>,
    kosherCertifier: gan.kosher_certifier ?? "",
    staffChildRatio: gan.staff_child_ratio != null ? String(gan.staff_child_ratio) : "",
    firstAidTrained: gan.first_aid_trained ?? null,
    languagesSpoken: gan.languages_spoken ?? [],
    hasOutdoorSpace: gan.has_outdoor_space ?? null,
    hasMamad: gan.has_mamad ?? null,
    chugimTypes: Array.isArray(gan.chugim_types) ? gan.chugim_types.join(", ") : "",
    vacancyStatus: (gan.vacancy_status ?? "UNKNOWN") as NonNullable<Gan["vacancy_status"]>,
    phones: ph.map((n) => ({ number: String(n).trim(), whatsapp: isPhoneWhatsApp(gan, n) })),
  };
}

export type EditSaveResult = {
  status: "approved" | "pending";
  patch: Record<string, unknown>;
  normalizedWebsiteUrl: string | null;
};

interface GanEditFormProps {
  gan: Gan;
  onSaved: (result: EditSaveResult) => void;
  onCancel: () => void;
}

export function GanEditForm({ gan, onSaved, onCancel }: GanEditFormProps) {
  const { user, session } = useSession();
  const [editForm, setEditForm] = useState<EditFormState>(() => initialEditState(gan));
  const {
    address: editAddress,
    city: editCity,
    neighborhood: editNeighborhood,
    pikuach: editPikuach,
    suggestedType: editSuggestedType,
    priceNotes: editPriceNotes,
    websiteUrl: editWebsiteUrl,
    category: editCategory,
    maonSymbolCode: editMaonSymbolCode,
    privateSupervision: editPrivateSupervision,
    mishpachtonAffiliation: editMishpachtonAffiliation,
    municipalGrade: editMunicipalGrade,
    minAgeYears: editMinAgeYears,
    maxAgeYears: editMaxAgeYears,
    monthlyPrice: editMonthlyPrice,
    cctv: editCctv,
    operatingHours: editOperatingHours,
    fridaySchedule: editFridaySchedule,
    mealType: editMealType,
    veganFriendly: editVeganFriendly,
    vegetarianFriendly: editVegetarianFriendly,
    meatServed: editMeatServed,
    allergyFriendly: editAllergyFriendly,
    kosherStatus: editKosherStatus,
    kosherCertifier: editKosherCertifier,
    staffChildRatio: editStaffChildRatio,
    firstAidTrained: editFirstAidTrained,
    languagesSpoken: editLanguagesSpoken,
    hasOutdoorSpace: editHasOutdoorSpace,
    hasMamad: editHasMamad,
    chugimTypes: editChugimTypes,
    vacancyStatus: editVacancyStatus,
    phones: editPhones,
  } = editForm;
  const setEditAddress = (v: string) => setEditForm((p) => ({ ...p, address: v }));
  const setEditCity = (v: string) => setEditForm((p) => ({ ...p, city: v }));
  const setEditNeighborhood = (v: string) => setEditForm((p) => ({ ...p, neighborhood: v }));
  const setEditPikuach = (v: "unknown" | "yes" | "no") => setEditForm((p) => ({ ...p, pikuach: v }));
  const setEditSuggestedType = (v: string) => setEditForm((p) => ({ ...p, suggestedType: v }));
  const setEditPriceNotes = (v: string) => setEditForm((p) => ({ ...p, priceNotes: v }));
  const setEditWebsiteUrl = (v: string) => setEditForm((p) => ({ ...p, websiteUrl: v }));
  const setEditCategory = (v: Gan["category"]) => setEditForm((p) => ({ ...p, category: v }));
  const setEditMaonSymbolCode = (v: string) => setEditForm((p) => ({ ...p, maonSymbolCode: v }));
  const setEditPrivateSupervision = (v: NonNullable<Gan["private_supervision"]>) => setEditForm((p) => ({ ...p, privateSupervision: v }));
  const setEditMishpachtonAffiliation = (v: NonNullable<Gan["mishpachton_affiliation"]>) => setEditForm((p) => ({ ...p, mishpachtonAffiliation: v }));
  const setEditMunicipalGrade = (v: NonNullable<Gan["municipal_grade"]>) => setEditForm((p) => ({ ...p, municipalGrade: v }));
  const setEditMinAgeYears = (v: string) => setEditForm((p) => ({ ...p, minAgeYears: v }));
  const setEditMaxAgeYears = (v: string) => setEditForm((p) => ({ ...p, maxAgeYears: v }));
  const setEditMonthlyPrice = (v: string) => setEditForm((p) => ({ ...p, monthlyPrice: v }));
  const setEditCctv = (v: "unknown" | "none" | "exceptional" | "online") => setEditForm((p) => ({ ...p, cctv: v }));
  const setEditOperatingHours = (v: string) => setEditForm((p) => ({ ...p, operatingHours: v }));
  const setEditFridaySchedule = (v: NonNullable<Gan["friday_schedule"]>) => setEditForm((p) => ({ ...p, fridaySchedule: v }));
  const setEditMealType = (v: NonNullable<Gan["meal_type"]>) => setEditForm((p) => ({ ...p, mealType: v }));
  const setEditVeganFriendly = (v: boolean | null) => setEditForm((p) => ({ ...p, veganFriendly: v }));
  const setEditVegetarianFriendly = (v: boolean | null) => setEditForm((p) => ({ ...p, vegetarianFriendly: v }));
  const setEditMeatServed = (v: boolean | null) => setEditForm((p) => ({ ...p, meatServed: v }));
  const setEditAllergyFriendly = (v: boolean | null) => setEditForm((p) => ({ ...p, allergyFriendly: v }));
  const setEditKosherStatus = (v: NonNullable<Gan["kosher_status"]>) => setEditForm((p) => ({ ...p, kosherStatus: v }));
  const setEditKosherCertifier = (v: string) => setEditForm((p) => ({ ...p, kosherCertifier: v }));
  const setEditStaffChildRatio = (v: string) => setEditForm((p) => ({ ...p, staffChildRatio: v }));
  const setEditFirstAidTrained = (v: boolean | null) => setEditForm((p) => ({ ...p, firstAidTrained: v }));
  const setEditLanguagesSpoken = (v: NonNullable<Gan["languages_spoken"]>) => setEditForm((p) => ({ ...p, languagesSpoken: v }));
  const setEditHasOutdoorSpace = (v: boolean | null) => setEditForm((p) => ({ ...p, hasOutdoorSpace: v }));
  const setEditHasMamad = (v: boolean | null) => setEditForm((p) => ({ ...p, hasMamad: v }));
  const setEditChugimTypes = (v: string) => setEditForm((p) => ({ ...p, chugimTypes: v }));
  const setEditVacancyStatus = (v: NonNullable<Gan["vacancy_status"]>) => setEditForm((p) => ({ ...p, vacancyStatus: v }));
  const setEditPhones = (
    updater: EditFormState["phones"] | ((prev: EditFormState["phones"]) => EditFormState["phones"])
  ) => setEditForm((p) => ({ ...p, phones: typeof updater === "function" ? updater(p.phones) : updater }));

  const [saving, setSaving] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [editSavedStatus, setEditSavedStatus] = useState<"approved" | "pending">("pending");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      const nowSec = Math.floor(Date.now() / 1000);
      const shouldRefresh =
        (session?.expires_at != null && session.expires_at - nowSec < 60) || !session?.access_token;
      if (shouldRefresh) {
        try {
          await supabase.auth.refreshSession();
        } catch {
          // ignore; fall back to getSession below
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

      const normalizeForCompare = (_key: string, value: unknown): unknown => {
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
        pikuach_ironi: typeof gan.metadata?.pikuach_ironi === "boolean" ? gan.metadata.pikuach_ironi : null,
        suggested_type: typeof gan.metadata?.suggested_type === "string" ? gan.metadata.suggested_type : null,
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
        // No delete semantics: null means "no update", not "clear".
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
      const savedStatus = data?.status === "approved" ? "approved" : "pending";
      setEditSavedStatus(savedStatus);
      setEditSaved(true);
      onSaved({ status: savedStatus, patch, normalizedWebsiteUrl: normalizeWebsiteUrl(editWebsiteUrl) });
    } catch (e: any) {
      setEditSaveError(typeof e?.message === "string" ? e.message : "שגיאה בשמירת פרטים");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="border-t border-gan-accent/20 pt-3 px-3 pb-3">
      {!user ? (
        <div className="text-sm text-gray-600 font-hebrew">צריך להתחבר כדי לערוך.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1 font-hebrew">כתובת (רחוב + מספר)</label>
              <input
                id="gan-edit-address"
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
                <option value="TZAHARON_MUNICIPAL">גן + צהרון עירוני</option>
                <option value="TZAHARON_PRIVATE_SUPERVISED">צהרון פרטי בפיקוח</option>
                <option value="TZAHARON_PRIVATE_UNSUPERVISED">צהרון פרטי ללא פיקוח</option>
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
                נשמר לשקיפות (ב־metadata), אבל הסיווג הראשי הוא &quot;סוג&quot;.
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
                          prev.map((p, i) => (i === idx ? { ...p, number: e.target.value } : p))
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
                            prev.map((p, i) => (i === idx ? { ...p, whatsapp: e.target.checked } : p))
                          )
                        }
                        className="rounded border-gan-accent/50"
                      />
                      <span>וואטסאפ</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditPhones((prev) => prev.filter((_, i) => i !== idx))}
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
                onChange={(e) => setEditVeganFriendly(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditVegetarianFriendly(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditMeatServed(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditAllergyFriendly(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditFirstAidTrained(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditHasOutdoorSpace(e.target.value === "" ? null : e.target.value === "yes")}
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
                onChange={(e) => setEditHasMamad(e.target.value === "" ? null : e.target.value === "yes")}
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
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" size="sm" onClick={submitGanEdit} disabled={saving}>
              {saving ? "שומר..." : "שמור שינויים"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
