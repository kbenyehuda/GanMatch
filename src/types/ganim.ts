export type GanCategory =
  | "UNSPECIFIED"
  | "MAON_SYMBOL"
  | "PRIVATE_GAN"
  | "MISHPACHTON"
  | "MUNICIPAL_GAN";

export type PrivateSupervisionStatus = "UNKNOWN" | "SUPERVISED" | "NOT_SUPERVISED";
export type MishpachtonAffiliation = "UNKNOWN" | "PRIVATE" | "TAMAT";
export type MunicipalGrade = "UNKNOWN" | "TTAH" | "TAH" | "HOVA";
export type WaitlistStatus = "Available" | "Limited" | "Full";

export interface GanMetadata {
  phone?: string[];
  age_groups?: string[];
  hours?: string;
  /**
   * Extra fields that can be provided by users for unverified ganim.
   * We keep these in metadata so we don't have to expand the core gov schema.
   */
  suggested_type?: string;
  pikuach_ironi?: boolean | null;
  cctv_access?: "none" | "exceptional" | "online" | null;
  [key: string]: unknown;
}

export interface Gan {
  id: string;
  name_he: string;
  name_en: string | null;
  address: string | null;
  city: string | null;
  website_url?: string | null;
  category: GanCategory;
  maon_symbol_code?: string | null;
  private_supervision?: PrivateSupervisionStatus | null;
  mishpachton_affiliation?: MishpachtonAffiliation | null;
  municipal_grade?: MunicipalGrade | null;
  monthly_price_nis?: number | null;
  min_age_months?: number | null;
  max_age_months?: number | null;
  price_notes?: string | null;
  has_cctv: boolean;
  cctv_streamed_online?: boolean | null;
  metadata: GanMetadata;
  is_verified: boolean;
  avg_rating: number | null;
  avg_cleanliness?: number | null;
  avg_staff?: number | null;
  avg_communication?: number | null;
  avg_food?: number | null;
  avg_location?: number | null;
  recommendation_count: number;
  lat: number;
  lon: number;
}

export interface Review {
  id: string;
  user_id: string;
  gan_id: string;
  rating: number;
  is_anonymous?: boolean;
  cleanliness_rating?: number | null;
  staff_rating?: number | null;
  communication_rating?: number | null;
  food_rating?: number | null;
  location_rating?: number | null;
  pros_text: string | null;
  cons_text: string | null;
  advice_to_parents_text: string | null;
  enrollment_year: number | null;
  created_at: string;
}
