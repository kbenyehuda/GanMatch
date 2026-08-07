import "server-only";

// Israeli city names + approximate centers (lon, lat). Used two ways:
// 1. Detect whether a city is already named in the hint or raw message text.
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

function getMapboxToken(): string | null {
  return (
    (process.env.MAPBOX_ACCESS_TOKEN || "").trim() ||
    (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() ||
    null
  );
}

// Same Mapbox Geocoding v5 setup already used by /api/geocode and
// /api/geocode/suggest (country=il, language=he) — reusing the pattern that
// already works for the app's main address search, instead of the free-text
// Nominatim approach this file used before, which had no real way to bias
// results toward the right city (see geocodeHint below).
//
// Throws on a real request failure (bad status, network error, timeout, or
// missing token) — callers must not treat that the same as "genuinely no
// match" (same bug class as extractAddressFromText: a failure silently
// treated as "no result" previously caused rows to be permanently
// sentinel-marked as unresolvable — see project_launch_readiness memory,
// 2026-08-07 session).
async function mapboxSearch(
  query: string,
  proximity: { lon: number; lat: number },
): Promise<{ lat: number; lon: number } | null> {
  const log = (...args: unknown[]) => console.log("[mapboxSearch]", ...args);
  const token = getMapboxToken();
  if (!token) throw new Error("Missing Mapbox token (MAPBOX_ACCESS_TOKEN / NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN)");

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi");
  url.searchParams.set("proximity", `${proximity.lon},${proximity.lat}`);

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (e: any) {
    log(`request failed for "${query}":`, e?.message ?? String(e));
    throw new Error(`Mapbox request failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log(`non-OK status ${res.status} for "${query}":`, body.slice(0, 300));
    throw new Error(`Mapbox geocode failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  const first = features[0];
  const center = Array.isArray(first?.center) ? first.center : null;
  const lon = Number(center?.[0]);
  const lat = Number(center?.[1]);
  if (!isFinite(lon) || !isFinite(lat)) {
    log(`no match for "${query}"`);
    return null;
  }
  log(`match for "${query}": ${lat},${lon} (${first?.place_name ?? ""})`);
  return { lat, lon };
}

// Geocode an address hint. Returns null if geocoding genuinely finds nothing.
//
// City detection checks both the trimmed hint AND the original message text
// (`contextText`) — the LLM extraction step can drop an explicitly-mentioned
// city while normalizing the address. The detected city only sets Mapbox's
// `proximity` ranking bias — it is never concatenated into the query text.
// An earlier version of this function DID concatenate a city string (and
// defaulted to "גבעתיים" when none was detected), which caused a confident
// but WRONG match: "שדרות ירושלים 13" for בת חן ספרית (actually in רמת גן)
// matched a same-named street in an unrelated city regardless of which city
// string was appended, because free-text search doesn't hard-filter by a
// text token — it just treats it as one more ranking signal. Proximity bias
// achieves the same goal (favor the right area) without that failure mode.
// (discovered + fixed 2026-08-07, see project_launch_readiness memory.)
export async function geocodeHint(
  placeName: string,
  addressHint: string,
  contextText: string = "",
): Promise<{ lat: number; lon: number } | null> {
  const cityInHint = KNOWN_CITIES.find(c => addressHint.includes(c));
  const cityInContext = !cityInHint ? KNOWN_CITIES.find(c => contextText.includes(c)) : undefined;
  const detectedCity = cityInHint ?? cityInContext;
  const proximity = detectedCity ? CITY_CENTERS[detectedCity] : CITY_CENTERS["גבעתיים"];
  console.log(
    "[geocodeHint]",
    cityInHint ? `city "${cityInHint}" already in hint "${addressHint}"` :
    cityInContext ? `hint lacked a city — biasing toward "${cityInContext}" found in raw message text` :
    `no city in hint or raw text — biasing toward גבעתיים (default, may still be wrong)`,
  );
  const errors: string[] = [];

  // Address-first, with or without a house number — Mapbox can resolve a
  // bare street name to a point on it, and doesn't need the business name.
  try {
    const result = await mapboxSearch(addressHint, proximity);
    if (result) return result;
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
  }

  // Fallback: include business name (useful when hint is a neighbourhood / landmark)
  try {
    return await mapboxSearch(`${placeName} ${addressHint}`, proximity);
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
    // Both attempts failed with a real error (not a clean empty match) —
    // this must propagate so the caller retries the row instead of
    // permanently marking it "no address found".
    throw new Error(`geocodeHint failed for "${addressHint}": ${errors.join(" | ")}`);
  }
}

// Reject a hint if it contains a number that doesn't appear anywhere in the
// source text — house numbers are exactly the kind of concrete fact a model
// fabricates when normalizing/summarizing rather than genuinely extracting.
// Confirmed on 2026-08-07: gpt-4o-mini invented "כצנלסון 94" from text that
// only said "בכצנלסון" (no number at all), and invented a full unrelated
// address "שדרות ירושלים 13 רמת גן" for a message that never mentioned any
// street, number, or city (it only said "מול רולדין... בקניון"). Both
// fabricated numbers/strings were echoes of literal examples that had been
// placed in the extraction prompt — see extractAddressFromText.
function hintLooksFabricated(hint: string, sourceText: string): boolean {
  const hintNumbers = hint.match(/\d+/g) ?? [];
  return hintNumbers.some(n => !sourceText.includes(n));
}

// Ask the LLM to extract a street/neighborhood/city from a WhatsApp message.
// Returns the raw address string, or null if the LLM genuinely found none —
// including when it found something but hintLooksFabricated() rejected it.
// Throws (does NOT return null) on a request/API failure — callers must not
// treat a failed call the same as "no address mentioned": doing so previously
// caused an OpenAI rate-limit burst to silently mark real addresses as
// "not found" and permanently skip them (discovered 2026-08-07 — see
// project_ui_polish_backlog / retroactive-geocode debugging session).
export async function extractAddressFromText(
  text: string,
  placeName: string,
  openaiKey: string,
): Promise<string | null> {
  const prompt = `המלצה מוואטסאפ על "${placeName}":
${text}

אם ההמלצה מזכירה כתובת, רחוב, שכונה, או עיר — כתוב אותה כמחרוזת קצרה.
אסור בהחלט להמציא, לנחש או להוסיף פרטים שלא מופיעים במפורש בטקסט למעלה — לא מספר בית, לא שם רחוב, ולא עיר. אם חלק מהכתובת חסר (למשל אין מספר בית, או לא צוינה עיר) — פשוט השאר אותו חסר, אל תמלא אותו מהידע הכללי שלך.
אפשר לנרמל רק דברים שכן כתובים בטקסט: הסר אותיות יחס דבוקות בתחילת שם רחוב שכן מופיע בטקסט (למשל אם כתוב "בדיזנגוף" תחזיר "דיזנגוף"), והשאר רק את הרחוב/שכונה/עיר והמספר שבאמת נכתבו, בלי מילות תיאור מסביב.
אם אין שום ציון מיקום בטקסט — החזר null.
החזר רק את הכתובת או המילה null, ללא הסברים נוספים.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI address extraction failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!raw || raw.toLowerCase() === "null" || raw === "—") return null;
  if (hintLooksFabricated(raw, text)) {
    console.log(`[extractAddressFromText] rejecting likely-fabricated hint "${raw}" — a number in it doesn't appear in the source text`);
    return null;
  }
  return raw;
}
