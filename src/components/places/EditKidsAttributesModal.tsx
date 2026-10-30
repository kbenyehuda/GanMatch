"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Place, KidsAttributes, SpokenLanguage, KosherStatus } from "@/types/places";
import { useSession } from "@/lib/useSession";
import { GAN_APPROACH_LABELS, type GanApproach } from "@/lib/place-facts";
import { KIDS_FIELD_LABELS, currentKidsValue, formatKidsValue } from "@/lib/kids-attributes";

const GAN_CATEGORY_OPTS: { value: string; label: string }[] = [
  { value: "", label: "לא ידוע" },
  { value: "MAON_SYMBOL", label: "מעון סמל" },
  { value: "MISHPACHTON", label: "משפחתון" },
  { value: "PRIVATE_GAN", label: "גן פרטי" },
  { value: "MUNICIPAL_GAN", label: "גן עירוני" },
  { value: "TZAHARON_MUNICIPAL", label: "צהרון עירוני" },
  { value: "TZAHARON_PRIVATE_SUPERVISED", label: "צהרון פרטי מפוקח" },
  { value: "TZAHARON_PRIVATE_UNSUPERVISED", label: "צהרון פרטי ללא פיקוח" },
];
const MEAL_OPTS = [
  { value: "", label: "לא ידוע" },
  { value: "IN_HOUSE_COOK", label: "בישול במקום" },
  { value: "EXTERNAL_CATERING", label: "קייטרינג חיצוני" },
  { value: "PARENTS_BRING", label: "הורים מביאים" },
  { value: "MIXED", label: "מעורב" },
];
const FRIDAY_OPTS = [
  { value: "", label: "לא ידוע" },
  { value: "NONE", label: "ללא שישי" },
  { value: "EVERY_FRIDAY", label: "כל שישי" },
  { value: "EVERY_OTHER_FRIDAY", label: "כל שבועיים" },
];
const VACANCY_OPTS = [
  { value: "", label: "לא ידוע" },
  { value: "Available", label: "יש מקום" },
  { value: "Limited", label: "מקומות מוגבלים" },
  { value: "Full", label: "מלא / רשימת המתנה" },
];
const KOSHER_OPTS: { value: KosherStatus | ""; label: string }[] = [
  { value: "", label: "לא ידוע" },
  { value: "CERTIFIED", label: "כשר" },
  { value: "NOT_CERTIFIED", label: "לא כשר" },
];
const LANG_OPTS: { value: SpokenLanguage; label: string }[] = [
  { value: "HEBREW", label: "עברית" },
  { value: "ENGLISH", label: "אנגלית" },
  { value: "RUSSIAN", label: "רוסית" },
  { value: "ARABIC", label: "ערבית" },
];

type TriState = "" | "yes" | "no";
const triToBool = (v: TriState): boolean | null => (v === "" ? null : v === "yes");
const boolToTri = (v: boolean | null | undefined): TriState => (v == null ? "" : v ? "yes" : "no");

function monthsToYearsStr(m: number | null | undefined): string {
  return m == null ? "" : String(Math.round((m / 12) * 2) / 2);
}
function yearsStrToMonths(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 12);
}

// Fields the place already has a value for are "locked": hidden from the form and listed
// greyed out under "מה שכבר ידוע" until the user says the value is wrong (user, 2026-10-30).
const LockedContext = createContext<(key: string) => boolean>(() => false);

function Field({ label, children, k, span = false }: { label: string; children: React.ReactNode; k?: string; span?: boolean }) {
  const isLocked = useContext(LockedContext);
  if (k && isLocked(k)) return null;
  return (
    <div className={span ? "col-span-2" : undefined}>
      <label className="font-hebrew block mb-1" style={{ fontSize: 12, color: "#8A95A8", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = { width: "100%", background: "#fff", border: "1px solid #E5E9F0", borderRadius: 10, padding: "9px 10px", fontSize: 13, outline: "none" };
const inputStyle: React.CSSProperties = { ...selectStyle };

function TriSelect({ value, onChange }: { value: TriState; onChange: (v: TriState) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as TriState)} className="font-hebrew" style={selectStyle}>
      <option value="">לא ידוע</option>
      <option value="yes">כן</option>
      <option value="no">לא</option>
    </select>
  );
}

export interface EditKidsAttributesModalProps {
  place: Place;
  onClose: () => void;
  onSaved: (place: Place) => void;
  onShowToast?: (msg: string) => void;
}

export function EditKidsAttributesModal({ place, onClose, onSaved, onShowToast }: EditKidsAttributesModalProps) {
  const { session } = useSession();
  const a = (place.attributes ?? {}) as KidsAttributes;

  const [ganCategory, setGanCategory] = useState(a.gan_category ?? "");
  const [maonSymbolCode, setMaonSymbolCode] = useState(a.maon_symbol_code ?? "");
  const [minAgeYears, setMinAgeYears] = useState(monthsToYearsStr(a.min_age_months));
  const [maxAgeYears, setMaxAgeYears] = useState(monthsToYearsStr(a.max_age_months));
  const [mealType, setMealType] = useState(a.meal_type ?? "");
  const [fridaySchedule, setFridaySchedule] = useState(a.friday_schedule ?? "");
  const [hasOutdoor, setHasOutdoor] = useState<TriState>(boolToTri(a.has_outdoor_space));
  const [vacancyStatus, setVacancyStatus] = useState(a.vacancy_status ?? "");
  const [monthlyPrice, setMonthlyPrice] = useState(a.monthly_price_nis != null ? String(a.monthly_price_nis) : "");
  const [hasMamad, setHasMamad] = useState<TriState>(boolToTri(a.has_mamad));
  const [hasCctv, setHasCctv] = useState<TriState>(boolToTri(a.has_cctv));
  const [cctvOnline, setCctvOnline] = useState<TriState>(boolToTri(a.cctv_streamed_online));
  const [kosher, setKosher] = useState<KosherStatus | "">(place.kosher ?? "");
  const [kosherCertifier, setKosherCertifier] = useState(a.kosher_certifier ?? "");
  const [staffChildRatio, setStaffChildRatio] = useState(a.staff_child_ratio != null ? String(a.staff_child_ratio) : "");
  const [firstAid, setFirstAid] = useState<TriState>(boolToTri(a.first_aid_trained));
  const [vegan, setVegan] = useState<TriState>(boolToTri(a.vegan_friendly));
  const [vegetarian, setVegetarian] = useState<TriState>(boolToTri(a.vegetarian_friendly));
  const [meat, setMeat] = useState<TriState>(boolToTri(a.meat_served));
  const [allergy, setAllergy] = useState<TriState>(boolToTri(a.allergy_friendly));
  const [languages, setLanguages] = useState<SpokenLanguage[]>(a.languages_spoken ?? []);
  const [chugim, setChugim] = useState((a.chugim_types ?? []).join(", "));
  const [hours, setHours] = useState(place.hours ?? "");
  const [approach, setApproach] = useState<GanApproach[]>(a.approach ?? []);
  const [homeGan, setHomeGan] = useState<TriState>(boolToTri(a.is_home_gan));
  const [smallGroup, setSmallGroup] = useState<TriState>(boolToTri(a.small_group));
  const [stableStaff, setStableStaff] = useState<TriState>(boolToTri(a.stable_staff));
  const [chugimInGan, setChugimInGan] = useState<TriState>(boolToTri(a.has_chugim_in_gan));
  const [holidayCamp, setHolidayCamp] = useState<TriState>(boolToTri(a.has_holiday_camp));
  const [flexibleHours, setFlexibleHours] = useState<TriState>(boolToTri(a.flexible_hours));

  // Keys the place already has a value for, fixed when the form opens.
  const knownKeys = useMemo(() => {
    const values = { attributes: (place.attributes ?? {}) as Record<string, unknown>, hours: place.hours, kosher: place.kosher };
    return Object.keys(KIDS_FIELD_LABELS).filter((key) => {
      const v = currentKidsValue(values, key);
      return v != null && !(Array.isArray(v) && v.length === 0);
    });
  }, [place.attributes, place.hours, place.kosher]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const isLocked = (key: string) => knownKeys.includes(key) && !unlocked.has(key);
  const lockedKeys = knownKeys.filter(isLocked);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLang = (lang: SpokenLanguage) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const toggleApproach = (v: GanApproach) => {
    setApproach((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const submit = async () => {
    if (!session?.access_token) { setError("נדרשת התחברות."); return; }
    setSaving(true);
    setError(null);
    try {
      const priceNum = monthlyPrice.trim() ? Number(monthlyPrice.replace(/[^\d.]/g, "")) : null;
      const ratioNum = staffChildRatio.trim() ? Number(staffChildRatio.replace(",", ".")) : null;
      const body = {
        place_id: place.id,
        gan_category: ganCategory || null,
        maon_symbol_code: maonSymbolCode.trim() || null,
        min_age_months: yearsStrToMonths(minAgeYears),
        max_age_months: yearsStrToMonths(maxAgeYears),
        meal_type: mealType || null,
        friday_schedule: fridaySchedule || null,
        has_outdoor_space: triToBool(hasOutdoor),
        vacancy_status: vacancyStatus || null,
        monthly_price_nis: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
        has_mamad: triToBool(hasMamad),
        has_cctv: triToBool(hasCctv),
        cctv_streamed_online: hasCctv === "yes" ? triToBool(cctvOnline) : null,
        kosher: kosher || null,
        kosher_certifier: kosherCertifier.trim() || null,
        staff_child_ratio: ratioNum != null && Number.isFinite(ratioNum) ? ratioNum : null,
        first_aid_trained: triToBool(firstAid),
        vegan_friendly: triToBool(vegan),
        vegetarian_friendly: triToBool(vegetarian),
        meat_served: triToBool(meat),
        allergy_friendly: triToBool(allergy),
        languages_spoken: languages,
        chugim_types: chugim.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        hours: hours.trim() || null,
        approach,
        is_home_gan: triToBool(homeGan),
        small_group: triToBool(smallGroup),
        stable_staff: triToBool(stableStaff),
        has_chugim_in_gan: triToBool(chugimInGan),
        has_holiday_camp: triToBool(holidayCamp),
        flexible_hours: triToBool(flexibleHours),
      };
      const res = await fetch("/api/places/kids-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");
      // Nothing changes on the place until an admin approves the request.
      onShowToast?.("תודה! נבדוק את העדכון ונפרסם אותו בקרוב 🙏");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600]" style={{ background: "rgba(15,26,46,.4)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="absolute left-0 right-0 bottom-0 flex flex-col" onClick={(e) => e.stopPropagation()} dir="rtl"
        style={{ background: "#F6F9FE", borderRadius: "28px 28px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "90%", overflow: "hidden" }}>
        <div className="flex justify-center pt-2.5 pb-2 shrink-0">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 className="font-hebrew" style={{ fontSize: 18, fontWeight: 800 }}>מילוי פרטי הגן</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 20px 12px" }}>
          <p className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", marginBottom: 6, lineHeight: 1.5 }}>
            כל שדה אופציונלי — מלאו מה שאתם יודעים, זה עוזר לכל ההורים שמחפשים גן.
          </p>
          <p className="font-hebrew" style={{ fontSize: 12, color: "#4A5568", marginBottom: 14, lineHeight: 1.5, background: "#FBF1D8", borderRadius: 10, padding: "8px 10px" }}>
            כל עדכון נבדק על ידינו לפני שהוא מופיע באתר, כדי שהמידע יישאר אמין.
          </p>
          <LockedContext.Provider value={isLocked}>
          <div className="grid grid-cols-2 gap-3">
            <Field span label="סוג גן" k="gan_category">
              <select value={ganCategory} onChange={(e) => setGanCategory(e.target.value)} className="font-hebrew" style={selectStyle}>
                {GAN_CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {ganCategory === "MAON_SYMBOL" && (
              <Field span label="סמל מעון" k="maon_symbol_code">
                <input value={maonSymbolCode} onChange={(e) => setMaonSymbolCode(e.target.value)} inputMode="numeric" placeholder="לדוגמה: 73874" className="font-hebrew" style={inputStyle} />
              </Field>
            )}
            <Field label="גיל מינימום (בשנים)" k="min_age_months">
              <input value={minAgeYears} onChange={(e) => setMinAgeYears(e.target.value)} inputMode="decimal" placeholder="0.5" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field label="גיל מקסימום (בשנים)" k="max_age_months">
              <input value={maxAgeYears} onChange={(e) => setMaxAgeYears(e.target.value)} inputMode="decimal" placeholder="3" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field span label="מחיר חודשי (₪)" k="monthly_price_nis">
              <input value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} inputMode="numeric" placeholder="4200" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field span label="מקום פנוי" k="vacancy_status">
              <select value={vacancyStatus} onChange={(e) => setVacancyStatus(e.target.value)} className="font-hebrew" style={selectStyle}>
                {VACANCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field span label="שעות פעילות" k="hours">
              <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="07:30–16:00, א'-ה'" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field label="ימי שישי" k="friday_schedule">
              <select value={fridaySchedule} onChange={(e) => setFridaySchedule(e.target.value)} className="font-hebrew" style={selectStyle}>
                {FRIDAY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="סוג אוכל" k="meal_type">
              <select value={mealType} onChange={(e) => setMealType(e.target.value)} className="font-hebrew" style={selectStyle}>
                {MEAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="טבעוני" k="vegan_friendly"><TriSelect value={vegan} onChange={setVegan} /></Field>
            <Field label="צמחוני" k="vegetarian_friendly"><TriSelect value={vegetarian} onChange={setVegetarian} /></Field>
            <Field label="מגיש בשר" k="meat_served"><TriSelect value={meat} onChange={setMeat} /></Field>
            <Field label="ידידותי לאלרגיות" k="allergy_friendly"><TriSelect value={allergy} onChange={setAllergy} /></Field>
            <Field label="כשרות" k="kosher">
              <select value={kosher} onChange={(e) => setKosher(e.target.value as KosherStatus | "")} className="font-hebrew" style={selectStyle}>
                {KOSHER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="גוף כשרות (אופציונלי)" k="kosher_certifier">
              <input value={kosherCertifier} onChange={(e) => setKosherCertifier(e.target.value)} placeholder="רבנות, בד״ץ..." className="font-hebrew" style={inputStyle} />
            </Field>
            <Field label="חצר חיצונית" k="has_outdoor_space"><TriSelect value={hasOutdoor} onChange={setHasOutdoor} /></Field>
            <Field label='ממ"ד / מיקלט' k="has_mamad"><TriSelect value={hasMamad} onChange={setHasMamad} /></Field>
            <Field label="מצלמות" k="has_cctv"><TriSelect value={hasCctv} onChange={setHasCctv} /></Field>
            {hasCctv === "yes" && (
              <Field label="ניתן לצפייה מרחוק" k="cctv_streamed_online"><TriSelect value={cctvOnline} onChange={setCctvOnline} /></Field>
            )}
            <Field label="עזרה ראשונה" k="first_aid_trained"><TriSelect value={firstAid} onChange={setFirstAid} /></Field>
            <Field label="יחס צוות-ילד" k="staff_child_ratio">
              <input value={staffChildRatio} onChange={(e) => setStaffChildRatio(e.target.value)} inputMode="decimal" placeholder="0.33 = 1:3" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field span label="שפות (בחרו את כולן)" k="languages_spoken">
              <div className="flex flex-wrap gap-2">
                {LANG_OPTS.map(o => (
                  <label key={o.value} className="flex items-center gap-1.5 font-hebrew" style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={languages.includes(o.value)} onChange={() => toggleLang(o.value)} style={{ accentColor: "#0A2B6B" }} />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field span label="גישה (בחרו את כל מה שמתאים)" k="approach">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(GAN_APPROACH_LABELS) as GanApproach[]).map(v => (
                  <label key={v} className="flex items-center gap-1.5 font-hebrew" style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={approach.includes(v)} onChange={() => toggleApproach(v)} style={{ accentColor: "#0A2B6B" }} />
                    {GAN_APPROACH_LABELS[v]}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="גן ביתי" k="is_home_gan"><TriSelect value={homeGan} onChange={setHomeGan} /></Field>
            <Field label="קבוצה קטנה / יחס אישי" k="small_group"><TriSelect value={smallGroup} onChange={setSmallGroup} /></Field>
            <Field label="צוות יציב" k="stable_staff"><TriSelect value={stableStaff} onChange={setStableStaff} /></Field>
            <Field label="חוגים בגן" k="has_chugim_in_gan"><TriSelect value={chugimInGan} onChange={setChugimInGan} /></Field>
            <Field label="קייטנה בחופשים" k="has_holiday_camp"><TriSelect value={holidayCamp} onChange={setHolidayCamp} /></Field>
            <Field label="גמישות בשעות" k="flexible_hours"><TriSelect value={flexibleHours} onChange={setFlexibleHours} /></Field>
            <Field span label="חוגים (מופרדים בפסיק)" k="chugim_types">
              <input value={chugim} onChange={(e) => setChugim(e.target.value)} placeholder="מוזיקה, אמנות, ספורט..." className="font-hebrew" style={inputStyle} />
            </Field>
          </div>
          </LockedContext.Provider>

          {lockedKeys.length > 0 && (
            <div style={{ marginTop: 16, background: "#F0F3F8", borderRadius: 14, padding: "12px 14px" }}>
              <div className="font-hebrew" style={{ fontSize: 13, fontWeight: 700, color: "#8A95A8", marginBottom: 6 }}>מה שכבר ידוע</div>
              {lockedKeys.map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 font-hebrew" style={{ padding: "6px 0", borderTop: "1px solid #E5E9F0", color: "#8A95A8", fontSize: 13 }}>
                  <span>{KIDS_FIELD_LABELS[key]}: <strong style={{ fontWeight: 600 }}>{formatKidsValue(key, currentKidsValue({ attributes: a as Record<string, unknown>, hours: place.hours, kosher: place.kosher }, key))}</strong></span>
                  <button type="button" onClick={() => setUnlocked((prev) => new Set(prev).add(key))}
                    style={{ background: "none", border: 0, color: "#1F5BB5", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", padding: 0 }}>
                    זה לא נכון, אני רוצה לתקן
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="font-hebrew" style={{ marginTop: 14, fontSize: 12.5, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, padding: "9px 12px" }}>
              {error}
            </div>
          )}
        </div>
        <div className="shrink-0 flex gap-2.5" style={{ padding: "14px 18px calc(86px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(180deg,transparent,#F6F9FE 30%)" }}>
          <button type="button" onClick={onClose} disabled={saving}
            className="font-hebrew font-bold" style={{ flex: "0 0 30%", background: "#fff", border: "1px solid #E5E9F0", borderRadius: 16, padding: 14, fontSize: 14, color: "#4A5568", cursor: "pointer" }}>
            ביטול
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 font-hebrew font-bold"
            style={{ background: "#0A2B6B", color: "#fff", borderRadius: 16, padding: 14, fontSize: 14, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
