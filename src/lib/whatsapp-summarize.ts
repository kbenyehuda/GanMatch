import "server-only";
import { factsFor, factsToAttributes, tagToFact, type PlaceFact } from "@/lib/place-facts";
import type { PlaceCategory } from "@/types/places";

// Defense-in-depth: blocks publishing a summary that still contains an
// Israeli-style phone number, even though the prompt already forbids it.
export const PHONE_REGEX = /\b(?:\+?972[-\s]?)?0?(?:[23489]|5[0-9])[-\s]?\d{3}[-\s]?\d{4}\b/;

export type Rating = 1 | 2 | 4 | 5;
const VALID_RATINGS: Rating[] = [1, 2, 4, 5];

const ENTHUSIASM_LABELS: Record<string, string> = {
  high: "ממליץ/ה בחום",
  medium: "ממליץ/ה",
  negative: "לא ממליץ/ה",
};

const SYSTEM_PROMPT = `אתה כותב סיכומים קצרים של המלצות מקהילה שכונתית, לפני שהן מתפרסמות באתר באופן אנונימי לחלוטין. בנוסף לסיכום, אתה גם מסווג את רמת ההמלצה ומתייג אותה.

תקבל:
1. "הודעת המקור" — השאלה/הבקשה שאליה ההמלצה הזו עונה (יכולה להיות ריקה אם ההמלצה עצמאית).
2. "טקסט ההמלצה" — הודעה אחת או יותר. לעיתים זה משפט אחד, ולעיתים זה דיאלוג שלם: שאלת מקור, ואז כמה הודעות שבהן הממליץ/ה עונה/ת על שאלות המשך (למשל "כמה זה עולה?", "יש תור?"). שני הצדדים של הדיאלוג — הודעת המקור וההמלצה/ות — יכולים להכיל מידע רלוונטי.
3. "תגיות קיימות לקטגוריה הזו" — רשימת תגיות שכבר בשימוש בקטגוריה הזו.

עליך להחזיר שלושה דברים:

א. summary — סיכום קצר (משפט אחד או שניים), בעברית יומיומית וקלילה, שמעביר את כל המידע הרלוונטי על המקום/נותן השירות — איכות, מחיר, שירות, זמן המתנה, התאמה לילדים, חיות מחמד, וכל פרט ספציפי אחר.
- אל תעתיק משפטים כמו שהם מהמקור — תמיד תנסח מחדש במילים שלך.
- אל תכלול שום מידע על מי שכתב את ההמלצה (שם, מספר טלפון, ניחוש לזהות, רמזים מזהים מכל סוג) — הסיכום חייב להישאר אנונימי לחלוטין.
- אם אין שום מידע נוסף מעבר לשם המקום עצמו — החזר מחרוזת ריקה.
- לפני שאתה משיב, עבור שוב על כל ההודעות (גם הודעת המקור) ובדוק שלא פספסת פרט רלוונטי על המקום — אם כן, הוסף אותו לסיכום.

ב. rating — דירוג כוכבים, אחד מתוך: 5, 4, 2, 1.
- 5 = המלצה נלהבת/יוצאת דופן.
- 4 = המלצה חיובית רגילה. זה גם הדירוג כשאין מידע נוסף מעבר לשם המקום (מישהו פשוט הציע את השם בחיוב).
- 2 = המלצה שלילית.
- 1 = המלצה שלילית בצורה חריפה/חמורה ("אל תלכו לשם בשום אופן" וכו').
- קבע את הדירוג לפי הטון האמיתי של הדיאלוג, גם אם אין מידע נוסף לסיכום. אם ההמלצה שלילית, רכך את הניסוח ב-summary אך השאר אותו ברור כאי-המלצה — אל תהפוך אותה לחיובית, וה-rating חייב עדיין לשקף 2 או 1.

ג. tags — מערך תגיות קצרות (אפשר גם מערך ריק []) לכל פרט קונקרטי שמוזכר בדיאלוג — כולל סוגי שירותים/טיפולים ספציפיים (למשל: פדיקור, מניקור, צבע שיער, הסרת שיער, חורים באוזניים, טיפול פנים, עיסוי), מאפיינים לוגיסטיים (הגעה לבית, ללא צורך בתור, תור ארוך/קצר, מחיר נוח/יקר), והתאמה לקהל מסוים (מתאים להריון, מתאים לילדים, מקבל חיות מחמד). אל תתעלם ממידע רק בגלל שהוא "מתאר את סוג העסק" — אם זה מוזכר באופן ספציפי בדיאלוג (בהודעת המקור או בהמלצה), זו תגית טובה ושימושית. שדות שיש להם תשובה מובנית (ראה מטה, אם רלוונטי לקטגוריה) לא צריכים תגית נפרדת.
- קודם בדוק אם אחת מ"התגיות הקיימות לקטגוריה הזו" מתאימה — אם כן, השתמש בה (אפשר כמה).
- רק אם אין תגית קיימת שמתאימה, צור תגית קצרה וחדשה (1-3 מילים, עברית).
- החזר מערך ריק רק אם הדיאלוג לא מזכיר שום פרט קונקרטי מעבר לשם המקום עצמו.

החזר רק את הערכים המבוקשים בכלי. בלי מירכאות, בלי הקדמות, בלי הערות.`;

// Fixed list so the map's chugim filter doesn't fragment into "חוג ציור" / "חוג ציור לילדים"…
// Keeps the values already on places (מוזיקה, ספורט).
export const CHUGIM_TYPES = [
  "התעמלות", "כדורגל", "ספורט", "נינג'ה", "קפוארה", "ג'ודו ואומנויות לחימה", "שחייה", "ריקוד ובלט",
  "דרמה ותיאטרון", "מוזיקה", "יצירה ואומנות", "אנגלית", "מדע ורובוטיקה", "שחמט", "בישול", "הורה וילד",
];
// Kids-category recommendations can also state structured facts (kosher, hours,
// fridays, mamad, cameras) that have a fixed slot instead of a freeform tag.
const KIDS_FIELDS_PROMPT = `
בנוסף, מכיוון שזו המלצה בקטגוריית "ילדים" (גנים/צהרונים/חוגים), אם הדיאלוג מציין במפורש אחד מהפרטים המבניים הבאים — מלא אותו. אל תמלא שדה שלא הוזכר במפורש (השאר אותו לא מוגדר), ואל תמציא ניחושים.
- kosher: "CERTIFIED" אם נאמר שיש כשרות/הכשר, "NOT_CERTIFIED" אם נאמר במפורש שאין.
- hours: שעות פעילות כפי שנאמרו (טקסט חופשי, למשל "7:30–16:30").
- friday_schedule: "NONE" אם נאמר שסגור בימי שישי, "EVERY_FRIDAY" אם פתוח כל שישי, "EVERY_OTHER_FRIDAY" אם פתוח שישי שני.
- has_mamad: true/false אם נאמר במפורש אם יש או אין ממ"ד/מיקלט.
- has_cctv: true/false אם נאמר במפורש אם יש או אין מצלמות אבטחה.
- gan_category: סוג המסגרת, רק אם ברור מהדיאלוג: "MISHPACHTON" (משפחתון), "PRIVATE_GAN" (גן פרטי), "MUNICIPAL_GAN" (גן עירוני/ציבורי), "MAON_SYMBOL" (מעון סמל / מעון של ויצו, נעמת וכו'), "TZAHARON_MUNICIPAL" (צהרון עירוני), "TZAHARON_PRIVATE_SUPERVISED" (צהרון פרטי מפוקח), "TZAHARON_PRIVATE_UNSUPERVISED" (צהרון פרטי לא מפוקח).
- has_outdoor_space: true/false אם נאמר במפורש אם יש או אין חצר/שטח חוץ.
- meal_type: "IN_HOUSE_COOK" (אוכל מבושל במקום), "EXTERNAL_CATERING" (קייטרינג), "PARENTS_BRING" (ההורים מביאים אוכל), "MIXED" (שילוב).
- monthly_price_nis: מחיר חודשי בשקלים כמספר, רק אם נאמר סכום חודשי מפורש (לא לשנה, לא ליום).
- min_age_months / max_age_months: גילאי הקבלה בחודשים, רק אם נאמרו במפורש (למשל "מגיל שנה ו-3" = 15).
- staff_child_ratio: מספר הילדים לכל אשת צוות, רק אם נאמר במפורש או ניתן לחישוב ישיר (למשל "18 ילדים על 3 נשות צוות" = 6).
- first_aid_trained: true אם נאמר שהצוות עבר הכשרת עזרה ראשונה.
- vegetarian_friendly / vegan_friendly / allergy_friendly / meat_served: true/false רק אם נאמר במפורש.
- chugim_types: סוגי החוגים שהמקום מציע (חוג, סטודיו, או גן שיש בו חוגים), מתוך הרשימה בלבד: ${CHUGIM_TYPES.join(", ")}. מותר להסיק מההקשר ומהודעת המקור (למשל "סטודיו מובה" בתשובה ל"חוג קפוארה לילד בן 4" = קפוארה). אם לא ברור — השאר ריק.`;

// The kids "type" (גן / בייביסיטר / חוג / שחייה…). Unlike the facts above it is usually implied,
// not stated: "סטודיו מובה" is only recognisably a חוג from the question it answered.
function kidsSpecialtyPrompt(specialtyOptions: string[]): string {
  if (specialtyOptions.length === 0) return "";
  return `
- specialty: סוג המקום/נותן השירות, אחד מהרשימה בלבד: ${specialtyOptions.join(", ")}. כאן מותר להסיק מההקשר, במיוחד מ"הודעת המקור" (למשל תשובה לשאלה "חוג קפוארה לילד בן 4?" היא חוג, ותשובה ל"מחפשת מטפלת" היא בייביסיטר). גן, מעון, משפחתון וצהרון הם "גני ילדים". אם עדיין לא ברור — השאר ריק.`;
}

// Other categories: the facts their map filters use (places.attributes / hmo / kosher / price_range).
function categoryFieldsPrompt(category: string, specialtyOptions: string[]): string {
  const intro = `\nבנוסף, אם הדיאלוג מציין במפורש אחד מהפרטים הבאים — מלא אותו. אל תמלא שדה שלא הוזכר במפורש, ואל תמציא ניחושים.`;
  const specialty = specialtyOptions.length > 0
    ? `\n- specialty: סוג נותן השירות, אחד מהרשימה בלבד: ${specialtyOptions.join(", ")}. אם אף אחד לא מתאים או שזה לא ברור — השאר ריק.`
    : "";
  switch (category) {
    case "doctor":
      return intro + specialty
        + `\n- for_children: true אם נותן השירות מטפל בילדים (רופא/ת ילדים, התמחות לילדים), false אם נאמר שמטפל רק במבוגרים.`
        + `\n- hmo: הקופות שנותן השירות עובד איתן, רק אם נאמר במפורש (למשל "מקבל מכבי", "דרך כללית"). מתוך: "מכבי", "כללית", "מאוחדת", "לאומית".`;
    case "cosmetics":
      return specialty ? intro + specialty : "";
    case "cafe":
    case "food":
      return intro
        + `\n- kosher: "CERTIFIED" אם נאמר שיש כשרות/הכשר, "NOT_CERTIFIED" אם נאמר במפורש שאין.`
        + `\n- price_range: 1 (זול), 2 (בינוני), 3 (יקר), רק אם נאמר משהו מפורש על המחיר.`;
    case "sport":
      return intro + specialty
        + `\n- gender_restriction: "women_only" אם נאמר שזה לנשים בלבד, "men_only" אם לגברים בלבד.`;
    case "attraction":
      return intro + `\n- indoor_outdoor: "indoor" (מקורה), "outdoor" (בחוץ), "both" (גם וגם), רק אם ברור מהדיאלוג.`;
    default:
      return "";
  }
}

/** Fact labels for categories with a fixed vocabulary (src/lib/place-facts.ts); empty otherwise. */
function factLabelsFor(category: string): string[] {
  return factsFor(category as PlaceCategory).map((f) => f.label);
}

// Kids, doctors and cosmetics: tags are a closed list (the facts vocabulary), so the map's
// chips and filters don't fragment. Overrides the "create a new tag" rule above.
function factTagsPrompt(category: string): string {
  const labels = factLabelsFor(category);
  if (labels.length === 0) return "";
  return `

חשוב — בקטגוריה הזו התגיות הן רשימה סגורה. בחר תגיות רק מתוך הרשימה הבאה, ורק אם הפרט נאמר במפורש בדיאלוג (לא ניחוש): ${labels.join(", ")}.
- אל תיצור תגיות חדשות.
- לא תגית: סוג המקום (גן, משפחתון, רופא עור), קבוצת גיל (תינוקות), קופת חולים, מיקום, או שבח כללי (מומלץ, מקצועי, אדיב, מקסים).
- אם אף תגית מהרשימה לא נאמרה במפורש — החזר מערך ריק.`;
}

function buildSystemPrompt(category: string, specialtyOptions: string[]): string {
  return SYSTEM_PROMPT + (category === "kids"
    ? KIDS_FIELDS_PROMPT + kidsSpecialtyPrompt(specialtyOptions)
    : categoryFieldsPrompt(category, specialtyOptions)) + factTagsPrompt(category);
}

const HMO_CODES: Record<string, string> = { "מכבי": "maccabi", "כללית": "clalit", "מאוחדת": "meuhedet", "לאומית": "leumit" };
const HMO_CODE_VALUES = new Set(Object.values(HMO_CODES));

/** places.hmo holds codes ("maccabi"); triage and the LLM speak Hebrew ("מכבי"). Accepts either. */
export function toHmoCodes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = values.map(v => (typeof v === "string" ? (HMO_CODES[v.trim()] ?? v.trim()) : "")).filter(v => HMO_CODE_VALUES.has(v));
  return Array.from(new Set(out));
}

const BASE_PROPERTIES = {
  summary: { type: "string", description: "סיכום קצר ואנונימי, או מחרוזת ריקה אם אין מידע נוסף" },
  rating: { type: "integer", enum: [1, 2, 4, 5] },
  tags: { type: "array", items: { type: "string" } },
};

const GAN_CATEGORIES = ["MAON_SYMBOL", "MISHPACHTON", "PRIVATE_GAN", "MUNICIPAL_GAN", "TZAHARON_MUNICIPAL", "TZAHARON_PRIVATE_SUPERVISED", "TZAHARON_PRIVATE_UNSUPERVISED"];
const MEAL_TYPES = ["IN_HOUSE_COOK", "EXTERNAL_CATERING", "PARENTS_BRING", "MIXED"];
const KIDS_BOOLEAN_ATTRS = ["has_outdoor_space", "first_aid_trained", "vegetarian_friendly", "vegan_friendly", "allergy_friendly", "meat_served"] as const;

const KIDS_PROPERTIES = {
  kosher: { type: "string", enum: ["CERTIFIED", "NOT_CERTIFIED"] },
  hours: { type: "string" },
  friday_schedule: { type: "string", enum: ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"] },
  has_mamad: { type: "boolean" },
  has_cctv: { type: "boolean" },
  gan_category: { type: "string", enum: GAN_CATEGORIES },
  has_outdoor_space: { type: "boolean" },
  meal_type: { type: "string", enum: MEAL_TYPES },
  monthly_price_nis: { type: "number" },
  min_age_months: { type: "integer" },
  max_age_months: { type: "integer" },
  staff_child_ratio: { type: "number" },
  first_aid_trained: { type: "boolean" },
  vegetarian_friendly: { type: "boolean" },
  vegan_friendly: { type: "boolean" },
  allergy_friendly: { type: "boolean" },
  meat_served: { type: "boolean" },
  chugim_types: { type: "array", items: { type: "string", enum: CHUGIM_TYPES } },
};

function categoryProperties(category: string, specialtyOptions: string[]): Record<string, unknown> {
  const specialty = specialtyOptions.length > 0 ? { specialty: { type: "string", enum: specialtyOptions } } : {};
  switch (category) {
    case "kids": return { ...KIDS_PROPERTIES, ...specialty };
    case "doctor": return {
      ...specialty,
      for_children: { type: "boolean" },
      hmo: { type: "array", items: { type: "string", enum: Object.keys(HMO_CODES) } },
    };
    case "cosmetics": return specialty;
    case "cafe":
    case "food": return {
      kosher: { type: "string", enum: ["CERTIFIED", "NOT_CERTIFIED"] },
      price_range: { type: "integer", enum: [1, 2, 3] },
    };
    case "sport": return { ...specialty, gender_restriction: { type: "string", enum: ["women_only", "men_only"] } };
    case "attraction": return { indoor_outdoor: { type: "string", enum: ["indoor", "outdoor", "both"] } };
    default: return {};
  }
}

function buildTool(category: string, specialtyOptions: string[]) {
  return {
    type: "function" as const,
    function: {
      name: "classify_recommendation",
      description: "Summarize, rate, and tag a place recommendation.",
      parameters: {
        type: "object",
        properties: {
          ...BASE_PROPERTIES,
          ...(factLabelsFor(category).length > 0 ? { tags: { type: "array", items: { type: "string", enum: factLabelsFor(category) } } } : {}),
          ...categoryProperties(category, specialtyOptions),
        },
        required: ["summary", "rating", "tags"],
      },
    },
  };
}

export interface SummarizeInput {
  placeName: string;
  recommendationText: string;
  sourceMessages: string[] | null;
  enthusiasm: string;
  existingTags: string[];
  category: string;
  /** Allowed specialty values for this category (specialty_taxonomy); the LLM may only pick from these. */
  specialtyOptions?: string[];
}

export interface SummarizeResult {
  summary: string;
  rating: Rating;
  tags: string[];
  kosher?: "CERTIFIED" | "NOT_CERTIFIED";
  hours?: string;
  friday_schedule?: "NONE" | "EVERY_FRIDAY" | "EVERY_OTHER_FRIDAY";
  has_mamad?: boolean;
  has_cctv?: boolean;
  // Further facts the map filters on, for any category. Not stored on the staging row; applied
  // to the place at approval time, and only where the place has no value yet (applyPlaceExtras).
  place_extras?: PlaceExtras;
}

export interface PlaceExtras {
  attributes?: Record<string, unknown>;   // places.attributes keys (specialty, has_outdoor_space, …)
  hmo?: string[];                         // codes: maccabi | clalit | meuhedet | leumit
  kosher?: "CERTIFIED" | "NOT_CERTIFIED"; // places.kosher (cafe/food)
  price_range?: 1 | 2 | 3;                // places.price_range (cafe/food)
}

export async function summarizeRecommendation(input: SummarizeInput, apiKey: string): Promise<SummarizeResult> {
  const sourceText = input.sourceMessages && input.sourceMessages.length > 0
    ? input.sourceMessages.join("\n")
    : "אין";
  const factLabels = factLabelsFor(input.category);
  const existingTagsText = factLabels.length > 0
    ? factLabels.join(", ")
    : input.existingTags.length > 0 ? input.existingTags.join(", ") : "אין תגיות קיימות עדיין";

  const userContent = [
    `שם המקום: ${input.placeName}`,
    `מידת התלהבות (רמז ראשוני, לא סופי): ${ENTHUSIASM_LABELS[input.enthusiasm] ?? input.enthusiasm}`,
    `הודעת המקור:\n${sourceText}`,
    `טקסט ההמלצה:\n${input.recommendationText}`,
    `תגיות קיימות לקטגוריה הזו: ${existingTagsText}`,
  ].join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: buildSystemPrompt(input.category, input.specialtyOptions ?? []) },
        { role: "user", content: userContent },
      ],
      tools: [buildTool(input.category, input.specialtyOptions ?? [])],
      tool_choice: { type: "function", function: { name: "classify_recommendation" } },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "OpenAI request failed");

  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("OpenAI did not return a structured result");

  const args = JSON.parse(call.function.arguments);
  const summary = String(args?.summary ?? "").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  const ratingRaw = Number(args?.rating);
  const rating: Rating = VALID_RATINGS.includes(ratingRaw as Rating) ? (ratingRaw as Rating) : 4;
  let tags: string[] = Array.isArray(args?.tags)
    ? Array.from(new Set<string>(args.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0).map((t: string) => t.trim())))
    : [];
  // Fixed-vocabulary categories: keep only facts, under their canonical label.
  const facts = factLabels.length > 0
    ? Array.from(new Set(tags.map((t) => tagToFact(t, input.category as PlaceCategory)).filter((f): f is PlaceFact => f != null)))
    : [];
  if (factLabels.length > 0) tags = facts.map((f) => f.label);

  const result: SummarizeResult = { summary, rating, tags };
  if (input.category === "kids") {
    if (args?.kosher === "CERTIFIED" || args?.kosher === "NOT_CERTIFIED") result.kosher = args.kosher;
    if (typeof args?.hours === "string" && args.hours.trim()) result.hours = args.hours.trim();
    if (["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"].includes(args?.friday_schedule)) result.friday_schedule = args.friday_schedule;
    if (typeof args?.has_mamad === "boolean") result.has_mamad = args.has_mamad;
    if (typeof args?.has_cctv === "boolean") result.has_cctv = args.has_cctv;
    const attrs: Record<string, unknown> = {};
    if (GAN_CATEGORIES.includes(args?.gan_category)) attrs.gan_category = args.gan_category;
    if (MEAL_TYPES.includes(args?.meal_type)) attrs.meal_type = args.meal_type;
    for (const k of KIDS_BOOLEAN_ATTRS) if (typeof args?.[k] === "boolean") attrs[k] = args[k];
    const price = Number(args?.monthly_price_nis);
    if (Number.isFinite(price) && price >= 300 && price <= 20000) attrs.monthly_price_nis = Math.round(price);
    for (const k of ["min_age_months", "max_age_months"]) {
      const m = Number(args?.[k]);
      if (Number.isInteger(m) && m >= 0 && m <= 144) attrs[k] = m;
    }
    const ratio = Number(args?.staff_child_ratio);
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 30) attrs.staff_child_ratio = Math.round(ratio * 10) / 10;
    if (typeof args?.specialty === "string" && (input.specialtyOptions ?? []).includes(args.specialty)) attrs.specialty = args.specialty;
    const chugim = Array.isArray(args?.chugim_types)
      ? Array.from(new Set((args.chugim_types as unknown[]).filter((c): c is string => typeof c === "string" && CHUGIM_TYPES.includes(c))))
      : [];
    if (chugim.length > 0) attrs.chugim_types = chugim;
    if (Object.keys(attrs).length > 0) result.place_extras = { attributes: attrs };
  } else {
    const extras: PlaceExtras = {};
    const attrs: Record<string, unknown> = {};
    if (typeof args?.specialty === "string" && (input.specialtyOptions ?? []).includes(args.specialty)) attrs.specialty = args.specialty;
    if (input.category === "doctor" && typeof args?.for_children === "boolean") attrs.for_children = args.for_children;
    if (input.category === "sport" && ["women_only", "men_only"].includes(args?.gender_restriction)) attrs.gender_restriction = args.gender_restriction;
    if (input.category === "attraction" && ["indoor", "outdoor", "both"].includes(args?.indoor_outdoor)) attrs.indoor_outdoor = args.indoor_outdoor;
    if (Object.keys(attrs).length > 0) extras.attributes = attrs;
    const hmo = input.category === "doctor" ? toHmoCodes(args?.hmo) : [];
    if (hmo.length > 0) extras.hmo = hmo;
    if (["cafe", "food"].includes(input.category)) {
      if (args?.kosher === "CERTIFIED" || args?.kosher === "NOT_CERTIFIED") extras.kosher = args.kosher;
      if ([1, 2, 3].includes(Number(args?.price_range))) extras.price_range = Number(args.price_range) as 1 | 2 | 3;
    }
    if (Object.keys(extras).length > 0) result.place_extras = extras;
  }
  // Tags = fields: each fact also fills its field. Fields the model set explicitly win.
  const implied = factsToAttributes(facts);
  if (Object.keys(implied).length > 0) {
    const extras = result.place_extras ?? {};
    extras.attributes = { ...implied, ...(extras.attributes ?? {}) };
    result.place_extras = extras;
  }
  return result;
}

// ── Tag taxonomy ─────────────────────────────────────────────────────────────

export async function getCategoryTags(admin: any, category: string): Promise<string[]> {
  const { data } = await admin.from("tag_taxonomy").select("name").eq("category", category).order("name");
  return (data ?? []).map((r: any) => r.name as string);
}

export async function getCategorySpecialties(admin: any, category: string): Promise<string[]> {
  const { data } = await admin.from("specialty_taxonomy").select("name").eq("category", category).order("name");
  return (data ?? []).map((r: any) => r.name as string);
}

export async function recordNewTags(admin: any, category: string, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  await admin.from("tag_taxonomy").upsert(
    tags.map(name => ({ category, name })),
    { onConflict: "category,name", ignoreDuplicates: true }
  );
}

// ── Merging structured kids fields into an already-created place ──────────────

export type KidsStructuredFields = Pick<SummarizeResult, "kosher" | "hours" | "friday_schedule" | "has_mamad" | "has_cctv">;

/** Picks just the kids structured fields off a SummarizeResult, for persisting onto the staging row. */
export function pickKidsStructuredFields(result: SummarizeResult): KidsStructuredFields {
  return {
    kosher: result.kosher,
    hours: result.hours,
    friday_schedule: result.friday_schedule,
    has_mamad: result.has_mamad,
    has_cctv: result.has_cctv,
  };
}

export async function applyKidsFieldsToPlace(admin: any, placeId: string, fields: KidsStructuredFields): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.kosher != null) update.kosher = fields.kosher;
  if (fields.hours != null) update.hours = fields.hours;

  if (fields.friday_schedule != null || fields.has_mamad != null || fields.has_cctv != null) {
    const { data: existing } = await admin.from("places").select("attributes").eq("id", placeId).single();
    const attrs = { ...((existing?.attributes as Record<string, unknown>) ?? {}) };
    if (fields.friday_schedule != null) attrs.friday_schedule = fields.friday_schedule;
    if (fields.has_mamad != null) attrs.has_mamad = fields.has_mamad;
    if (fields.has_cctv != null) attrs.has_cctv = fields.has_cctv;
    update.attributes = attrs;
  }

  if (Object.keys(update).length > 0) await admin.from("places").update(update).eq("id", placeId);
}

/**
 * Fills facts from a WhatsApp review into the place, only where the place has no value yet,
 * so anything a parent or admin entered (or an earlier review set) is never overwritten.
 * Lists are the exception (HMO, chugim_types): new values are added to what's there.
 */
export async function applyPlaceExtras(admin: any, placeId: string, extras: PlaceExtras | undefined): Promise<void> {
  if (!extras) return;
  const { data: place } = await admin.from("places").select("attributes, hmo, kosher, price_range").eq("id", placeId).single();
  if (!place) return;
  const update: Record<string, unknown> = {};
  const attrs = { ...((place.attributes as Record<string, unknown>) ?? {}) };
  let attrsChanged = false;
  for (const [k, v] of Object.entries(extras.attributes ?? {})) {
    if (Array.isArray(v)) {
      const current = Array.isArray(attrs[k]) ? (attrs[k] as unknown[]) : [];
      const merged = Array.from(new Set([...current, ...v]));
      if (merged.length !== current.length) { attrs[k] = merged; attrsChanged = true; }
    } else if (v != null && attrs[k] == null) { attrs[k] = v; attrsChanged = true; }
  }
  if (attrsChanged) update.attributes = attrs;
  if (extras.hmo?.length) {
    const current = toHmoCodes(place.hmo);
    const merged = Array.from(new Set([...current, ...extras.hmo]));
    if (merged.length !== current.length) update.hmo = merged;
  }
  if (extras.kosher && place.kosher == null) update.kosher = extras.kosher;
  if (extras.price_range && place.price_range == null) update.price_range = extras.price_range;
  if (Object.keys(update).length > 0) await admin.from("places").update(update).eq("id", placeId);
}

// ── Publishing a (re)generated summary into the live, already-approved review ──

export async function syncSummaryToPlaceReview(
  admin: any,
  args: { placeId: string; reviewerName: string; text: string | null; rating: Rating; tags: string[] }
): Promise<boolean> {
  const { data: review } = await admin
    .from("place_reviews")
    .select("id")
    .eq("place_id", args.placeId)
    .eq("whatsapp_reviewer_name", args.reviewerName)
    .maybeSingle();
  if (!review) return false;

  await admin.from("place_reviews").update({
    text: args.text,
    rating: args.rating,
    tags: args.tags,
  }).eq("id", review.id);
  return true;
}
