import "server-only";
import { serverEnv } from "@/lib/env/server";
import { checkApiUsage } from "@/lib/api-usage";
import type { PlaceHoldReason } from "@/lib/place-hold-reasons";

/**
 * Automatic check of a NEW place added by a resident, before it is shown on the map (decision 2026-11-18).
 * Flagged places are saved hidden and wait in /admin/held-places. If the check can't run the place is
 * held, never published unchecked (same rule as recommendations, see review-check.ts).
 */

const MODEL_REASONS = ["offensive", "contact_or_ad", "not_a_place", "allegation"] as const;

const SYSTEM_PROMPT = `You check a NEW PLACE that a resident added to a community directory for Giv'atayim, Israel
(a kindergarten, a doctor, a treatment or beauty place, a cafe, a sports class, a babysitter's service…), before it is
shown on the map. You see the name, the category and the free-text description (the phone and website fields are not
shown to you). Flag it only for these reasons:
- offensive: insults, profanity or hate in the name or description.
- contact_or_ad: a phone number, email, link or social handle written INSIDE the name or the description, or
  advertising language (discounts, "call now").
- not_a_place: clearly a test, a joke or nonsense ("asdf", "בדיקה", random letters), or not a business, service or
  professional that a parent or resident could use.
- allegation: the description states as fact that a person or business did something wrong or illegal.
Real names of businesses and professionals, with titles (ד"ר, דיאטנית, מטפלת), are expected and fine.
When in doubt, publish it.`;

export async function checkNewPlace(args: {
  name: string;
  category: string;
  description: string | null;
}): Promise<{ publish: boolean; reasons: PlaceHoldReason[] }> {
  const reasons: PlaceHoldReason[] = [];
  const apiKey = serverEnv.OPENAI_API_KEY;
  const usage = apiKey ? await checkApiUsage("openai") : null;
  if (!apiKey || !usage?.allowed) {
    console.error("[place-check] not run:", apiKey ? usage?.reason : "OPENAI_API_KEY missing");
    return { publish: false, reasons: ["check_unavailable"] };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `שם: ${args.name}\nקטגוריה: ${args.category}\nתיאור: ${args.description?.trim() || "(אין)"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "place_check",
            description: "The result of checking one new place.",
            parameters: {
              type: "object",
              properties: {
                reasons: {
                  type: "array",
                  items: { type: "string", enum: MODEL_REASONS },
                  description: "Every reason that applies; empty when it can be published.",
                },
              },
              required: ["reasons"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "place_check" } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI ${res.status}`);
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const found: unknown = JSON.parse(call?.function?.arguments ?? "{}")?.reasons;
    if (Array.isArray(found)) {
      for (const r of found) {
        if ((MODEL_REASONS as readonly string[]).includes(r) && !reasons.includes(r as PlaceHoldReason)) reasons.push(r as PlaceHoldReason);
      }
    }
    return { publish: reasons.length === 0, reasons };
  } catch (e) {
    console.error("[place-check] failed:", e);
    return { publish: false, reasons: ["check_unavailable"] };
  }
}
