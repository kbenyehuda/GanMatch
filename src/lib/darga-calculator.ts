/**
 * Israeli Daycare Subsidy ("Darga") Calculator
 * Based on Ministry of Labor 2025–2026 eligibility tables.
 * Per-capita income (household income / household size) determines the subsidy tier.
 *
 * NOTE: These are placeholder brackets. Replace with official tables from
 * daycaresimulatordocuments.labor.gov.il or Ministry of Labor documentation.
 */

export interface DargaBracket {
  /** Max per-capita income (NIS/month) for this tier */
  maxPerCapita: number;
  /** Subsidy amount (NIS/month) - approximate */
  subsidy: number;
  /** Darga tier (1 = lowest income, highest subsidy) */
  darga: number;
}

// Placeholder brackets - replace with official 2026 tables
const DARGA_BRACKETS: DargaBracket[] = [
  { maxPerCapita: 1500, subsidy: 1400, darga: 1 },
  { maxPerCapita: 2000, subsidy: 1200, darga: 2 },
  { maxPerCapita: 2500, subsidy: 1000, darga: 3 },
  { maxPerCapita: 3000, subsidy: 800, darga: 4 },
  { maxPerCapita: 4000, subsidy: 600, darga: 5 },
  { maxPerCapita: 5000, subsidy: 400, darga: 6 },
  { maxPerCapita: 6500, subsidy: 200, darga: 7 },
  { maxPerCapita: 8500, subsidy: 100, darga: 8 },
  { maxPerCapita: Infinity, subsidy: 0, darga: 9 },
];

/**
 * Calculate estimated daycare subsidy (darga) based on household income and size.
 * Uses per-capita income: total household income / number of household members (up to age 18).
 *
 * @param householdIncomeNet - Monthly net household income in NIS
 * @param householdSize - Number of people in household (up to 18 years)
 * @returns { darga, subsidy } - Estimated tier and monthly subsidy amount
 */
export function calculateDargaSubsidy(
  householdIncomeNet: number,
  householdSize: number
): { darga: number; subsidy: number } {
  if (householdSize < 1) householdSize = 1;
  const perCapita = householdIncomeNet / householdSize;

  const bracket = DARGA_BRACKETS.find((b) => perCapita <= b.maxPerCapita);
  if (!bracket) {
    return { darga: 9, subsidy: 0 };
  }
  return { darga: bracket.darga, subsidy: bracket.subsidy };
}
