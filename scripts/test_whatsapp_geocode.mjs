// Local, no-deploy test harness for the WhatsApp address-extraction +
// geocoding pipeline (src/lib/whatsapp-geocode.ts). Run with:
//
//   node scripts/test_whatsapp_geocode.mjs
//
// Reads .env.local for OPENAI_API_KEY / MAPBOX_ACCESS_TOKEN so you can catch
// prompt/geocoding regressions before clicking through the deployed admin UI
// (each of those runs costs real OpenAI usage and takes several minutes).
//
// This intentionally duplicates the core logic of src/lib/whatsapp-geocode.ts
// rather than importing it directly (that file is TypeScript with a
// Next.js-only "server-only" import, not easily runnable standalone). Keep
// this in sync by hand if you change the real extraction prompt, the
// hallucination guard, or the geocoding strategy.

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

function getMapboxToken() {
  return (process.env.MAPBOX_ACCESS_TOKEN || "").trim() || (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() || null;
}

async function mapboxSearch(query, proximity) {
  const token = getMapboxToken();
  if (!token) throw new Error("Missing Mapbox token");
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi");
  url.searchParams.set("proximity", `${proximity.lon},${proximity.lat}`);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Mapbox geocode failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const first = (data?.features ?? [])[0];
  const center = Array.isArray(first?.center) ? first.center : null;
  const lon = Number(center?.[0]), lat = Number(center?.[1]);
  if (!isFinite(lon) || !isFinite(lat)) return null;
  return { lat, lon, place_name: first?.place_name };
}

async function geocodeHint(placeName, addressHint, contextText = "") {
  const cityInHint = KNOWN_CITIES.find(c => addressHint.includes(c));
  const cityInContext = !cityInHint ? KNOWN_CITIES.find(c => contextText.includes(c)) : undefined;
  const detectedCity = cityInHint ?? cityInContext;
  const proximity = detectedCity ? CITY_CENTERS[detectedCity] : CITY_CENTERS["גבעתיים"];
  console.log(`  [geocodeHint] proximity city: ${detectedCity ?? "גבעתיים (default)"}`);
  const direct = await mapboxSearch(addressHint, proximity);
  if (direct) return direct;
  return await mapboxSearch(`${placeName} ${addressHint}`, proximity);
}

function hintLooksFabricated(hint, sourceText) {
  const nums = hint.match(/\d+/g) ?? [];
  return nums.some(n => !sourceText.includes(n));
}

async function extractAddressFromText(text, placeName, openaiKey) {
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
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, messages: [{ role: "user", content: prompt }], max_tokens: 80 }),
  });
  if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!raw || raw.toLowerCase() === "null" || raw === "—") return null;
  if (hintLooksFabricated(raw, text)) {
    console.log(`  [extractAddressFromText] REJECTED as fabricated: "${raw}" (a number in it isn't in the source text)`);
    return null;
  }
  return raw;
}

// --- test cases: real rows pulled from whatsapp_import_staging ---

const CASES = [
  {
    place_name: "בת חן ספרית",
    text: "בת חן מקסימה ומקצועית ברמת גן. שדרות ירושלים 13\nיש המלצה למספרה טובה באיזור?",
    note: "Known-bad case: city 'רמת גן' previously got dropped by the LLM, then defaulted to גבעתיים proximity and matched a same-named Holon street instead. Should now extract with city intact AND/OR bias toward רמת גן even if dropped.",
  },
  {
    place_name: "נטלי",
    text: "עשיתי לבת שלי לפני כמה ימים אצל נטלי בכצנלסון, חוויה סופר טובה, נטלי נהדרת ונעימה ❤️\nמישהי מכירה מקום שעושה חורים באוזניים לילדות בקניון? והאם פתוחים?",
    note: "Known-bad case: LLM previously fabricated house number '94' (text has no number at all — just 'בכצנלסון'). Should return 'כצנלסון' with no number, or null — never a number not in this text.",
  },
  {
    place_name: "יוליה",
    text: "ביוליה (מול רולדין) עושים לנו היתה חוויה פחות נעימה שם אבל אולי התמקצעו מאז\nמישהי מכירה מקום שעושה חורים באוזניים לילדות בקניון? והאם פתוחים?",
    note: "Known-bad case: LLM previously fabricated an entire unrelated address 'שדרות ירושלים 13 רמת גן'. This text has NO street/number/city at all — must return null.",
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

    let hint = null;
    if (openaiKey) {
      try {
        hint = await extractAddressFromText(c.text, c.place_name, openaiKey);
        console.log(`extracted hint: ${hint ? `"${hint}"` : "null (no address)"}`);
      } catch (e) {
        console.log(`extraction ERROR: ${e.message}`);
        continue;
      }
    } else {
      console.log("(extraction skipped — no key)");
    }

    if (hint) {
      try {
        const coords = await geocodeHint(c.place_name, hint, c.text);
        console.log(coords
          ? `geocoded: ${coords.lat},${coords.lon} — "${coords.place_name}"`
          : "geocoded: no match");
      } catch (e) {
        console.log(`geocode ERROR: ${e.message}`);
      }
    } else if (!openaiKey) {
      console.log("(geocoding skipped — no hint to test without extraction)");
    } else {
      console.log("(no hint extracted — correctly nothing to geocode)");
    }
  }
}

main();
