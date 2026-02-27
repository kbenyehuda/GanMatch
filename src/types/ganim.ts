export type GanType = "Private" | "Supervised" | "Maon";
export type LicenseStatus = "Permanent" | "Temporary" | "Under Observation";
export type WaitlistStatus = "Available" | "Limited" | "Full";

export interface GanMetadata {
  phone?: string[];
  age_groups?: string[];
  hours?: string;
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
  lat: number;
  lon: number;
}

export interface Review {
  id: string;
  user_id: string;
  gan_id: string;
  rating: number;
  pros_text: string | null;
  cons_text: string | null;
  advice_to_parents_text: string | null;
  enrollment_year: number | null;
  created_at: string;
}
