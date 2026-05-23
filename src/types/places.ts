// Give My Time — Place types (mirrors the places + place_reviews DB schema)

// =============================================================================
// Enums (match the PostgreSQL enum values exactly)
// =============================================================================

export type PlaceCategory =
  | "doctor"
  | "clinic"
  | "cafe"
  | "kids"
  | "sport"
  | "attraction"
  | "food"
  | "cosmetics";

export type NeighborhoodGivatayim =
  | "BOROCHOV"
  | "ARLOZOROV"
  | "GIVAT_RAMBAM"
  | "KIRYAT_YOSEF"
  | "SHEINKIN"
  | "KOZLOVSKY"
  | "HATEKUMA"
  | "BEN_GURION";

export type KosherStatus = "CERTIFIED" | "NOT_CERTIFIED" | "UNKNOWN";

// =============================================================================
// Attributes JSONB — per-category structured data
// Only present when place_category matches; all keys optional.
// =============================================================================

export interface KidsAttributes {
  ganmatch_id?: string;
  gan_category?: string;
  min_age_months?: number;
  max_age_months?: number;
  meal_type?: string;
  friday_schedule?: string;
  has_outdoor_space?: boolean;
  vacancy_status?: string;
  monthly_price_nis?: number;
  maon_symbol_code?: string;
}

export interface DoctorAttributes {
  specialty?: string; // e.g. "רופא משפחה", "עור", "ילדים"
}

export interface SportAttributes {
  specialty?: string; // e.g. "יוגה", "פילאטיס", "חדר כושר"
  gender_restriction?: "women_only" | "men_only" | null;
}

export interface AttractionAttributes {
  min_age_months?: number;
  max_age_months?: number;
  indoor_outdoor?: "indoor" | "outdoor" | "both";
}

export type PlaceAttributes =
  | KidsAttributes
  | DoctorAttributes
  | SportAttributes
  | AttractionAttributes
  | Record<string, unknown>;

// =============================================================================
// Place — the main entity returned by get_places_in_bbox RPC
// =============================================================================

export interface Place {
  id: string;
  name: string;
  place_category: PlaceCategory;
  address: string | null;
  neighborhood: NeighborhoodGivatayim | null;
  phone: string[] | null;
  website: string | null;
  hours: string | null;
  description: string | null;
  kosher: KosherStatus | null;
  price_range: 1 | 2 | 3 | null;
  hmo: string[] | null; // 'maccabi' | 'clalit' | 'meuhedet' | 'leumit'
  photos: string[];
  attributes: PlaceAttributes;
  avg_rating: number | null;
  rec_count: number;
  is_verified: boolean;
  source: "community" | "migrated_ganmatch";
  lat: number;
  lon: number;
}

// =============================================================================
// PlaceReview — one user's review of a place
// =============================================================================

export interface PlaceReview {
  id: string;
  user_id: string;
  place_id: string;
  rating: number;
  text: string | null;
  photos: string[];
  is_anonymous: boolean;
  allow_contact: boolean;
  reviewer_public_name: string | null;
  reviewer_public_email_masked: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Display helpers
// =============================================================================

// Categories shown in the UI. cafe / sport / attraction / food are hidden until data is ready.
// To re-enable a category, add it back here. All categories remain fully supported in DB/API/filters.
export const VISIBLE_CATEGORIES: PlaceCategory[] = ["kids", "doctor", "cosmetics"];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  doctor: "רופאים",
  clinic: "מרפאות",
  cafe: "קפה",
  kids: "גני ילדים",
  sport: "ספורט",
  attraction: "אטרקציות",
  food: "אוכל",
  cosmetics: "קוסמטיקה",
};

export const NEIGHBORHOOD_LABELS: Record<NeighborhoodGivatayim, string> = {
  BOROCHOV: "בורוכוב",
  ARLOZOROV: "ארלוזורוב",
  GIVAT_RAMBAM: "גבעת רמב\"ם",
  KIRYAT_YOSEF: "קריית יוסף",
  SHEINKIN: "שינקין",
  KOZLOVSKY: "קוזלובסקי",
  HATEKUMA: "התקומה",
  BEN_GURION: "בן גוריון",
};

export const HMO_LABELS: Record<string, string> = {
  maccabi: "מכבי",
  clalit: "כללית",
  meuhedet: "מאוחדת",
  leumit: "לאומית",
};

export const PRICE_RANGE_LABELS: Record<1 | 2 | 3, string> = {
  1: "זול",
  2: "בינוני",
  3: "יקר",
};

// Category color for map pins and UI chips — matches give-my-time mockup exactly
export const PLACE_CATEGORY_COLORS: Record<PlaceCategory, string> = {
  doctor:     "#1F5BB5", // civic blue
  clinic:     "#5B8DD9", // lighter blue
  cafe:       "#D86B7D", // rose-pink
  kids:       "#2EA86B", // green
  sport:      "#2196F3", // blue
  attraction: "#C8A24B", // gold
  food:       "#E59A2C", // amber
  cosmetics:  "#E0669A", // pink
};
