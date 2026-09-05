import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { getChatMessages, getChatMessagesFromStorage, findMessageIndex } from "@/lib/whatsapp-chat-cache";

// Where the raw chat export lives in Supabase Storage — used whenever
// WHATSAPP_CHAT_FILE_PATH isn't set (i.e. everywhere except local dev).
const WHATSAPP_STORAGE_BUCKET = "whatsapp-exports";
const WHATSAPP_STORAGE_PATH = "chat-export.txt";

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

// Containment matching is only safe for reasonably long strings — without a length
// floor, short text ("כן", "👍") matches constantly throughout the whole chat history.
function isCloseMatch(t: string, s: string): boolean {
  if (t.length < 8 || s.length < 8) return t === s;
  return t.includes(s) || s.includes(t);
}

export async function GET(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = adminAuth(req);
  if (!authHeader) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const before = Math.min(500, Math.max(0, parseInt(searchParams.get("before") ?? "30", 10) || 30));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: row, error: rowErr } = await admin
    .from("whatsapp_import_staging")
    .select("id, place_name, category, reviewer_name, recommendation_text, source_messages")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "Staging record not found" }, { status: 404 });

  let messages;
  try {
    messages = serverEnv.WHATSAPP_CHAT_FILE_PATH
      ? getChatMessages(serverEnv.WHATSAPP_CHAT_FILE_PATH)
      : await getChatMessagesFromStorage(async () => {
          const { data, error } = await admin.storage.from(WHATSAPP_STORAGE_BUCKET).download(WHATSAPP_STORAGE_PATH);
          if (error || !data) throw new Error(error?.message ?? "Chat export not found in storage");
          return await data.text();
        });
  } catch (e: any) {
    return NextResponse.json({ error: `Could not read chat file: ${e.message}` }, { status: 500 });
  }

  const match = findMessageIndex(messages, row.reviewer_name, row.recommendation_text);

  if (match.index === null) {
    return NextResponse.json({
      row,
      found: false,
      matchScore: match.score,
      closestText: match.matchedText,
      totalMessages: messages.length,
    });
  }

  const idx = match.index;

  const sourceCandidates: string[] = (row.source_messages ?? []).filter(
    (s: string) => !(s.startsWith("[") && s.endsWith("]"))
  );
  const sourceLower = sourceCandidates.map(s => s.toLowerCase());

  // Make sure the existing guessed source message is inside the window, even if
  // that means showing further back than the requested `before` count.
  let earliestSourceIdx = idx;
  for (const m of messages) {
    if (m.index >= idx) break;
    const t = m.text.toLowerCase();
    if (sourceLower.some(s => isCloseMatch(t, s))) {
      earliestSourceIdx = Math.min(earliestSourceIdx, m.index);
    }
  }

  // Cap the auto-widen — if the recommendation itself was mis-anchored (low match
  // score), the "earliest source mention" can be absurdly far back. Past this point
  // it's better to show a normal-sized window and let the low-confidence banner do its job.
  const MAX_AUTO_WIDEN = 200;
  const effectiveBefore = Math.min(MAX_AUTO_WIDEN, Math.max(before, idx - earliestSourceIdx));
  const start = Math.max(0, idx - effectiveBefore);
  const end = idx + 1; // the recommendation is always the last message in the window
  const windowMsgs = messages.slice(start, end);

  const sourceMessageIndices = windowMsgs
    .filter(m => {
      const t = m.text.toLowerCase();
      return sourceLower.some(s => isCloseMatch(t, s));
    })
    .map(m => m.index);

  return NextResponse.json({
    row,
    found: true,
    matchScore: match.score,
    recommendationIndex: idx,
    messages: windowMsgs,
    sourceMessageIndices,
    windowStart: start,
    windowEnd: end,
    totalMessages: messages.length,
    hasMoreBefore: start > 0,
  });
}
