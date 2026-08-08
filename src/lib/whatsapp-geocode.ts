import "server-only";
import { serverEnv } from "@/lib/env/server";
import { checkApiUsage, UsageLimitExceededError } from "@/lib/api-usage";

// Israeli city names + approximate centers (lon, lat). Used two ways:
// 1. Detect whether a city is already named in the extracted address or raw message text.
// 2. Bias Mapbox's ranking toward the right area via `proximity`, instead of
//    concatenating a (possibly wrong) city string into the query text — see
//    geocodeHint's doc comment for why that approach broke.
// Centers are approximate on purpose — they're a ranking hint, not a hard
// filter, so exact precision doesn't matter.
export const CITY_CENTERS: Record<string, { lon: number; lat: number }> = {
  "גבעתיים": { lon: 34.8117, lat: 32.0702 },
  "רמת גן": { lon: 34.8107, lat: 32.0823 },
  "תל אביב": { lon: 34.7818, lat: 32.0853 },
  "ראשון לציון": { lon: 34.8044, lat: 31.9730 },
  "פתח תקווה": { lon: 34.8878, lat: 32.0840 },
  "פתח-תקווה": { lon: 34.8878, lat: 32.0840 },
  "בת ים": { lon: 34.7503, lat: 32.0171 },
  "חולון": { lon: 34.7792, lat: 32.0114 },
  "רמת השרון": { lon: 34.8394, lat: 32.1467 },
  "הרצליה": { lon: 34.8436, lat: 32.1624 },
  "כפר סבא": { lon: 34.9070, lat: 32.1750 },
  "רעננה": { lon: 34.8720, lat: 32.1848 },
  "נתניה": { lon: 34.8600, lat: 32.3215 },
  "רחובות": { lon: 34.8094, lat: 31.8928 },
  "ירושלים": { lon: 35.2137, lat: 31.7683 },
  "חיפה": { lon: 34.9896, lat: 32.7940 },
  "אשדוד": { lon: 34.6446, lat: 31.8044 },
  "אשקלון": { lon: 34.5715, lat: 31.6693 },
  "נס ציונה": { lon: 34.7975, lat: 31.9294 },
  "לוד": { lon: 34.8933, lat: 31.9514 },
  "רמלה": { lon: 34.8666, lat: 31.9285 },
  "הוד השרון": { lon: 34.8878, lat: 32.1499 },
  "קריית אונו": { lon: 34.8600, lat: 32.0623 },
  "אור יהודה": { lon: 34.8500, lat: 32.0295 },
  "בני ברק": { lon: 34.8322, lat: 32.0807 },
};

export const KNOWN_CITIES = Object.keys(CITY_CENTERS).filter(c => c !== "גבעתיים");

// Street-type words that can precede a city name inside a *street* name
// (e.g. "שדרות ירושלים" = Jerusalem Boulevard, a real street in Ramat Gan —
// not a mention of the city Jerusalem). A naive `text.includes(cityName)`
// check false-positives on these; see findCityTokenInText below.
const STREET_TYPE_WORDS = ["שדרות", "שד'", "רחוב", "רח'", "דרך", "סמטת", "סמטה", "כיכר", "שביל"];

// A single language's view of an extracted address. Separate fields
// (instead of one free-text hint string) is the fix for two related bugs
// found 2026-08-07 (see project_launch_readiness memory): a city name
// embedded in a street name ("שדרות ירושלים") no longer gets misread as the
// city, and a landmark phrase ("מול ביה"ס שמעוני") no longer gets sent to
// the geocoder as literal address text.
//
// `landmarks` is a list, not a single value — a message can reference more
// than one distinct nearby thing (e.g. "ליד הבנק, מול הפארק"), and each is
// an independent candidate query worth trying, not just one. (Also added
// 2026-08-07, same day — after the first version's single-landmark field
// couldn't correctly represent "the place's own name AND a separate real
// landmark both mentioned" without one clobbering the other.)
export interface ExtractedAddress {
  street: string | null;
  houseNumber: string | null;
  city: string | null;
  landmarks: string[];
}

// The Hebrew extraction is the source of truth (validated against the
// source text — see fieldLooksFabricated). `en` is a same-facts translation
// used only as a geocoding fallback: some Israeli streets/POIs are indexed
// by Mapbox mainly under their English spelling, and WhatsApp recommendation
// text sometimes names a business in English even mid-Hebrew-sentence.
// houseNumber is deliberately omitted from `en` — a digit doesn't need
// translation, so callers reuse `he.houseNumber` for both.
export interface BilingualExtractedAddress {
  he: ExtractedAddress;
  en: Omit<ExtractedAddress, "houseNumber">;
}

function isEmptyAddress(a: ExtractedAddress | Omit<ExtractedAddress, "houseNumber">): boolean {
  return !a.street && !("houseNumber" in a ? a.houseNumber : null) && !a.city && a.landmarks.length === 0;
}

function getMapboxToken(): string | null {
  return (
    (process.env.MAPBOX_ACCESS_TOKEN || "").trim() ||
    (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() ||
    null
  );
}

// Mapbox rejects a match below this relevance score (0-1, returned on every
// feature). Added 2026-08-07 after "קניון קומה 2" (mall floor 2) matched
// "קומה 2 6, תל אביב-יפו" (an unrelated, nonsense result) — the code
// previously took features[0] unconditionally and never looked at this
// field. Threshold picked conservatively; tune if it starts rejecting good
// matches or letting bad ones through — check the [mapboxSearch] log lines.
const MIN_RELEVANCE = 0.5;

// Same Mapbox Geocoding v5 setup already used by /api/geocode and
// /api/geocode/suggest (country=il), reusing the pattern that already works
// for the app's main address search, instead of the free-text Nominatim
// approach this file used before, which had no real way to bias results
// toward the right city (see geocodeHint below).
//
// Throws on a real request failure (bad status, network error, timeout, or
// missing token) — callers must not treat that the same as "genuinely no
// match" (same bug class as extractAddressFromText: a failure silently
// treated as "no result" previously caused rows to be permanently
// sentinel-marked as unresolvable — see project_launch_readiness memory,
// 2026-08-07 session).
// `knownCity`, when passed, hard-filters results by whether the city name
// literally appears in the match's place_name — not just a proximity
// ranking bias. Found 2026-08-07: "שמעוני" (from "ביה\"ס שמעוני") is a real
// street name that exists identically in five different cities (Tel Aviv,
// Ramat Gan, Holon, Rishon LeZion, Kfar Saba), all tied at relevance 1 for a
// bare one-word query — proximity alone can't disambiguate that, it only
// nudges ranking. But when the extraction already gave us a *validated*
// city (not the default גבעתיים fallback — see geocodeHint), we can filter
// candidates instead of just ranking them. Only used when knownCity is
// passed; omitting it preserves the original single-top-result behavior
// for cases with no confidently-known city.
async function mapboxSearch(
  query: string,
  proximity: { lon: number; lat: number },
  types: "address,poi" | "poi",
  language: "he" | "en",
  knownCity?: string,
): Promise<{ lat: number; lon: number } | null> {
  const log = (...args: unknown[]) => console.log("[mapboxSearch]", ...args);
  const token = getMapboxToken();
  if (!token) throw new Error("Missing Mapbox token (MAPBOX_ACCESS_TOKEN / NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN)");
  // Soft check, not a throw — Mapbox is one of several fallback tiers
  // (street queries also fall through to landmark queries; landmark
  // queries fall through to Nominatim/Google). Hitting budget here should
  // gracefully skip to the next tier, not abort the whole geocode attempt.
  const usage = await checkApiUsage("mapbox");
  if (!usage.allowed) {
    log(`skipping — ${usage.reason}`);
    return null;
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", language);
  url.searchParams.set("limit", knownCity ? "5" : "1");
  url.searchParams.set("types", types);
  url.searchParams.set("proximity", `${proximity.lon},${proximity.lat}`);

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (e: any) {
    log(`request failed for "${query}" (${language}):`, e?.message ?? String(e));
    throw new Error(`Mapbox request failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log(`non-OK status ${res.status} for "${query}" (${language}):`, body.slice(0, 300));
    throw new Error(`Mapbox geocode failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const features: any[] = Array.isArray(data?.features) ? data.features : [];
  const candidates = knownCity ? features : features.slice(0, 1);
  for (const feature of candidates) {
    const center = Array.isArray(feature?.center) ? feature.center : null;
    const lon = Number(center?.[0]);
    const lat = Number(center?.[1]);
    if (!isFinite(lon) || !isFinite(lat)) continue;
    const relevance = Number(feature?.relevance);
    if (isFinite(relevance) && relevance < MIN_RELEVANCE) {
      log(`rejecting low-relevance match for "${query}" (${language}): relevance=${relevance} (${feature?.place_name ?? ""})`);
      continue;
    }
    if (knownCity && !String(feature?.place_name ?? "").includes(knownCity)) {
      log(`skipping match for "${query}" (${language}) — not in known city "${knownCity}": ${feature?.place_name ?? ""}`);
      continue;
    }
    log(`match for "${query}" (${language}): ${lat},${lon} relevance=${relevance} (${feature?.place_name ?? ""})`);
    return { lat, lon };
  }
  log(`no match for "${query}" (${language})${knownCity ? ` in known city "${knownCity}"` : ""}`);
  return null;
}

// Try a list of query strings in order against Mapbox, returning the first
// clean match. Only throws if EVERY attempt failed with a real error (no
// informative signal at all) — a clean "no match" from any single attempt
// is trusted and returned as null, even if an earlier attempt errored,
// because a successful call proves Mapbox itself is reachable.
async function tryQueries(
  queries: string[],
  proximity: { lon: number; lat: number },
  types: "address,poi" | "poi",
  language: "he" | "en",
  knownCity?: string,
): Promise<{ lat: number; lon: number } | null> {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors: string[] = [];
  for (const q of nonEmpty) {
    try {
      const result = await mapboxSearch(q, proximity, types, language, knownCity);
      if (result) return result;
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`geocode failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

// Fallback geocoder for landmark/POI lookups ONLY, tried after Mapbox finds
// nothing. Added 2026-08-08: confirmed directly against both APIs that
// Mapbox's Geocoding v5 has zero record of "קאנטרי רמת גן" — in Hebrew or
// English, with or without type filters — while OpenStreetMap's own
// Nominatim has it as a real `leisure/sports_centre` (user found this by
// searching openstreetmap.org directly). Mapbox's POI index has real
// coverage gaps for small/local Israeli venues that OSM's raw data covers.
//
// Nominatim's usage policy caps public-instance use at 1 request/second and
// requires an identifying User-Agent — nominatimRateLimit() enforces the
// former process-wide; this path only runs as a fallback (Mapbox already
// found nothing for this landmark), so it fires rarely, not on every row.
//
// Class allowlist replaces Mapbox's `types=poi` — this is what stops the
// same school-vs-street mismatch bug (2026-08-07) from recurring through
// this new code path: a result classed "highway"/"place"/"boundary" (a
// street or area) is rejected even if it's a strong text match. The city
// hard-filter (checking knownCity against display_name) mirrors mapboxSearch
// for the same reason a soft proximity-only bias wasn't enough there.
const NOMINATIM_USER_AGENT = "GanMatch-WhatsAppGeocode/1.0";
const NOMINATIM_ALLOWED_CLASSES = new Set(["leisure", "amenity", "shop", "tourism", "healthcare", "office", "craft"]);
let lastNominatimCallAt = 0;

async function nominatimRateLimit(): Promise<void> {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCallAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCallAt = Date.now();
}

async function nominatimSearch(query: string, knownCity: string): Promise<{ lat: number; lon: number } | null> {
  const log = (...args: unknown[]) => console.log("[nominatimSearch]", ...args);
  await nominatimRateLimit();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "il");
  url.searchParams.set("limit", "5");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    log(`request failed for "${query}":`, e?.message ?? String(e));
    throw new Error(`Nominatim request failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log(`non-OK status ${res.status} for "${query}":`, body.slice(0, 300));
    throw new Error(`Nominatim geocode failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const results: any[] = await res.json();
  for (const result of Array.isArray(results) ? results : []) {
    if (!NOMINATIM_ALLOWED_CLASSES.has(result?.class)) {
      log(`skipping "${query}" match with disallowed class "${result?.class}": ${result?.display_name ?? ""}`);
      continue;
    }
    if (!String(result?.display_name ?? "").includes(knownCity)) {
      log(`skipping "${query}" match not in known city "${knownCity}": ${result?.display_name ?? ""}`);
      continue;
    }
    const lat = Number(result?.lat);
    const lon = Number(result?.lon);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    log(`match for "${query}": ${lat},${lon} (${result?.display_name ?? ""})`);
    return { lat, lon };
  }
  log(`no match for "${query}" in known city "${knownCity}"`);
  return null;
}

// Same all-or-nothing error semantics as tryQueries — a genuine Nominatim
// failure must not be treated as "no address found" either.
async function tryNominatimQueries(queries: string[], knownCity: string): Promise<{ lat: number; lon: number } | null> {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors: string[] = [];
  for (const q of nonEmpty) {
    try {
      const result = await nominatimSearch(q, knownCity);
      if (result) return result;
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`Nominatim fallback failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

// Third and final landmark/POI fallback, tried only when both Mapbox AND
// Nominatim found nothing. Real per-request cost (unlike the other two) —
// gated by checkApiUsage(), which enforces the dollar budget configured for
// "google_places" in config/api-usage-limits.json.
// FieldMask deliberately requests only location/displayName/formattedAddress/types
// (Pro-tier fields) — adding photos/rating/hours would push into the pricier
// Enterprise SKU tier for no benefit here.
//
// GOOGLE_DISALLOWED_TYPES is a blocklist, not an allowlist, because Google's
// POI type vocabulary is far too large to enumerate exhaustively — same
// category-safety goal as Mapbox's types=poi / Nominatim's class allowlist
// (never accept a street/administrative-area result for a landmark query),
// just inverted for practicality on Google's data shape.
const GOOGLE_DISALLOWED_TYPES = new Set([
  "route", "street_address", "street_number", "locality", "sublocality",
  "sublocality_level_1", "political", "administrative_area_level_1",
  "administrative_area_level_2", "administrative_area_level_3", "country",
  "postal_code", "postal_town", "plus_code", "premise", "subpremise",
  "neighborhood", "natural_feature",
]);

async function googlePlacesSearch(query: string, knownCity: string): Promise<{ lat: number; lon: number } | null> {
  const log = (...args: unknown[]) => console.log("[googlePlacesSearch]", ...args);
  // Soft check — Google is the last fallback tier; being disabled or over
  // budget should just mean "nothing from this tier," not an error for the
  // whole row. (As of 2026-08-08 this is disabled in
  // config/api-usage-limits.json — see that file's notes.) MUST run before
  // the API-key check below: production never had GOOGLE_PLACES_API_KEY set
  // (only .env.local did), and checking the key first meant every call threw
  // "Missing GOOGLE_PLACES_API_KEY" as an error instead of cleanly skipping
  // via the disabled flag — surfaced as 10 errored rows in a real batch run,
  // 2026-08-08.
  const usage = await checkApiUsage("google_places");
  if (!usage.allowed) {
    log(`skipping — ${usage.reason}`);
    return null;
  }
  const apiKey = serverEnv.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  let res: Response;
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location,places.displayName,places.formattedAddress,places.types",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "he", regionCode: "IL" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    log(`request failed for "${query}":`, e?.message ?? String(e));
    throw new Error(`Google Places request failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log(`non-OK status ${res.status} for "${query}":`, body.slice(0, 300));
    throw new Error(`Google Places geocode failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const places: any[] = Array.isArray(data?.places) ? data.places : [];
  for (const place of places) {
    const types: string[] = Array.isArray(place?.types) ? place.types : [];
    if (types.length > 0 && GOOGLE_DISALLOWED_TYPES.has(types[0])) {
      log(`skipping "${query}" match with disallowed primary type "${types[0]}": ${place?.formattedAddress ?? ""}`);
      continue;
    }
    const address = String(place?.formattedAddress ?? "");
    if (!address.includes(knownCity)) {
      log(`skipping "${query}" match not in known city "${knownCity}": ${address}`);
      continue;
    }
    const lat = Number(place?.location?.latitude);
    const lon = Number(place?.location?.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    log(`match for "${query}": ${lat},${lon} (${address})`);
    return { lat, lon };
  }
  log(`no match for "${query}" in known city "${knownCity}"`);
  return null;
}

async function tryGooglePlacesQueries(queries: string[], knownCity: string): Promise<{ lat: number; lon: number } | null> {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors: string[] = [];
  for (const q of nonEmpty) {
    try {
      const result = await googlePlacesSearch(q, knownCity);
      if (result) return result;
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`Google Places fallback failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

// Find a city name in raw text, but skip a match that's actually the second
// word of a street name (e.g. "שדרות ירושלים" = Jerusalem Boulevard, not a
// mention of the city Jerusalem — the bug that sent בת חן ספרית's pin to
// Holon instead of Ramat Gan on 2026-08-07). Prefers the longest city name
// so "רמת גן" doesn't get shadowed by nothing shorter matching first.
function findCityTokenInText(text: string): string | undefined {
  const candidates = [...KNOWN_CITIES, "גבעתיים"].sort((a, b) => b.length - a.length);
  for (const city of candidates) {
    const idx = text.indexOf(city);
    if (idx === -1) continue;
    const before = text.slice(0, idx).trim();
    const lastWord = before.split(/\s+/).pop() ?? "";
    if (STREET_TYPE_WORDS.includes(lastWord)) continue;
    return city;
  }
  return undefined;
}

// Strip common proximity/preposition phrases (Hebrew and English) from a
// landmark phrase before geocoding it as a POI. The extraction prompt
// already asks the LLM not to include these, but this is a cheap defensive
// second layer — a landmark search for "מול ביה"ס שמעוני" should really
// just search "ביה"ס שמעוני".
function stripLandmarkPrepositions(landmark: string): string {
  return landmark
    .replace(/^(מול|סמוך ל|ליד|פינת|קרוב ל|בקרבת)\s+/, "")
    .replace(/^(across from|near|next to|corner of|close to)\s+/i, "")
    .trim();
}

// Expand common Hebrew institution abbreviations before querying Mapbox —
// found 2026-08-07 that a landmark like "ביה\"ס שמעוני" (the abbreviated,
// gershayim-punctuated form the LLM naturally extracts) got no Mapbox match
// at all, while the real school is presumably indexed under its spelled-out
// name "בית ספר שמעוני". Tries both forms (see geocodeSingleLanguage) since
// either could be how a given POI is actually named in Mapbox's data.
function expandInstitutionAbbreviations(text: string): string {
  return text
    .replace(/ביה"ס|בי"ס/g, "בית ספר")
    .replace(/ביה"ח|בי"ח/g, "בית חולים")
    .replace(/גני"ל/g, "גן ילדים");
}

// Institution/category words that can prefix a landmark's actual proper
// name. Stripped to get the "bare" name — see its use below: Mapbox scores
// relevance by the fraction of query tokens that matched, so a 3-token
// query like "בית ספר שמעוני" against a feature only named "שמעוני" scores
// ~0.43 (rejected by MIN_RELEVANCE) even though "שמעוני" itself would score
// 1.0 alone. The institution word is metadata we attached for disambiguation
// — it's usually not literally part of how the place is named in Mapbox.
const INSTITUTION_WORDS = ["בית ספר", "ביה\"ס", "בי\"ס", "בית חולים", "ביה\"ח", "בי\"ח", "גן ילדים", "גני\"ל", "בית מרקחת", "בנק", "קניון", "בריכה", "פארק", "בית קפה", "מסעדה"];

function stripInstitutionWords(text: string): string {
  for (const word of INSTITUTION_WORDS) {
    if (text.startsWith(word + " ")) return text.slice(word.length).trim();
  }
  return text;
}

async function geocodeSingleLanguage(
  placeName: string,
  extracted: ExtractedAddress | Omit<ExtractedAddress, "houseNumber">,
  houseNumber: string | null,
  proximity: { lon: number; lat: number },
  language: "he" | "en",
  knownCity?: string,
): Promise<{ lat: number; lon: number } | null> {
  // Hard-filters to the detected city if one exists, otherwise defaults to
  // גבעתיים (the app's home city) — "look for it in Givatayim, unless the
  // text says another city" — rather than only proximity-biasing toward it
  // as `proximity` already does. Applied to street queries too as of
  // 2026-08-08: a real batch run found "ארלוזורב" (Arlozorov — a real
  // street in Givatayim, extracted with no city stated) confidently matched
  // an unrelated same-named street in Tel Aviv instead, because street
  // queries only had proximity bias, never this hard filter. Same failure
  // shape as the earlier landmark bugs — a common street name isn't safe to
  // resolve on relevance/proximity alone when nothing pins down the city.
  const effectiveCity = knownCity ?? "גבעתיים";

  const streetQuery = [extracted.street, houseNumber].filter(Boolean).join(" ").trim();
  if (streetQuery) {
    const result = await tryQueries([streetQuery, `${placeName} ${streetQuery}`], proximity, "address,poi", language, effectiveCity);
    if (result) return result;
  }
  // Landmarks are institutions/venues (school, mall, business) — they only
  // ever get searched as POIs, never widened to address/street type. An
  // earlier version of this function DID widen to "address,poi" once a city
  // was known, reasoning that a same-named street was a safe fallback for
  // an unindexed small institution. That was wrong on its own terms, not
  // just risky: for "ביה\"ס שמעוני" (Shimoni School, actually at רביבים 1,
  // גבעתיים), it hard-filtered to Ramat Gan (a city literally typed into
  // this test case) and confidently matched an unrelated street called
  // "שמעוני" there — a real place, in the right city, that had nothing to
  // do with the school. A same-named street is a coincidence, not a
  // fallback location for an institution; city-correctness doesn't fix a
  // category mismatch (school ≠ street). Caught by the user, 2026-08-07.
  for (const landmark of extracted.landmarks) {
    const stripped = stripLandmarkPrepositions(landmark);
    if (!stripped) continue;
    const expanded = expandInstitutionAbbreviations(stripped);
    const bare = stripInstitutionWords(stripped);
    const variants = Array.from(new Set([stripped, expanded, bare].filter(Boolean)));
    // Some venues' actual names incorporate the city ("קאנטרי רמת גן" is the
    // club's own name, not "קאנטרי" + separately "the city Ramat Gan").
    // Confirmed directly against Nominatim, 2026-08-08: the bare word
    // "קאנטרי" alone never surfaces this real venue in its top 5 results,
    // only the full "קאנטרי רמת גן" does. Only appends the REAL detected
    // city (`knownCity`, not the גבעתיים default) — appending an unproven
    // guess would risk exactly the free-text-concatenation failure mode
    // Bug B was about. Still subject to the same city hard-filter after,
    // so a coincidental cross-city match from this extra text is no less
    // safe than any other query variant here.
    const withCity = knownCity && !variants.some(v => v.includes(knownCity))
      ? variants.map(v => `${v} ${knownCity}`)
      : [];
    const allVariants = [...variants, ...withCity];
    for (const variant of allVariants) {
      const result = await tryQueries([variant, `${placeName} ${variant}`], proximity, "poi", language, effectiveCity);
      if (result) return result;
    }
    // Mapbox's POI index has confirmed gaps for small/local Israeli venues
    // (see nominatimSearch's comment) — only tried once Mapbox found
    // nothing for this landmark, with the same city + POI-only rules.
    const nominatimResult = await tryNominatimQueries(allVariants, effectiveCity);
    if (nominatimResult) return nominatimResult;
    const googleResult = await tryGooglePlacesQueries(allVariants, effectiveCity);
    if (googleResult) return googleResult;
  }
  return null;
}

// Geocode a structured, bilingual extracted address. Returns null if
// geocoding genuinely finds nothing.
//
// Tries the Hebrew fields first, then falls back to the English fields —
// added 2026-08-07 because some streets/POIs are indexed by Mapbox mainly
// under one script, and the source WhatsApp text can name a place in either
// language. City detection prefers the extracted `he.city` field (already
// fabrication-checked by the caller) and only falls back to scanning the
// raw message text — with the street-name-collision guard above — when the
// LLM didn't return one. The detected city only sets Mapbox's `proximity`
// ranking bias — it is never concatenated into the query text (an earlier
// version did this and matched a same-named street in the wrong city
// regardless of which city string was appended, because free-text search
// doesn't hard-filter by a text token).
//
// Last resort: try the reviewed place's OWN name as a POI query. Found
// 2026-08-07 that "קאנטרי רמת גן" (a real, findable venue — confirmed on
// OpenStreetMap) never got tried at all, because the message named no
// separate street or landmark (its own name got filtered out of `landmarks`
// as a self-reference, correctly — see extractAddressFromText — but nothing
// took its place as a search candidate). `placeName` comes from the
// human-curated staging row, not LLM output, so it needs no fabrication
// check; the relevance floor in mapboxSearch still guards against a wrong
// same-named match elsewhere for generic/common business names.
export async function geocodeHint(
  placeName: string,
  extracted: BilingualExtractedAddress,
  contextText: string = "",
): Promise<{ lat: number; lon: number } | null> {
  const { he, en } = extracted;

  const cityFromField = he.city && CITY_CENTERS[he.city] ? he.city : undefined;
  const cityFromContext = !cityFromField ? findCityTokenInText(contextText) : undefined;
  const detectedCity = cityFromField ?? cityFromContext;
  const proximity = detectedCity ? CITY_CENTERS[detectedCity] : CITY_CENTERS["גבעתיים"];
  console.log(
    "[geocodeHint]",
    cityFromField ? `city "${cityFromField}" from extraction` :
    cityFromContext ? `city missing from extraction — biasing toward "${cityFromContext}" found in raw text` :
    `no city detected — biasing toward גבעתיים (default, may still be wrong)`,
  );

  const heResult = await geocodeSingleLanguage(placeName, he, he.houseNumber, proximity, "he", detectedCity);
  if (heResult) return heResult;

  const enResult = await geocodeSingleLanguage(placeName, en, he.houseNumber, proximity, "en", detectedCity);
  if (enResult) return enResult;

  const placeNameCity = detectedCity ?? "גבעתיים";
  const mapboxResult = await tryQueries([placeName], proximity, "poi", "he", placeNameCity);
  if (mapboxResult) return mapboxResult;
  const nominatimResult = await tryNominatimQueries([placeName], placeNameCity);
  if (nominatimResult) return nominatimResult;
  return await tryGooglePlacesQueries([placeName], placeNameCity);
}

// Hebrew prepositions that commonly attach to the front of a word without a
// space ("בדיזנגוף" = "at/on Dizengoff"). Used to tolerate the LLM's own
// normalization (it's asked to strip these) when checking a field against
// the source text — see fieldLooksFabricated below.
const HEBREW_PREFIXES = ["ב", "ל", "מ", "ה", "ו", "כ", "ש"];

function tokenInSource(token: string, sourceText: string): boolean {
  if (/^\d+$/.test(token)) return sourceText.includes(token);
  if (sourceText.includes(token)) return true;
  return HEBREW_PREFIXES.some(p => sourceText.includes(p + token));
}

// Reject a field if any of its words don't appear in the source text. Only
// applied to the Hebrew extraction — the English one is validated
// structurally instead (see extractAddressFromText: an English field can
// only be non-null where the corresponding, already-validated Hebrew field
// is non-null). Confirmed on 2026-08-07: gpt-4o-mini invented house number
// "94" for text that only said "בכצנלסון" (no number at all), and invented
// a whole unrelated address for a message that never mentioned any
// street/number/city. Checking every field individually (not just digits)
// closes the gap where a fabricated *city name* with no number would have
// slipped through the old single-string guard.
function fieldLooksFabricated(value: string | null, sourceText: string): boolean {
  if (!value) return false;
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.some(t => !tokenInSource(t, sourceText));
}

function stripJsonFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function cleanStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of v) {
    const s = cleanStr(item);
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  }
  return result;
}

// Ask the LLM to extract a structured, bilingual address from a WhatsApp
// message. Returns null if nothing usable was found (including when every
// extracted field got rejected as fabricated). Throws (does NOT return
// null) on a request/API failure — callers must not treat a failed call the
// same as "no address mentioned": doing so previously caused an OpenAI
// rate-limit burst to silently mark real addresses as "not found" and
// permanently skip them (discovered 2026-08-07 — see
// project_launch_readiness memory).
export async function extractAddressFromText(
  text: string,
  placeName: string,
  openaiKey: string,
): Promise<BilingualExtractedAddress | null> {
  const prompt = `המלצה מוואטסאפ על "${placeName}":
${text}

חלץ מהטקסט מיקום, אם קיים, והחזר JSON עם שני אובייקטים "he" ו-"en":

באובייקט "he" — המיקום כפי שהוא כתוב בטקסט (בעברית), עם השדות:
- street: שם הרחוב, בלי מילת יחס דבוקה (אם כתוב "בדיזנגוף" תחזיר "דיזנגוף"). street הוא רק שם רחוב אמיתי (מופיע אחרי "רחוב"/"רח'"/"שדרות"/"דרך", או בתבנית "שם + מספר בית"). אם השם מופיע אחרי מילה שמתארת מקום/מוסד (בית ספר/ביה"ס/קניון/בית חולים/בריכה/פארק/גן ציבורי/מסעדה/בנק וכו') — זה landmark, לא street, גם אם השם עצמו יכול להיראות כמו שם רחוב (למשל "ביה\"ס שמעוני" הוא landmark ולא street="שמעוני").
- houseNumber: מספר הבית, כמחרוזת
- city: שם העיר
- landmarks: מערך (רשימה) של נקודת ציון אחת או יותר (בית ספר, קניון, עסק אחר, רחוב סמוך) שמוזכרות כהתייחסות למיקום, בלי מילות יחס כמו "מול"/"ליד"/"סמוך ל" (אם כתוב "מול ביה\"ס שמעוני" תחזיר ["ביה\"ס שמעוני"]). גם נקודת ציון כללית בלי שם ספציפי, אם היא מתארת את המיקום של "${placeName}" עצמו (למשל "בקניון" בלי שם קניון, "בבניין המשרדים"), עדיין שווה לכלול (למשל "קניון") — זה עדיין מצמצם את החיפוש, גם בלי שם מדויק. אם אין שום נקודת ציון, החזר מערך ריק []. הטקסט יכול להזכיר יותר מנקודת ציון אחת — כלול את כולן. אף איבר לא יכול להיות "${placeName}" עצמו (זה השם של העסק שעליו כתובה ההמלצה) — אם הטקסט מזכיר את "${placeName}" בעצמו (למשל עם מילת יחס דבוקה), אל תכלול אותו כ-landmark; אם מוזכר גם מקום אחר נפרד, כלול רק אותו.

באובייקט "en" — תרגום/תעתיק לאנגלית של אותם השדות (למשל "דיזנגוף" -> "Dizengoff", "רמת גן" -> "Ramat Gan"), עם השדות: street, city, landmarks (מערך, בלי houseNumber). כל שדה ב-en שמקביל לשדה null/מערך ריק ב-he חייב להיות null/מערך ריק גם הוא — אל תוסיף ב-en שום מידע שלא קיים כבר ב-he.

אסור בהחלט להמציא, לנחש או להוסיף פרטים שלא מופיעים במפורש בטקסט למעלה — לא מספר בית, לא שם רחוב, לא עיר, ולא נקודת ציון. אם שדה מסוים לא מוזכר בטקסט — השאר אותו null בשני האובייקטים, אל תמלא אותו מהידע הכללי שלך.
אם אין שום ציון מיקום בטקסט, החזר את כל השדות כ-null בשני האובייקטים.
החזר רק JSON תקין, ללא הסברים נוספים.`;

  // Hard check — extraction has no fallback tier (unlike Mapbox/Google),
  // so a blocked call must stop the row from proceeding, not silently
  // continue as if nothing was found.
  const usage = await checkApiUsage("openai");
  if (!usage.allowed) throw new UsageLimitExceededError(usage.reason ?? "openai usage blocked");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI address extraction failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!raw) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    console.log(`[extractAddressFromText] failed to parse LLM JSON output: ${raw.slice(0, 200)}`);
    return null;
  }

  const he: ExtractedAddress = {
    street: cleanStr(parsed?.he?.street),
    houseNumber: cleanStr(parsed?.he?.houseNumber),
    city: cleanStr(parsed?.he?.city),
    landmarks: cleanStrArray(parsed?.he?.landmarks),
  };
  for (const field of ["street", "houseNumber", "city"] as const) {
    if (fieldLooksFabricated(he[field], text)) {
      console.log(`[extractAddressFromText] rejecting likely-fabricated he.${field} "${he[field]}" — not found in source text`);
      he[field] = null;
    }
  }
  he.landmarks = he.landmarks.filter((landmark) => {
    if (landmark === placeName.trim()) {
      console.log(`[extractAddressFromText] dropping landmark "${landmark}" — same as the reviewed place's own name`);
      return false;
    }
    if (fieldLooksFabricated(landmark, text)) {
      console.log(`[extractAddressFromText] rejecting likely-fabricated landmark "${landmark}" — not found in source text`);
      return false;
    }
    return true;
  });

  const en: Omit<ExtractedAddress, "houseNumber"> = {
    street: he.street ? cleanStr(parsed?.en?.street) : null,
    city: he.city ? cleanStr(parsed?.en?.city) : null,
    landmarks: he.landmarks.length > 0 ? cleanStrArray(parsed?.en?.landmarks) : [],
  };

  if (isEmptyAddress(he) && isEmptyAddress(en)) return null;
  return { he, en };
}

// `whatsapp_import_staging.address_hint` is a plain text column (no
// migration needed) — these two functions serialize the structured,
// bilingual extraction to/from it, so a cached hint survives a re-run
// without losing its structure (and re-triggering the substring-based city
// bugs a flat string caused before 2026-08-07). parseStoredHint()
// gracefully degrades a pre-existing plain-string hint (from before this
// rewrite) into `{ he: { street: <the old string> } }` so old rows don't
// error out — everything else about the row will simply re-extract.
export function serializeHint(extracted: BilingualExtractedAddress): string {
  return JSON.stringify(extracted);
}

export function parseStoredHint(raw: string | null | undefined): BilingualExtractedAddress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.he) {
      return {
        he: {
          street: cleanStr(parsed.he.street),
          houseNumber: cleanStr(parsed.he.houseNumber),
          city: cleanStr(parsed.he.city),
          landmarks: cleanStrArray(parsed.he.landmarks),
        },
        en: {
          street: cleanStr(parsed.en?.street),
          city: cleanStr(parsed.en?.city),
          landmarks: cleanStrArray(parsed.en?.landmarks),
        },
      };
    }
  } catch {
    // Not JSON — a legacy plain-string hint from before this rewrite.
  }
  return { he: { street: raw, houseNumber: null, city: null, landmarks: [] }, en: { street: null, city: null, landmarks: [] } };
}

// Human-readable one-line summary for logs and the triage admin UI —
// callers should never display the raw JSON from serializeHint().
export function formatHintForDisplay(extracted: BilingualExtractedAddress): string {
  const { he } = extracted;
  const parts: string[] = [];
  if (he.street) parts.push([he.street, he.houseNumber].filter(Boolean).join(" "));
  if (he.landmarks.length > 0) parts.push(he.landmarks.join(" / "));
  if (he.city) parts.push(he.city);
  return parts.join(", ") || "—";
}
