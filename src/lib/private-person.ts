/**
 * Private people (babysitters, caregivers) are listed only with their consent (user, 2026-10-30;
 * LEGAL_REVIEW.md M4). משפחתונים, tutors and home cosmetics count as businesses and stay visible.
 */
export function isPrivatePersonEntry(category: string | null | undefined, specialty: string | null | undefined, name: string | null | undefined): boolean {
  if (category !== "kids") return false;
  return specialty === "בייביסיטר" || /מטפלת|בייביסיטר/.test(name ?? "");
}
