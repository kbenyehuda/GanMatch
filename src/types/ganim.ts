export type GanType = "Private" | "Supervised" | "Maon";
export type LicenseStatus = "Permanent" | "Temporary" | "Under Observation";
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
  type: GanType;
  license_status: LicenseStatus;
  has_cctv: boolean;
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
