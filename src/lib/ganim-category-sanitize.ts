/**
 * Keeps category-specific columns consistent with `ganim_v2_category_subfields_check`
 * (see supabase migrations, e.g. 20260328000000_v3_gan_category_tzaharon.sql).
 *
 * Postgres UPDATE only touches listed columns — changing `category` without clearing
 * stale `municipal_grade` / `mishpachton_affiliation` / etc. violates the check.
 */
export function sanitizeGanimCategorySubfields(
  payload: Record<string, unknown>,
  category: string | null | undefined
): void {
  const cat =
    category != null && String(category).trim() !== "" ? String(category).trim() : "UNSPECIFIED";

  const allowsMaonSymbol =
    cat === "MAON_SYMBOL" || cat === "MISHPACHTON" || cat === "TZAHARON_MUNICIPAL";
  if (!allowsMaonSymbol) {
    payload.maon_symbol_code = null;
  }

  if (cat !== "PRIVATE_GAN") {
    payload.private_supervision = null;
  }
  if (cat !== "MISHPACHTON") {
    payload.mishpachton_affiliation = null;
  }
  if (cat !== "MUNICIPAL_GAN") {
    payload.municipal_grade = null;
  }
}
