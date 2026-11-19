"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
    <div className={span ? "col-span-2" : undefined} data-field={k}>
      <label className="font-hebrew block mb-1.5" style={{ fontSize: 13, color: "#4A5568", fontWeight: 700 }}>{label}</label>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = { width: "100%", background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12, padding: "12px 12px", fontSize: 15, outline: "none", minHeight: 46 };
const inputStyle: React.CSSProperties = { ...selectStyle };

/** Yes / No / Unknown as three big tappable segments (replaces a dropdown). */
function TriSelect({ value, onChange }: { value: TriState; onChange: (v: TriState) => void }) {
  const opts: { v: TriState; label: string; on: React.CSSProperties }[] = [
    { v: "yes", label: "כן", on: { background: "#16A34A", color: "#fff", borderColor: "#16A34A" } },
    { v: "no", label: "לא", on: { background: "#DC2626", color: "#fff", borderColor: "#DC2626" } },
    { v: "", label: "לא ידוע", on: { background: "#E8F0FB", color: "#0A2B6B", borderColor: "#C3DCF8" } },
  ];
  return (
    <div className="flex" role="radiogroup" style={{ gap: 6 }}>
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button key={o.v || "unknown"} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.v)}
            className="font-hebrew"
            style={{ flex: o.v === "" ? 1.4 : 1, minHeight: 44, borderRadius: 12, border: "1.5px solid #E5E9F0", background: "#fff", color: "#4A5568", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .15s", ...(active ? o.on : null) }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One-of-many choice as wrapping chips (replaces a dropdown with a handful of options). */
function ChipSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap" role="radiogroup" style={{ gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value || "unknown"} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className="font-hebrew"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 14, fontWeight: active ? 800 : 600, cursor: "pointer", transition: "all .15s",
              border: active ? "1.5px solid #0A2B6B" : "1.5px solid #E5E9F0", background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Many-of-many toggle chips (languages, approach). */
function ChipMulti({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={active} onClick={() => onToggle(o.value)}
            className="font-hebrew"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 14, fontWeight: active ? 800 : 600, cursor: "pointer", transition: "all .15s",
              border: active ? "1.5px solid #1F5BB5" : "1.5px solid #E5E9F0", background: active ? "#E8F0FB" : "#fff", color: active ? "#0A2B6B" : "#4A5568" }}>
            {active ? "✓ " : ""}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A titled card that groups related fields; hidden when every field in it is already known (locked). */
function Section({ title, emoji, keys, children }: { title: string; emoji: string; keys: string[]; children: React.ReactNode }) {
  const isLocked = useContext(LockedContext);
  if (keys.every((k) => isLocked(k))) return null;
  return (
    <section style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 18, padding: "14px 14px 16px", marginBottom: 12, boxShadow: "0 1px 2px rgba(10,43,107,.04)" }}>
      <h4 className="font-hebrew flex items-center gap-2" style={{ fontSize: 14, fontWeight: 800, color: "#0A2B6B", marginBottom: 12 }}>
        <span aria-hidden style={{ fontSize: 16 }}>{emoji}</span>{title}
      </h4>
      <div className="flex flex-col" style={{ gap: 14 }}>{children}</div>
    </section>
  );
}

export interface EditKidsAttributesModalProps {
  place: Place;
  onClose: () => void;
  onSaved: (place: Place) => void;
  onShowToast?: (msg: string) => void;
  /** An approved owner: nothing is locked, and the change goes live at once. */
  isOwner?: boolean;
  /** Opened from a "+ מחיר" style chip: scroll to this field (its key, e.g. monthly_price_nis) and focus it. */
  focusField?: string;
}

export function EditKidsAttributesModal({ place, onClose, onSaved, onShowToast, isOwner = false, focusField }: EditKidsAttributesModalProps) {
  const { session } = useSession();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusField) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${focusField}"]`);
    el?.scrollIntoView({ block: "center" });
    el?.querySelector<HTMLElement>("input,select")?.focus({ preventScroll: true });
  }, [focusField]);
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
    if (isOwner) return [];
    const values = { attributes: (place.attributes ?? {}) as Record<string, unknown>, hours: place.hours, kosher: place.kosher };
    return Object.keys(KIDS_FIELD_LABELS).filter((key) => {
      const v = currentKidsValue(values, key);
      return v != null && !(Array.isArray(v) && v.length === 0);
    });
  }, [isOwner, place.attributes, place.hours, place.kosher]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const isLocked = (key: string) => knownKeys.includes(key) && !unlocked.has(key);
  const lockedKeys = knownKeys.filter(isLocked);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildBody = () => {
    const priceNum = monthlyPrice.trim() ? Number(monthlyPrice.replace(/[^\d.]/g, "")) : null;
    const ratioNum = staffChildRatio.trim() ? Number(staffChildRatio.replace(",", ".")) : null;
    return {
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
      chugim_types: chugim.split(/[,;]/).map((x) => x.trim()).filter(Boolean),
      hours: hours.trim() || null,
      approach,
      is_home_gan: triToBool(homeGan),
      small_group: triToBool(smallGroup),
      stable_staff: triToBool(stableStaff),
      has_chugim_in_gan: triToBool(chugimInGan),
      has_holiday_camp: triToBool(holidayCamp),
      flexible_hours: triToBool(flexibleHours),
    };
  };
  // Snapshot of the form when it opened, to count how many fields the user actually changed.
  const [initialBody] = useState(() => buildBody() as Record<string, unknown>);
  const currentBody = buildBody() as Record<string, unknown>;
  const changedCount = Object.keys(currentBody).filter((k) => k !== "place_id" && JSON.stringify(currentBody[k]) !== JSON.stringify(initialBody[k])).length;

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
      const body = buildBody();
      const res = await fetch("/api/places/kids-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");
      if (data.applied && data.place) {
        // An approved owner's change is already live
        onSaved({ ...place, ...data.place });
        onShowToast?.("השינויים נשמרו ומופיעים באתר");
      } else {
        // Nothing changes on the place until an admin approves the request.
        onShowToast?.("תודה! נבדוק את העדכון ונפרסם אותו בקרוב 🙏");
      }
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
          <div>
            <h3 className="font-hebrew" style={{ fontSize: 18, fontWeight: 800 }}>מילוי פרטי הגן</h3>
            <div className="font-hebrew" style={{ fontSize: 12.5, color: "#8A95A8", marginTop: 1 }}>{place.name}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto" style={{ padding: "0 20px 12px" }}>
          <p className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", marginBottom: 6, lineHeight: 1.5 }}>
            כל שדה אופציונלי — מלאו מה שאתם יודעים, זה עוזר לכל ההורים שמחפשים גן.
          </p>
          <p className="font-hebrew" style={{ fontSize: 12, color: "#4A5568", marginBottom: 14, lineHeight: 1.5, background: "#FBF1D8", borderRadius: 10, padding: "8px 10px" }}>
            {isOwner
              ? "אתם בעלי המקום, אז השינויים יופיעו באתר מיד."
              : "כל עדכון נבדק על ידינו לפני שהוא מופיע באתר, כדי שהמידע יישאר אמין."}
          </p>
          <LockedContext.Provider value={isLocked}>
            <Section emoji="🏫" title="על הגן" keys={["gan_category", "maon_symbol_code", "is_home_gan", "small_group", "approach"]}>
              <Field label="סוג גן" k="gan_category">
                <ChipSelect value={ganCategory} onChange={setGanCategory} options={GAN_CATEGORY_OPTS} />
              </Field>
              {ganCategory === "MAON_SYMBOL" && (
                <Field label="סמל מעון" k="maon_symbol_code">
                  <input value={maonSymbolCode} onChange={(e) => setMaonSymbolCode(e.target.value)} inputMode="numeric" placeholder="לדוגמה: 73874" className="font-hebrew" style={inputStyle} />
                </Field>
              )}
              <Field label="גן ביתי" k="is_home_gan"><TriSelect value={homeGan} onChange={setHomeGan} /></Field>
              <Field label="קבוצה קטנה / יחס אישי" k="small_group"><TriSelect value={smallGroup} onChange={setSmallGroup} /></Field>
              <Field label="גישה (בחרו את כל מה שמתאים)" k="approach">
                <ChipMulti options={(Object.keys(GAN_APPROACH_LABELS) as GanApproach[]).map((v) => ({ value: v, label: GAN_APPROACH_LABELS[v] }))} selected={approach} onToggle={(v) => toggleApproach(v as GanApproach)} />
              </Field>
            </Section>

            <Section emoji="💰" title="גילאים, מחיר ומקום פנוי" keys={["min_age_months", "max_age_months", "monthly_price_nis", "vacancy_status"]}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="מגיל (בשנים)" k="min_age_months">
                  <input value={minAgeYears} onChange={(e) => setMinAgeYears(e.target.value)} inputMode="decimal" placeholder="0.5" className="font-hebrew" style={inputStyle} />
                </Field>
                <Field label="עד גיל (בשנים)" k="max_age_months">
                  <input value={maxAgeYears} onChange={(e) => setMaxAgeYears(e.target.value)} inputMode="decimal" placeholder="3" className="font-hebrew" style={inputStyle} />
                </Field>
              </div>
              <Field label="מחיר חודשי (₪)" k="monthly_price_nis">
                <input value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} inputMode="numeric" placeholder="4200" className="font-hebrew" style={inputStyle} />
              </Field>
              <Field label="מקום פנוי" k="vacancy_status">
                <ChipSelect value={vacancyStatus} onChange={setVacancyStatus} options={VACANCY_OPTS} />
              </Field>
            </Section>

            <Section emoji="🕘" title="שעות וימי שישי" keys={["hours", "friday_schedule", "flexible_hours", "has_holiday_camp"]}>
              <Field label="שעות פעילות" k="hours">
                <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="07:30–16:00, א'-ה'" className="font-hebrew" style={inputStyle} />
              </Field>
              <Field label="ימי שישי" k="friday_schedule">
                <ChipSelect value={fridaySchedule} onChange={setFridaySchedule} options={FRIDAY_OPTS} />
              </Field>
              <Field label="גמישות בשעות" k="flexible_hours"><TriSelect value={flexibleHours} onChange={setFlexibleHours} /></Field>
              <Field label="קייטנה בחופשים" k="has_holiday_camp"><TriSelect value={holidayCamp} onChange={setHolidayCamp} /></Field>
            </Section>

            <Section emoji="🍎" title="אוכל וכשרות" keys={["meal_type", "kosher", "kosher_certifier", "vegan_friendly", "vegetarian_friendly", "meat_served", "allergy_friendly"]}>
              <Field label="סוג אוכל" k="meal_type">
                <ChipSelect value={mealType} onChange={setMealType} options={MEAL_OPTS} />
              </Field>
              <Field label="כשרות" k="kosher">
                <ChipSelect value={kosher} onChange={(v) => setKosher(v as KosherStatus | "")} options={KOSHER_OPTS} />
              </Field>
              <Field label="גוף כשרות (אופציונלי)" k="kosher_certifier">
                <input value={kosherCertifier} onChange={(e) => setKosherCertifier(e.target.value)} placeholder="רבנות, בד״ץ..." className="font-hebrew" style={inputStyle} />
              </Field>
              <Field label="טבעוני" k="vegan_friendly"><TriSelect value={vegan} onChange={setVegan} /></Field>
              <Field label="צמחוני" k="vegetarian_friendly"><TriSelect value={vegetarian} onChange={setVegetarian} /></Field>
              <Field label="מגיש בשר" k="meat_served"><TriSelect value={meat} onChange={setMeat} /></Field>
              <Field label="ידידותי לאלרגיות" k="allergy_friendly"><TriSelect value={allergy} onChange={setAllergy} /></Field>
            </Section>

            <Section emoji="🛡️" title="בטיחות וצוות" keys={["has_outdoor_space", "has_mamad", "has_cctv", "cctv_streamed_online", "first_aid_trained", "staff_child_ratio", "stable_staff"]}>
              <Field label="חצר חיצונית" k="has_outdoor_space"><TriSelect value={hasOutdoor} onChange={setHasOutdoor} /></Field>
              <Field label='ממ"ד / מיקלט' k="has_mamad"><TriSelect value={hasMamad} onChange={setHasMamad} /></Field>
              <Field label="מצלמות" k="has_cctv"><TriSelect value={hasCctv} onChange={setHasCctv} /></Field>
              {hasCctv === "yes" && (
                <Field label="ניתן לצפייה מרחוק" k="cctv_streamed_online"><TriSelect value={cctvOnline} onChange={setCctvOnline} /></Field>
              )}
              <Field label="עזרה ראשונה" k="first_aid_trained"><TriSelect value={firstAid} onChange={setFirstAid} /></Field>
              <Field label="צוות יציב" k="stable_staff"><TriSelect value={stableStaff} onChange={setStableStaff} /></Field>
              <Field label="יחס צוות-ילד" k="staff_child_ratio">
                <input value={staffChildRatio} onChange={(e) => setStaffChildRatio(e.target.value)} inputMode="decimal" placeholder="0.33 = 1:3" className="font-hebrew" style={inputStyle} />
              </Field>
            </Section>

            <Section emoji="🎨" title="שפות וחוגים" keys={["languages_spoken", "has_chugim_in_gan", "chugim_types"]}>
              <Field label="שפות (בחרו את כולן)" k="languages_spoken">
                <ChipMulti options={LANG_OPTS} selected={languages} onToggle={(v) => toggleLang(v as SpokenLanguage)} />
              </Field>
              <Field label="חוגים בגן" k="has_chugim_in_gan"><TriSelect value={chugimInGan} onChange={setChugimInGan} /></Field>
              <Field label="חוגים (מופרדים בפסיק)" k="chugim_types">
                <input value={chugim} onChange={(e) => setChugim(e.target.value)} placeholder="מוזיקה, אמנות, ספורט..." className="font-hebrew" style={inputStyle} />
              </Field>
            </Section>
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
          <button type="button" onClick={submit} disabled={saving || changedCount === 0}
            className="flex-1 flex items-center justify-center gap-2 font-hebrew font-bold"
            style={{ background: changedCount === 0 ? "#C5CDD8" : "#0A2B6B", color: "#fff", borderRadius: 16, padding: 14, fontSize: 15, border: "none", cursor: saving || changedCount === 0 ? "not-allowed" : "pointer", transition: "background .15s" }}>
            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : changedCount === 0 ? "עדיין לא שיניתם כלום" : `שליחה · ${changedCount} ${changedCount === 1 ? "שינוי" : "שינויים"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
