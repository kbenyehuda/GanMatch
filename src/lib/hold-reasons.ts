/** Why a recommendation was saved hidden (place_reviews.hold_reasons). Client-safe; the check is in review-check.ts. */
export type HoldReason =
  | "negative"        // a negative or critical tone
  | "allegation"      // a claim of fact against a person or place (theft, negligence, a lawsuit…)
  | "identifies_writer"
  | "contact_or_ad"   // phone, email, link, or advertising
  | "offensive"
  | "low_rating"
  | "check_unavailable";

export const HOLD_REASON_LABELS: Record<HoldReason, string> = {
  negative: "טון שלילי",
  allegation: "טענה עובדתית נגד אדם או מקום",
  identifies_writer: "פרטים שעלולים לזהות את הכותב",
  contact_or_ad: "פרטי קשר, קישור או פרסום",
  offensive: "שפה פוגענית",
  low_rating: "דירוג 1–2",
  check_unavailable: "הבדיקה האוטומטית לא הייתה זמינה",
};
