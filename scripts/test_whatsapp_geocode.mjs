// Local, no-deploy test harness for the WhatsApp address-extraction +
// geocoding pipeline (src/lib/whatsapp-geocode.ts). Run with:
//
//   node scripts/test_whatsapp_geocode.mjs
//
// Reads .env.local for OPENAI_API_KEY / MAPBOX_ACCESS_TOKEN / GOOGLE_PLACES_API_KEY
// so you can catch prompt/geocoding regressions before clicking through the
// deployed admin UI (each of those runs costs real OpenAI usage and takes
// several minutes). Note: this script does NOT enforce the monthly usage
// caps the real pipeline does (src/lib/api-usage.ts) — it has no Supabase
// service-role credentials wired up, and a handful of manual test runs
// isn't the runaway-batch scenario those caps exist for. Don't rely on this
// script alone to know whether a cap has been hit in production. It DOES
// respect each provider's `enabled` flag in config/api-usage-limits.json
// (skips a disabled provider instead of hitting a known-broken endpoint).
//
// This intentionally duplicates the core logic of src/lib/whatsapp-geocode.ts
// rather than importing it directly (that file is TypeScript with a
// Next.js-only "server-only" import, not easily runnable standalone). Keep
// this in sync by hand if you change the real extraction prompt, the
// fabrication guard, or the geocoding strategy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = join(__dirname, "..", ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function isProviderEnabled(provider) {
  try {
    const p = join(__dirname, "..", "config", "api-usage-limits.json");
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return raw?.[provider]?.enabled !== false;
  } catch {
    return true;
  }
}

// --- mirrors src/lib/whatsapp-geocode.ts ---

const CITY_CENTERS = {
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
const KNOWN_CITIES = Object.keys(CITY_CENTERS).filter(c => c !== "גבעתיים");
const STREET_TYPE_WORDS = ["שדרות", "שד'", "רחוב", "רח'", "דרך", "סמטת", "סמטה", "כיכר", "שביל"];
const MIN_RELEVANCE = 0.5;

function getMapboxToken() {
  return (process.env.MAPBOX_ACCESS_TOKEN || "").trim() || (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() || null;
}

async function mapboxSearch(query, proximity, types, language, knownCity) {
  const token = getMapboxToken();
  if (!token) throw new Error("Missing Mapbox token");
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", language);
  url.searchParams.set("limit", knownCity ? "5" : "1");
  url.searchParams.set("types", types);
  url.searchParams.set("proximity", `${proximity.lon},${proximity.lat}`);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Mapbox geocode failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const features = data?.features ?? [];
  const candidates = knownCity ? features : features.slice(0, 1);
  for (const feature of candidates) {
    const center = Array.isArray(feature?.center) ? feature.center : null;
    const lon = Number(center?.[0]), lat = Number(center?.[1]);
    if (!isFinite(lon) || !isFinite(lat)) continue;
    const relevance = Number(feature?.relevance);
    if (isFinite(relevance) && relevance < MIN_RELEVANCE) {
      console.log(`  [mapboxSearch] rejecting low-relevance match for "${query}" (${language}): relevance=${relevance} (${feature?.place_name})`);
      continue;
    }
    if (knownCity && !String(feature?.place_name ?? "").includes(knownCity)) {
      console.log(`  [mapboxSearch] skipping match for "${query}" (${language}) — not in known city "${knownCity}": ${feature?.place_name}`);
      continue;
    }
    return { lat, lon, place_name: feature?.place_name, relevance };
  }
  return null;
}

async function tryQueries(queries, proximity, types, language, knownCity) {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors = [];
  for (const q of nonEmpty) {
    try {
      const result = await mapboxSearch(q, proximity, types, language, knownCity);
      if (result) return result;
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`geocode failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

const NOMINATIM_USER_AGENT = "GanMatch-WhatsAppGeocode/1.0";
const NOMINATIM_ALLOWED_CLASSES = new Set(["leisure", "amenity", "shop", "tourism", "healthcare", "office", "craft"]);
let lastNominatimCallAt = 0;

async function nominatimRateLimit() {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCallAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCallAt = Date.now();
}

async function nominatimSearch(query, knownCity) {
  await nominatimRateLimit();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "il");
  url.searchParams.set("limit", "5");
  const res = await fetch(url.toString(), { headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim geocode failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const results = await res.json();
  for (const result of Array.isArray(results) ? results : []) {
    if (!NOMINATIM_ALLOWED_CLASSES.has(result?.class)) {
      console.log(`  [nominatimSearch] skipping "${query}" match with disallowed class "${result?.class}": ${result?.display_name}`);
      continue;
    }
    if (!String(result?.display_name ?? "").includes(knownCity)) {
      console.log(`  [nominatimSearch] skipping "${query}" match not in known city "${knownCity}": ${result?.display_name}`);
      continue;
    }
    const lat = Number(result?.lat), lon = Number(result?.lon);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    return { lat, lon, place_name: result?.display_name, relevance: "n/a (nominatim)" };
  }
  return null;
}

async function tryNominatimQueries(queries, knownCity) {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors = [];
  for (const q of nonEmpty) {
    try {
      const result = await nominatimSearch(q, knownCity);
      if (result) return result;
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`Nominatim fallback failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

function getGooglePlacesKey() {
  return (process.env.GOOGLE_PLACES_API_KEY || "").trim() || null;
}

const GOOGLE_DISALLOWED_TYPES = new Set([
  "route", "street_address", "street_number", "locality", "sublocality",
  "sublocality_level_1", "political", "administrative_area_level_1",
  "administrative_area_level_2", "administrative_area_level_3", "country",
  "postal_code", "postal_town", "plus_code", "premise", "subpremise",
  "neighborhood", "natural_feature",
]);

async function googlePlacesSearch(query, knownCity) {
  if (!isProviderEnabled("google_places")) {
    console.log(`  [googlePlacesSearch] skipping "${query}" — disabled in config/api-usage-limits.json`);
    return null;
  }
  const apiKey = getGooglePlacesKey();
  if (!apiKey) throw new Error("Missing GOOGLE_PLACES_API_KEY");
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.location,places.displayName,places.formattedAddress,places.types",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "he", regionCode: "IL" }),
  });
  if (!res.ok) throw new Error(`Google Places geocode failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  for (const place of places) {
    const types = Array.isArray(place?.types) ? place.types : [];
    if (types.length > 0 && GOOGLE_DISALLOWED_TYPES.has(types[0])) {
      console.log(`  [googlePlacesSearch] skipping "${query}" match with disallowed primary type "${types[0]}": ${place?.formattedAddress}`);
      continue;
    }
    const address = String(place?.formattedAddress ?? "");
    if (!address.includes(knownCity)) {
      console.log(`  [googlePlacesSearch] skipping "${query}" match not in known city "${knownCity}": ${address}`);
      continue;
    }
    const lat = Number(place?.location?.latitude), lon = Number(place?.location?.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    return { lat, lon, place_name: address, relevance: "n/a (google)" };
  }
  return null;
}

async function tryGooglePlacesQueries(queries, knownCity) {
  const nonEmpty = queries.map(q => q.trim()).filter(Boolean);
  const errors = [];
  for (const q of nonEmpty) {
    try {
      const result = await googlePlacesSearch(q, knownCity);
      if (result) return result;
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (nonEmpty.length > 0 && errors.length === nonEmpty.length) {
    throw new Error(`Google Places fallback failed for all queries: ${errors.join(" | ")}`);
  }
  return null;
}

function findCityTokenInText(text) {
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

function stripLandmarkPrepositions(landmark) {
  return landmark
    .replace(/^(מול|סמוך ל|ליד|פינת|קרוב ל|בקרבת)\s+/, "")
    .replace(/^(across from|near|next to|corner of|close to)\s+/i, "")
    .trim();
}

function expandInstitutionAbbreviations(text) {
  return text
    .replace(/ביה"ס|בי"ס/g, "בית ספר")
    .replace(/ביה"ח|בי"ח/g, "בית חולים")
    .replace(/גני"ל/g, "גן ילדים");
}

const INSTITUTION_WORDS = ["בית ספר", "ביה\"ס", "בי\"ס", "בית חולים", "ביה\"ח", "בי\"ח", "גן ילדים", "גני\"ל", "בית מרקחת", "בנק", "קניון", "בריכה", "פארק", "בית קפה", "מסעדה"];

function stripInstitutionWords(text) {
  for (const word of INSTITUTION_WORDS) {
    if (text.startsWith(word + " ")) return text.slice(word.length).trim();
  }
  return text;
}

async function geocodeSingleLanguage(placeName, extracted, houseNumber, proximity, language, knownCity) {
  // Defaults to גבעתיים when no city is known, for street AND landmark
  // queries alike — not just proximity-biasing toward it. Extended to
  // street queries 2026-08-08: a real batch run found "ארלוזורב" (a real
  // Givatayim street, no city stated) match an unrelated same-named street
  // in Tel Aviv instead, since street queries previously had no city hard
  // filter at all when the city was unknown.
  const effectiveCity = knownCity ?? "גבעתיים";

  const streetQuery = [extracted.street, houseNumber].filter(Boolean).join(" ").trim();
  if (streetQuery) {
    const result = await tryQueries([streetQuery, `${placeName} ${streetQuery}`], proximity, "address,poi", language, effectiveCity);
    if (result) return result;
  }
  // Landmarks are institutions/venues — POI only, never widened to
  // address/street type. A same-named street is a coincidence, not a
  // fallback location (see whatsapp-geocode.ts for the Shimoni School
  // regression this was caught from).
  for (const landmark of extracted.landmarks) {
    const stripped = stripLandmarkPrepositions(landmark);
    if (!stripped) continue;
    const expanded = expandInstitutionAbbreviations(stripped);
    const bare = stripInstitutionWords(stripped);
    const variants = [...new Set([stripped, expanded, bare].filter(Boolean))];
    // Some venues' names incorporate the city ("קאנטרי רמת גן" is the
    // club's own name). Only appends the REAL detected city, not the
    // גבעתיים default. Still city-hard-filtered after, same as any variant.
    const withCity = knownCity && !variants.some(v => v.includes(knownCity)) ? variants.map(v => `${v} ${knownCity}`) : [];
    const allVariants = [...variants, ...withCity];
    for (const variant of allVariants) {
      const result = await tryQueries([variant, `${placeName} ${variant}`], proximity, "poi", language, effectiveCity);
      if (result) return result;
    }
    const nominatimResult = await tryNominatimQueries(allVariants, effectiveCity);
    if (nominatimResult) return nominatimResult;
    const googleResult = await tryGooglePlacesQueries(allVariants, effectiveCity);
    if (googleResult) return googleResult;
  }
  return null;
}

function isEmptyAddress(a) {
  return !a.street && !a.city && a.landmarks.length === 0;
}

async function geocodeHint(placeName, extracted, contextText = "") {
  const { he, en } = extracted;

  const cityFromField = he.city && CITY_CENTERS[he.city] ? he.city : undefined;
  const cityFromContext = !cityFromField ? findCityTokenInText(contextText) : undefined;
  const detectedCity = cityFromField ?? cityFromContext;
  const proximity = detectedCity ? CITY_CENTERS[detectedCity] : CITY_CENTERS["גבעתיים"];
  console.log(`  [geocodeHint] proximity city: ${detectedCity ?? "גבעתיים (default)"}`);

  const heResult = await geocodeSingleLanguage(placeName, he, he.houseNumber, proximity, "he", detectedCity);
  if (heResult) return heResult;
  console.log("  [geocodeHint] Hebrew queries found nothing — trying English");
  const enResult = await geocodeSingleLanguage(placeName, en, he.houseNumber, proximity, "en", detectedCity);
  if (enResult) return enResult;
  console.log("  [geocodeHint] English queries found nothing — trying placeName itself as a last resort");
  const placeNameCity = detectedCity ?? "גבעתיים";
  const mapboxResult = await tryQueries([placeName], proximity, "poi", "he", placeNameCity);
  if (mapboxResult) return mapboxResult;
  const nominatimResult = await tryNominatimQueries([placeName], placeNameCity);
  if (nominatimResult) return nominatimResult;
  return await tryGooglePlacesQueries([placeName], placeNameCity);
}

const HEBREW_PREFIXES = ["ב", "ל", "מ", "ה", "ו", "כ", "ש"];

function tokenInSource(token, sourceText) {
  if (/^\d+$/.test(token)) return sourceText.includes(token);
  if (sourceText.includes(token)) return true;
  return HEBREW_PREFIXES.some(p => sourceText.includes(p + token));
}

function fieldLooksFabricated(value, sourceText) {
  if (!value) return false;
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.some(t => !tokenInSource(t, sourceText));
}

function stripJsonFence(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function cleanStr(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function cleanStrArray(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const result = [];
  for (const item of v) {
    const s = cleanStr(item);
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  }
  return result;
}

async function extractAddressFromText(text, placeName, openaiKey) {
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
  });
  if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    console.log(`  [extractAddressFromText] failed to parse LLM JSON: ${raw.slice(0, 200)}`);
    return null;
  }

  const he = {
    street: cleanStr(parsed?.he?.street),
    houseNumber: cleanStr(parsed?.he?.houseNumber),
    city: cleanStr(parsed?.he?.city),
    landmarks: cleanStrArray(parsed?.he?.landmarks),
  };
  for (const field of ["street", "houseNumber", "city"]) {
    if (fieldLooksFabricated(he[field], text)) {
      console.log(`  [extractAddressFromText] REJECTED fabricated he.${field}: "${he[field]}"`);
      he[field] = null;
    }
  }
  he.landmarks = he.landmarks.filter((landmark) => {
    if (landmark === placeName.trim()) {
      console.log(`  [extractAddressFromText] dropping landmark "${landmark}" — same as the reviewed place's own name`);
      return false;
    }
    if (fieldLooksFabricated(landmark, text)) {
      console.log(`  [extractAddressFromText] REJECTED fabricated landmark: "${landmark}"`);
      return false;
    }
    return true;
  });

  const en = {
    street: he.street ? cleanStr(parsed?.en?.street) : null,
    city: he.city ? cleanStr(parsed?.en?.city) : null,
    landmarks: he.landmarks.length > 0 ? cleanStrArray(parsed?.en?.landmarks) : [],
  };

  if (isEmptyAddress(he) && isEmptyAddress(en)) return null;
  return { he, en };
}

// --- test cases: real rows pulled from whatsapp_import_staging ---

const CASES = [
  {
    place_name: "בת חן ספרית",
    text: "בת חן מקסימה ומקצועית ברמת גן. שדרות ירושלים 13\nיש המלצה למספרה טובה באיזור?",
    note: "Bug B regression: city detection must not read 'ירושלים' out of the street name 'שדרות ירושלים' (Jerusalem Boulevard, a real street IN Ramat Gan). Even if the LLM drops 'רמת גן' from its extraction (seen on a live run), the raw-text fallback scan must skip the street-prefixed 'ירושלים' and correctly bias toward Ramat Gan, not Jerusalem or the old גבעתיים default.",
  },
  {
    place_name: "נטלי",
    text: "עשיתי לבת שלי לפני כמה ימים אצל נטלי בכצנלסון, חוויה סופר טובה, נטלי נהדרת ונעימה ❤️\nמישהי מכירה מקום שעושה חורים באוזניים לילדות בקניון? והאם פתוחים?",
    note: "Fabrication regression: text has no house number at all (just 'בכצנלסון'). Must return street='כצנלסון', houseNumber=null — never a number not in this text.",
  },
  {
    place_name: "יוליה",
    text: "ביוליה, בקניון, מול רולדין, עושים לנו היתה חוויה פחות נעימה שם אבל אולי התמקצעו מאז",
    note: "Fabrication + generic-landmark regression: real production text described יוליה as being inside a mall (no specific mall name), across from Roldin — no street/number/city at all. Previously the LLM fabricated a whole unrelated street address. Should now extract landmarks including a generic 'קניון' (per user feedback: a nameless mall mention still narrows the search) AND 'רולדין' — never a fabricated street/city, and never using יוליה's own name as a landmark.",
  },
  {
    place_name: "מיטל",
    text: "מיטל מדהימה, מול ביה\"ס שמעוני. עושה החלקות ותספורות\nמישהי מכירה מקום שעושה חורים באוזניים לילדות בקניון? והאם פתוחים?",
    note: "Bug A regression + category-mismatch regression: landmark phrase must be extracted separately from prepositions ('מול'). No city stated, so the search should default to גבעתיים (the real Shimoni School is at רביבים 1, גבעתיים — confirmed by the user, NOT Ramat Gan as an earlier, wrong version of this test case incorrectly assumed). A landmark/institution search must ONLY ever match a POI — never fall back to matching a same-named STREET (an earlier fix did exactly that: hard-filtered to a city and confidently matched an unrelated 'שמעוני' street there — city-correctness doesn't fix a category mismatch). Mapbox has no POI for this school under any city, so 'no match' is the correct, safe outcome — not a wrong street pin.",
  },
  {
    place_name: "קאנטרי רמת גן",
    text: "מישהו מכיר קאנטרי רמת גן? שווה לעשות מנוי לבריכה בשביל הילדים בקיץ?\nומה שעות הפתיחה בסופ\"ש?",
    note: "Bug C regression: previously matched an unrelated Tel Aviv park ('גן מאיר') that just shared the word 'גן'. Must extract landmark='קאנטרי' (or similar) and either find the real Ramat Gan country club with decent relevance, or reject a low-relevance/wrong match and return null instead of a confident-looking wrong pin.",
  },
  {
    place_name: "שרית עיצוב שיער",
    text: "שרית ממש טובה, ליד בנק הפועלים, מול הפארק הגדול ברמת גן\nמישהי מכירה מקום שעושה חורים באוזניים לילדות בקניון? והאם פתוחים?",
    note: "Multi-landmark regression (added after user feedback that landmark should be a list, not a single value): text names TWO distinct reference points ('בנק הפועלים' and 'הפארק הגדול'), both separate from the business's own name 'שרית'. Both should end up in he.landmarks (prepositions ליד/מול stripped from each), and geocodeSingleLanguage should try each independently until one gets a decent-relevance Mapbox match.",
  },
];

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.log("No OPENAI_API_KEY in .env.local — skipping the LLM extraction step.");
    console.log("Add OPENAI_API_KEY=sk-... to .env.local to test the full pipeline (extraction + geocoding) locally.\n");
  }

  for (const c of CASES) {
    console.log(`\n=== ${c.place_name} ===`);
    console.log(`note: ${c.note}`);
    console.log(`text: ${JSON.stringify(c.text)}`);

    let extracted = null;
    if (openaiKey) {
      try {
        extracted = await extractAddressFromText(c.text, c.place_name, openaiKey);
        console.log(`extracted: ${extracted ? JSON.stringify(extracted) : "null (no address)"}`);
      } catch (e) {
        console.log(`extraction ERROR: ${e.message}`);
        continue;
      }
    } else {
      console.log("(extraction skipped — no key)");
    }

    if (extracted) {
      try {
        const coords = await geocodeHint(c.place_name, extracted, c.text);
        console.log(coords
          ? `geocoded: ${coords.lat},${coords.lon} relevance=${coords.relevance} — "${coords.place_name}"`
          : "geocoded: no match");
      } catch (e) {
        console.log(`geocode ERROR: ${e.message}`);
      }
    } else if (!openaiKey) {
      console.log("(geocoding skipped — no extraction to test without a key)");
    } else {
      console.log("(nothing extracted — correctly nothing to geocode)");
    }
  }
}

main();
