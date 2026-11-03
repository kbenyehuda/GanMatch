// Fixed list so the map's chugim filter doesn't fragment into "חוג ציור" / "חוג ציור לילדים"…
// Keeps the values already on places (מוזיקה, ספורט). Shared by the approval AI and the triage form.
export const CHUGIM_TYPES = [
  "התעמלות", "כדורגל", "ספורט", "נינג'ה", "קפוארה", "ג'ודו ואומנויות לחימה", "שחייה", "ריקוד ובלט",
  "דרמה ותיאטרון", "מוזיקה", "יצירה ואומנות", "אנגלית", "מדע ורובוטיקה", "שחמט", "בישול", "הורה וילד",
];

// Kind of workshop (kids "סדנאות"). Stored on places as attributes.workshop_types, kept apart from
// chugim_types so each type's "תחום" filter only lists its own values.
export const WORKSHOP_TYPES = ["התפתחות תינוקות", "עיסוי תינוקות"];

/** The "תחום" list and places attribute for a kids type, or null when the type has none. */
export function kindFieldFor(specialty: string | null | undefined): { options: string[]; attr: "chugim_types" | "workshop_types" } | null {
  if (specialty === "חוגים") return { options: CHUGIM_TYPES, attr: "chugim_types" };
  if (specialty === "סדנאות") return { options: WORKSHOP_TYPES, attr: "workshop_types" };
  return null;
}
