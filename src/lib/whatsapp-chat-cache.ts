import "server-only";
import fs from "fs";

// Mirrors the parsing logic in scripts/places_import/parse_whatsapp.py —
// keep both in sync if the chat export format assumptions change.

export interface ChatMessage {
  index: number;
  name: string;
  text: string;
  timestamp: string | null; // raw "D/M/YY, HH:MM" as captured, unparsed
}

const MSG_PATTERN =
  /^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*-?\s*([^:]+?):\s(.+)$/;

const SKIP_PATTERNS: RegExp[] = [
  /^<Media omitted>$/i,
  /^image omitted$/i,
  /^video omitted$/i,
  /^audio omitted$/i,
  /^sticker omitted$/i,
  /^הודעה זו נמחקה$/,
  /Messages and calls are end-to-end encrypted/i,
  /joined using a group link/i,
  /created group/i,
];

const EDITED_SUFFIX = /\s*<This message was edited>\s*$/i;

function parseChat(path: string): ChatMessage[] {
  const raw = fs.readFileSync(path, "utf-8");
  const messages: ChatMessage[] = [];
  let current: { name: string; text: string; timestamp: string } | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const m = MSG_PATTERN.exec(line);
    if (m) {
      if (current) messages.push({ index: messages.length, ...current });
      const [, date, time, nameRaw, textRaw] = m;
      const name = nameRaw.trim();
      const text = textRaw.trim().replace(EDITED_SUFFIX, "");
      if (SKIP_PATTERNS.some(p => p.test(text)) || SKIP_PATTERNS.some(p => p.test(name))) {
        current = null;
        continue;
      }
      current = { name, text, timestamp: `${date}, ${time}` };
    } else if (current && line) {
      current.text += " " + line.trim();
    }
  }
  if (current) messages.push({ index: messages.length, ...current });
  return messages;
}

let cache: { path: string; mtimeMs: number; messages: ChatMessage[] } | null = null;

export function getChatMessages(path: string): ChatMessage[] {
  const stat = fs.statSync(path);
  if (cache && cache.path === path && cache.mtimeMs === stat.mtimeMs) return cache.messages;
  const messages = parseChat(path);
  cache = { path, mtimeMs: stat.mtimeMs, messages };
  return messages;
}

// Bigram Dice coefficient — approximates Python's difflib.SequenceMatcher ratio
// closely enough for fuzzy-matching purposes (same 0.5 threshold as enrich_source_questions.py).
function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  const t = s.toLowerCase();
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let intersection = 0;
  ba.forEach((v, k) => {
    const bv = bb.get(k);
    if (bv) intersection += Math.min(v, bv);
  });
  let total = 0;
  ba.forEach(v => { total += v; });
  bb.forEach(v => { total += v; });
  return total === 0 ? 0 : (2 * intersection) / total;
}

const FUZZY_THRESHOLD = 0.5;

export interface MatchResult {
  index: number | null;
  score: number;
  matchedText: string | null;
}

export function findMessageIndex(
  messages: ChatMessage[],
  reviewerName: string,
  recommendationText: string
): MatchResult {
  const reviewerLower = reviewerName.toLowerCase();
  const recLower = recommendationText.toLowerCase();
  const nameMatches = (chatName: string) => {
    const cn = chatName.toLowerCase();
    return cn === reviewerLower || reviewerLower.includes(cn) || cn.includes(reviewerLower);
  };

  const scan = (candidates: ChatMessage[]): MatchResult => {
    let bestIdx: number | null = null;
    let bestScore = 0;
    let bestText: string | null = null;
    for (const msg of candidates) {
      const msgLower = msg.text.toLowerCase();
      if (msgLower.includes(recLower)) return { index: msg.index, score: 1, matchedText: msg.text };
      const score = similarity(msg.text, recommendationText);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = msg.index;
        bestText = msg.text;
      }
    }
    return { index: bestScore >= FUZZY_THRESHOLD ? bestIdx : null, score: bestScore, matchedText: bestText };
  };

  const byName = messages.filter(m => nameMatches(m.name));
  if (byName.length > 0) return scan(byName);
  return scan(messages);
}
