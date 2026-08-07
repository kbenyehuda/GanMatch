import "server-only";

// Israeli city names — when any of these appear in an address hint we trust
// that the hint already specifies the city and don't append "גבעתיים".
export const KNOWN_CITIES = [
  "רמת גן", "תל אביב", "ראשון לציון", "פתח תקווה", "בת ים", "חולון",
  "רמת השרון", "הרצליה", "כפר סבא", "רעננה", "נתניה", "רחובות", "ירושלים",
  "חיפה", "אשדוד", "אשקלון", "נס ציונה", "לוד", "רמלה", "הוד השרון",
  "קריית אונו", "אור יהודה", "בני ברק", "פתח-תקווה",
];

// Throws on a real request failure (bad status, network error, timeout) —
// callers must not treat that the same as "genuinely no match" (same bug
// class as extractAddressFromText: a Nominatim rate-limit/block on the
// server's IP would otherwise look identical to an empty search result).
async function nominatimSearch(q: string): Promise<{ lat: number; lon: number } | null> {
  const log = (...args: unknown[]) => console.log("[nominatimSearch]", ...args);
  let res: Response;
  try {
    res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=il`,
      { headers: { "User-Agent": "GiveMytime-PlacesImport/1.0" }, signal: AbortSignal.timeout(8000) },
    );
  } catch (e: any) {
    log(`request failed for "${q}":`, e?.message ?? String(e));
    throw new Error(`Nominatim request failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log(`non-OK status ${res.status} for "${q}":`, body.slice(0, 300));
    throw new Error(`Nominatim search failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    log(`match for "${q}": ${data[0].lat},${data[0].lon}`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }
  log(`no match for "${q}" (empty result, status ${res.status})`);
  return null;
}

// Geocode an address hint.  When no city is detected, "גבעתיים" is appended
// as a default-city guess.  Returns null if geocoding fails.
//
// City detection checks both the trimmed hint AND the original message text
// (`contextText`) — the LLM extraction step can drop an explicitly-mentioned
// city while normalizing the address (e.g. "ברמת גן. שדרות ירושלים 13" →
// "שדרות ירושלים 13"), and without this fallback the code would then default
// to "גבעתיים", producing a confident but WRONG match on a same-named street
// in an unrelated city instead of a clean "not found" (discovered 2026-08-07,
// see project_launch_readiness memory — בת חן ספרית geocoded to a Holon
// street of the same name after its "ברמת גן" got dropped).
//
// Strategy: always geocode the address alone first — Nominatim doesn't know
// business names and including them hurts accuracy, and it can usually
// resolve a bare street name to a point on that street even without a house
// number (better than nothing — a street-level pin beats no pin at all).
// Fall back to a business-name query only if the address-only attempt
// returns nothing.
export async function geocodeHint(
  placeName: string,
  addressHint: string,
  contextText: string = "",
): Promise<{ lat: number; lon: number } | null> {
  const cityInHint = KNOWN_CITIES.some(c => addressHint.includes(c));
  const cityInContext = !cityInHint ? KNOWN_CITIES.find(c => contextText.includes(c)) : undefined;
  const city = cityInHint ? "" : cityInContext ? ` ${cityInContext}` : " גבעתיים";
  console.log(
    "[geocodeHint]",
    cityInHint ? `city already in hint "${addressHint}"` :
    cityInContext ? `hint lacked a city — using "${cityInContext}" found in raw message text` :
    `no city in hint or raw text — defaulting to גבעתיים (may be wrong)`,
  );
  const errors: string[] = [];

  // Address-first, with or without a house number.
  try {
    const result = await nominatimSearch(`${addressHint}${city} ישראל`);
    if (result) return result;
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
  }

  // Fallback: include business name (useful when hint is a neighbourhood / landmark)
  try {
    return await nominatimSearch(`${placeName} ${addressHint}${city} ישראל`);
  } catch (e: any) {
    errors.push(e?.message ?? String(e));
    // Both attempts failed with a real error (not a clean empty match) —
    // this must propagate so the caller retries the row instead of
    // permanently marking it "no address found".
    throw new Error(`geocodeHint failed for "${addressHint}": ${errors.join(" | ")}`);
  }
}

// Ask the LLM to extract a street/neighborhood/city from a WhatsApp message.
// Returns the raw address string, or null if the LLM genuinely found none.
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

אם ההמלצה מזכירה כתובת, רחוב, שכונה, או עיר — כתוב אותה כמחרוזת קצרה, בצורה שמנוע חיפוש גיאוגרפי (כמו OpenStreetMap) יוכל למצוא בוודאות.
נרמל את הכתובת: הסר אותיות יחס דבוקות בתחילת שם הרחוב (למשל "בשינקין 94" → "שינקין 94", "לרוטשילד" → "רוטשילד"), והשאר רק את שם הרחוב/שכונה/עיר והמספר, בלי מילות תיאור מסביב (למשל "מקבלת ברחוב הרצל 10 בבניין הכתום" → "הרצל 10").
חשוב: אם ההמלצה מזכירה עיר במפורש (למשל "ברמת גן", "בתל אביב") — חובה לשמור את שם העיר במחרוזת שאתה מחזיר, גם אחרי הנרמול (למשל "ברמת גן. שדרות ירושלים 13" → "שדרות ירושלים 13 רמת גן", לא רק "שדרות ירושלים 13"). אל תשמיט עיר שצוינה במפורש.
אם אין שום ציון מיקום — החזר null.
החזר רק את הכתובת המנורמלת או המילה null, ללא הסברים נוספים.`;

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
  return raw;
}
