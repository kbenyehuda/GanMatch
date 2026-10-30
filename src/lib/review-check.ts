import "server-only";
import { serverEnv } from "@/lib/env/server";
import { checkApiUsage } from "@/lib/api-usage";
import type { HoldReason } from "@/lib/hold-reasons";

/**
 * Automatic check of a recommendation written in the app, before it's published.
 * Anything flagged (or a 1–2 star rating) is saved hidden and waits for an admin in
 * /admin/held-reviews. If the check can't run, the review is held, never published unchecked.
 */

const MODEL_REASONS = ["negative", "allegation", "identifies_writer", "contact_or_ad", "offensive"] as const;

const SYSTEM_PROMPT = `You check a recommendation that a parent wrote, in Hebrew, about a local place in Giv'atayim
(a gan, a doctor, a hairdresser…), before it is published on a community website.
Flag it only for these reasons:
- negative: the tone toward the place or a person is negative or critical (mild, balanced remarks like
  "התורים ארוכים" inside a positive recommendation are NOT negative).
- allegation: it states as fact that a person or place did something wrong or illegal (theft, neglect,
  abuse, lying, a lawsuit, unsafe practice).
- identifies_writer: it contains something that points to WHO WROTE IT: the writer's own name, phone, email
  or home address, or a combination of details that the place's staff or other parents could realistically
  trace to one family. Ages, a child's condition, "two daughters", staff names, or how long they've been there
  are NOT enough on their own and must not be flagged.
- contact_or_ad: a phone number, email, link or social handle, or advertising for a business (including the
  writer's own).
- offensive: insults, profanity, hate.
Names of the place, its owner or staff are expected and fine. When in doubt about a positive or neutral
recommendation, publish it.`;

export async function checkReview(args: {
  placeName: string;
  rating: number;
  text: string | null;
}): Promise<{ publish: boolean; reasons: HoldReason[] }> {
  const reasons: HoldReason[] = args.rating <= 2 ? ["low_rating"] : [];
  const text = args.text?.trim();
  if (!text) return { publish: reasons.length === 0, reasons };

  const apiKey = serverEnv.OPENAI_API_KEY;
  const usage = apiKey ? await checkApiUsage("openai") : null;
  if (!apiKey || !usage?.allowed) {
    console.error("[review-check] not run:", apiKey ? usage?.reason : "OPENAI_API_KEY missing");
    return { publish: false, reasons: [...reasons, "check_unavailable"] };
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
          { role: "user", content: `שם המקום: ${args.placeName}\nדירוג: ${args.rating} מתוך 5\nטקסט ההמלצה:\n${text}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "review_check",
            description: "The result of checking one recommendation.",
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
        tool_choice: { type: "function", function: { name: "review_check" } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI ${res.status}`);
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const found: unknown = JSON.parse(call?.function?.arguments ?? "{}")?.reasons;
    if (Array.isArray(found)) {
      for (const r of found) {
        if ((MODEL_REASONS as readonly string[]).includes(r) && !reasons.includes(r as HoldReason)) reasons.push(r as HoldReason);
      }
    }
    return { publish: reasons.length === 0, reasons };
  } catch (e) {
    console.error("[review-check] failed:", e);
    return { publish: false, reasons: [...reasons, "check_unavailable"] };
  }
}
