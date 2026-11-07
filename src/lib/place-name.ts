/**
 * Doctor cards already say "רופא ילדים" etc. under the name, so a leading
 * title ("ד"ר", "דר'", "דוקטור", "Dr.") is noise — strip it before saving.
 */
const DOCTOR_TITLE = /^\s*(?:ד["״׳']?\s*ר["״׳'.]?|דר["״׳'.]?|דוקטור|dr\.?)\s+/i;

export function cleanPlaceName(name: string, category: string | null | undefined): string {
  const trimmed = name.trim();
  if (category !== "doctor") return trimmed;
  const stripped = trimmed.replace(DOCTOR_TITLE, "").trim();
  return stripped || trimmed;
}
