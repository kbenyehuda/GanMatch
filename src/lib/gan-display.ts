import type { Gan } from "@/types/ganim";

export function formatGanCategoryHe(category: Gan["category"]): string {
  switch (category) {
    case "MAON_SYMBOL":
      return "מעון סמל";
    case "PRIVATE_GAN":
      return "גן פרטי";
    case "MISHPACHTON":
      return "משפחתון";
    case "MUNICIPAL_GAN":
      return "גן עירוני";
    case "UNSPECIFIED":
    default:
      return "לא ידוע";
  }
}

export function formatGanCategoryAddonLabelHe(gan: Gan): { label: string; value: string } | null {
  switch (gan.category) {
    case "MAON_SYMBOL":
      return gan.maon_symbol_code ? { label: "סמל מעון", value: gan.maon_symbol_code } : null;
    case "PRIVATE_GAN": {
      const v = gan.private_supervision ?? null;
      const text =
        v === "SUPERVISED" ? "🛡️ מפוקח" : v === "NOT_SUPERVISED" ? "לא מפוקח" : "לא ידוע";
      return { label: "פיקוח", value: text };
    }
    case "MISHPACHTON": {
      const v = gan.mishpachton_affiliation ?? null;
      const text = v === "TAMAT" ? 'תמ״ת' : v === "PRIVATE" ? "פרטי" : "לא ידוע";
      return { label: "שיוך", value: text };
    }
    case "MUNICIPAL_GAN": {
      const v = gan.municipal_grade ?? null;
      const text = v === "TTAH" ? 'טט״ח' : v === "TAH" ? 'ט״ח' : v === "HOVA" ? "חובה" : "לא ידוע";
      return { label: "שכבה", value: text };
    }
    default:
      return null;
  }
}

export function formatAgesHe(gan: Pick<Gan, "min_age_months" | "max_age_months">): string | null {
  const min = gan.min_age_months ?? null;
  const max = gan.max_age_months ?? null;
  if (min == null && max == null) return null;
  const toYears = (m: number) => {
    const y = m / 12;
    // prefer 0.5 increments when relevant, otherwise 1 decimal
    const rounded = Math.round(y * 2) / 2;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, "");
  };
  if (min != null && max != null) return `${toYears(min)}–${toYears(max)}`;
  if (min != null) return `מ-${toYears(min)}`;
  return `עד ${toYears(max as number)}`;
}

export function formatPriceHe(gan: Pick<Gan, "monthly_price_nis">): string | null {
  const p = gan.monthly_price_nis ?? null;
  if (p == null) return null;
  const n = Math.round(Number(p));
  if (!Number.isFinite(n)) return null;
  return `₪${n.toLocaleString("he-IL")}`;
}

