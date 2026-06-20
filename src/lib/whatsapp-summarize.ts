import "server-only";

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

// Kids-category recommendations can also state structured facts (kosher, hours,
// fridays, mamad, cameras) that have a fixed slot instead of a freeform tag.
const KIDS_FIELDS_PROMPT = `
בנוסף, מכיוון שזו המלצה בקטגוריית "ילדים" (גנים/צהרונים/חוגים), אם הדיאלוג מציין במפורש אחד מהפרטים המבניים הבאים — מלא אותו. אל תמלא שדה שלא הוזכר במפורש (השאר אותו לא מוגדר), ואל תמציא ניחושים.
- kosher: "CERTIFIED" אם נאמר שיש כשרות/הכשר, "NOT_CERTIFIED" אם נאמר במפורש שאין.
- hours: שעות פעילות כפי שנאמרו (טקסט חופשי, למשל "7:30–16:30").
- friday_schedule: "NONE" אם נאמר שסגור בימי שישי, "EVERY_FRIDAY" אם פתוח כל שישי, "EVERY_OTHER_FRIDAY" אם פתוח שישי שני.
- has_mamad: true/false אם נאמר במפורש אם יש או אין ממ"ד/מיקלט.
- has_cctv: true/false אם נאמר במפורש אם יש או אין מצלמות אבטחה.`;

function buildSystemPrompt(category: string): string {
  return category === "kids" ? SYSTEM_PROMPT + KIDS_FIELDS_PROMPT : SYSTEM_PROMPT;
}

const BASE_PROPERTIES = {
  summary: { type: "string", description: "סיכום קצר ואנונימי, או מחרוזת ריקה אם אין מידע נוסף" },
  rating: { type: "integer", enum: [1, 2, 4, 5] },
  tags: { type: "array", items: { type: "string" } },
};

const KIDS_PROPERTIES = {
  kosher: { type: "string", enum: ["CERTIFIED", "NOT_CERTIFIED"] },
  hours: { type: "string" },
  friday_schedule: { type: "string", enum: ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"] },
  has_mamad: { type: "boolean" },
  has_cctv: { type: "boolean" },
};

function buildTool(category: string) {
  return {
    type: "function" as const,
    function: {
      name: "classify_recommendation",
      description: "Summarize, rate, and tag a place recommendation.",
      parameters: {
        type: "object",
        properties: category === "kids" ? { ...BASE_PROPERTIES, ...KIDS_PROPERTIES } : BASE_PROPERTIES,
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
}

export async function summarizeRecommendation(input: SummarizeInput, apiKey: string): Promise<SummarizeResult> {
  const sourceText = input.sourceMessages && input.sourceMessages.length > 0
    ? input.sourceMessages.join("\n")
    : "אין";
  const existingTagsText = input.existingTags.length > 0 ? input.existingTags.join(", ") : "אין תגיות קיימות עדיין";

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
        { role: "system", content: buildSystemPrompt(input.category) },
        { role: "user", content: userContent },
      ],
      tools: [buildTool(input.category)],
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
  const tags: string[] = Array.isArray(args?.tags)
    ? Array.from(new Set<string>(args.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0).map((t: string) => t.trim())))
    : [];

  const result: SummarizeResult = { summary, rating, tags };
  if (input.category === "kids") {
    if (args?.kosher === "CERTIFIED" || args?.kosher === "NOT_CERTIFIED") result.kosher = args.kosher;
    if (typeof args?.hours === "string" && args.hours.trim()) result.hours = args.hours.trim();
    if (["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"].includes(args?.friday_schedule)) result.friday_schedule = args.friday_schedule;
    if (typeof args?.has_mamad === "boolean") result.has_mamad = args.has_mamad;
    if (typeof args?.has_cctv === "boolean") result.has_cctv = args.has_cctv;
  }
  return result;
}

// ── Tag taxonomy ─────────────────────────────────────────────────────────────

export async function getCategoryTags(admin: any, category: string): Promise<string[]> {
  const { data } = await admin.from("tag_taxonomy").select("name").eq("category", category).order("name");
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
