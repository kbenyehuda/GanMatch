/** Why a NEW place was saved hidden (places.attributes.place_hold.reasons). Client-safe; the check is in place-check.ts. */
export type PlaceHoldReason =
  | "offensive"          // insults, profanity, hate in the name or description
  | "contact_or_ad"      // a phone, link or advertising inside the name or description
  | "not_a_place"        // a test, a joke or nonsense
  | "allegation"         // a claim of wrongdoing stated as fact
  | "check_unavailable"; // the automatic check could not run (held, never published unchecked)

export const PLACE_HOLD_LABELS: Record<PlaceHoldReason, string> = {
  offensive: "שפה פוגענית",
  contact_or_ad: "פרטי קשר, קישור או פרסום בתוך השם או התיאור",
  not_a_place: "לא נראה כמו מקום אמיתי (בדיקה, בדיחה או ג'יבריש)",
  allegation: "טענה עובדתית נגד אדם או מקום",
  check_unavailable: "הבדיקה האוטומטית לא הייתה זמינה",
};
