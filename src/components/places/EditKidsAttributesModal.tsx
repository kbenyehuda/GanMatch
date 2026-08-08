"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Place, KidsAttributes, SpokenLanguage, KosherStatus } from "@/types/places";
import { useSession } from "@/lib/useSession";

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-hebrew block mb-1" style={{ fontSize: 11.5, color: "#8A95A8", fontWeight: 600 }}>{label}</label>
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLang = (lang: SpokenLanguage) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
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
      };
      const res = await fetch("/api/places/kids-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");
      onSaved({ ...place, attributes: data.attributes, hours: body.hours, kosher: (body.kosher as KosherStatus) ?? null });
      onShowToast?.("הפרטים נשמרו, תודה 🙏");
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
          <p className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", marginBottom: 14, lineHeight: 1.5 }}>
            כל שדה אופציונלי — מלאו מה שאתם יודעים, זה עוזר לכל ההורים שמחפשים גן.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="סוג גן">
              <select value={ganCategory} onChange={(e) => setGanCategory(e.target.value)} className="font-hebrew" style={selectStyle}>
                {GAN_CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field></div>
            {ganCategory === "MAON_SYMBOL" && (
              <div className="col-span-2"><Field label="סמל מעון">
                <input value={maonSymbolCode} onChange={(e) => setMaonSymbolCode(e.target.value)} inputMode="numeric" placeholder="לדוגמה: 73874" className="font-hebrew" style={inputStyle} />
              </Field></div>
            )}
            <Field label="גיל מינימום (בשנים)">
              <input value={minAgeYears} onChange={(e) => setMinAgeYears(e.target.value)} inputMode="decimal" placeholder="0.5" className="font-hebrew" style={inputStyle} />
            </Field>
            <Field label="גיל מקסימום (בשנים)">
              <input value={maxAgeYears} onChange={(e) => setMaxAgeYears(e.target.value)} inputMode="decimal" placeholder="3" className="font-hebrew" style={inputStyle} />
            </Field>
            <div className="col-span-2"><Field label="מחיר חודשי (₪)">
              <input value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} inputMode="numeric" placeholder="4200" className="font-hebrew" style={inputStyle} />
            </Field></div>
            <div className="col-span-2"><Field label="מקום פנוי">
              <select value={vacancyStatus} onChange={(e) => setVacancyStatus(e.target.value)} className="font-hebrew" style={selectStyle}>
                {VACANCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field></div>
            <div className="col-span-2"><Field label="שעות פעילות">
              <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="07:30–16:00, א'-ה'" className="font-hebrew" style={inputStyle} />
            </Field></div>
            <Field label="ימי שישי">
              <select value={fridaySchedule} onChange={(e) => setFridaySchedule(e.target.value)} className="font-hebrew" style={selectStyle}>
                {FRIDAY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="סוג אוכל">
              <select value={mealType} onChange={(e) => setMealType(e.target.value)} className="font-hebrew" style={selectStyle}>
                {MEAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="טבעוני"><TriSelect value={vegan} onChange={setVegan} /></Field>
            <Field label="צמחוני"><TriSelect value={vegetarian} onChange={setVegetarian} /></Field>
            <Field label="מגיש בשר"><TriSelect value={meat} onChange={setMeat} /></Field>
            <Field label="ידידותי לאלרגיות"><TriSelect value={allergy} onChange={setAllergy} /></Field>
            <Field label="כשרות">
              <select value={kosher} onChange={(e) => setKosher(e.target.value as KosherStatus | "")} className="font-hebrew" style={selectStyle}>
                {KOSHER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="גוף כשרות (אופציונלי)">
              <input value={kosherCertifier} onChange={(e) => setKosherCertifier(e.target.value)} placeholder="רבנות, בד״ץ..." className="font-hebrew" style={inputStyle} />
            </Field>
            <Field label="חצר חיצונית"><TriSelect value={hasOutdoor} onChange={setHasOutdoor} /></Field>
            <Field label='ממ"ד / מיקלט'><TriSelect value={hasMamad} onChange={setHasMamad} /></Field>
            <Field label="מצלמות"><TriSelect value={hasCctv} onChange={setHasCctv} /></Field>
            {hasCctv === "yes" && (
              <Field label="ניתן לצפייה מרחוק"><TriSelect value={cctvOnline} onChange={setCctvOnline} /></Field>
            )}
            <Field label="עזרה ראשונה"><TriSelect value={firstAid} onChange={setFirstAid} /></Field>
            <Field label="יחס צוות-ילד">
              <input value={staffChildRatio} onChange={(e) => setStaffChildRatio(e.target.value)} inputMode="decimal" placeholder="0.33 = 1:3" className="font-hebrew" style={inputStyle} />
            </Field>
            <div className="col-span-2"><Field label="שפות (בחרו את כולן)">
              <div className="flex flex-wrap gap-2">
                {LANG_OPTS.map(o => (
                  <label key={o.value} className="flex items-center gap-1.5 font-hebrew" style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={languages.includes(o.value)} onChange={() => toggleLang(o.value)} style={{ accentColor: "#0A2B6B" }} />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field></div>
            <div className="col-span-2"><Field label="חוגים (מופרדים בפסיק)">
              <input value={chugim} onChange={(e) => setChugim(e.target.value)} placeholder="מוזיקה, אמנות, ספורט..." className="font-hebrew" style={inputStyle} />
            </Field></div>
          </div>

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
