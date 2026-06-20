"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type ChatMessage = { index: number; name: string; text: string; timestamp: string | null };

type ContextResponse =
  | {
      row: { id: string; place_name: string; category: string; reviewer_name: string; recommendation_text: string; source_messages: string[] | null };
      found: true;
      matchScore: number;
      recommendationIndex: number;
      messages: ChatMessage[];
      sourceMessageIndices: number[];
      windowStart: number;
      windowEnd: number;
      totalMessages: number;
      hasMoreBefore: boolean;
    }
  | {
      row: { id: string; place_name: string; category: string; reviewer_name: string; recommendation_text: string; source_messages: string[] | null };
      found: false;
      matchScore: number;
      closestText: string | null;
      totalMessages: number;
    };

const SENDER_COLORS = ["#1F5BB5", "#2EA86B", "#C8A24B", "#9C5BBD", "#D86B7D", "#2196F3", "#E59A2C", "#5B8DD9"];

function senderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

function splitTimestamp(ts: string | null): { date: string; time: string } {
  if (!ts) return { date: "", time: "" };
  const [date, time] = ts.split(",").map(s => s.trim());
  return { date: date ?? "", time: time ?? "" };
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of Array.from(a)) if (!b.has(v)) return false;
  return true;
}

export default function WhatsAppChatContextPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useSession();

  const [data, setData] = useState<ContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [before, setBefore] = useState(30);

  // Roles a message can hold — assigned via the click-then-choose-action flow.
  const [recommendationIndices, setRecommendationIndices] = useState<Set<number>>(new Set());
  const [sourceIndices, setSourceIndices] = useState<Set<number>>(new Set());
  const [initialRecommendationIndices, setInitialRecommendationIndices] = useState<Set<number>>(new Set());
  const [initialSourceIndices, setInitialSourceIndices] = useState<Set<number>>(new Set());

  // Messages clicked but not yet assigned a role.
  const [pendingSelection, setPendingSelection] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    return supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
  }, []);

  const load = useCallback(async (windowBefore: number) => {
    const token = await getToken();
    if (!token) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/whatsapp-staging/chat-context?id=${id}&before=${windowBefore}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load chat context");
      setData(json);
      if (json.found) {
        const rec = new Set<number>([json.recommendationIndex]);
        const src = new Set<number>(json.sourceMessageIndices ?? []);
        setRecommendationIndices(rec);
        setSourceIndices(src);
        setInitialRecommendationIndices(rec);
        setInitialSourceIndices(src);
        setPendingSelection(new Set());
        // Server may have widened the window beyond what we asked for (to keep the
        // existing source-message guess visible) — sync so "load more" adds from there.
        setBefore(json.recommendationIndex - json.windowStart);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load chat context");
    } finally {
      setFetching(false);
    }
  }, [id, getToken]);

  useEffect(() => { if (user) load(before); }, [user, before, load]);

  const togglePending = useCallback((index: number) => {
    setPendingSelection(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const assignRole = useCallback((role: "recommendation" | "source") => {
    setRecommendationIndices(prevRec => {
      const nextRec = new Set(prevRec);
      setSourceIndices(prevSrc => {
        const nextSrc = new Set(prevSrc);
        pendingSelection.forEach(i => {
          if (role === "recommendation") { nextRec.add(i); nextSrc.delete(i); }
          else { nextSrc.add(i); nextRec.delete(i); }
        });
        return nextSrc;
      });
      return nextRec;
    });
    setPendingSelection(new Set());
  }, [pendingSelection]);

  const clearRoles = useCallback(() => {
    setRecommendationIndices(prev => {
      const next = new Set(prev);
      pendingSelection.forEach(i => next.delete(i));
      return next;
    });
    setSourceIndices(prev => {
      const next = new Set(prev);
      pendingSelection.forEach(i => next.delete(i));
      return next;
    });
    setPendingSelection(new Set());
  }, [pendingSelection]);

  const dirty = useMemo(
    () => !setsEqual(recommendationIndices, initialRecommendationIndices) || !setsEqual(sourceIndices, initialSourceIndices),
    [recommendationIndices, initialRecommendationIndices, sourceIndices, initialSourceIndices]
  );

  const save = useCallback(async () => {
    if (!data || !data.found) return;
    if (recommendationIndices.size === 0) {
      setError("צריך לסמן הודעה אחת לפחות כהמלצה");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing token");
      const recText = data.messages
        .filter(m => recommendationIndices.has(m.index))
        .sort((a, b) => a.index - b.index)
        .map(m => m.text)
        .join("\n");
      const sourceTexts = data.messages
        .filter(m => sourceIndices.has(m.index))
        .sort((a, b) => a.index - b.index)
        .map(m => m.text);
      const res = await fetch("/api/admin/whatsapp-staging", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, recommendation_text: recText, source_messages: sourceTexts }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Save failed");
      setInitialRecommendationIndices(new Set(recommendationIndices));
      setInitialSourceIndices(new Set(sourceIndices));
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [data, recommendationIndices, sourceIndices, id, getToken]);

  const cancelChanges = useCallback(() => {
    setRecommendationIndices(new Set(initialRecommendationIndices));
    setSourceIndices(new Set(initialSourceIndices));
    setPendingSelection(new Set());
  }, [initialRecommendationIndices, initialSourceIndices]);

  if (loading) return <div className="p-6 font-hebrew">טוען...</div>;
  if (!user) return <div className="p-6 font-hebrew">נדרשת כניסה לחשבון מנהל.</div>;
  if (!data) return <div className="p-6 font-hebrew" dir="rtl">{error ?? "טוען שיחה..."}</div>;

  const { row } = data;

  return (
    <main className="mx-auto max-w-2xl p-4 space-y-3 font-hebrew pb-32" dir="rtl">
      <div className="space-y-1">
        <h1 className="text-lg font-bold">{row.place_name}</h1>
        <p className="text-xs text-gray-500">ממליץ/ה: {row.reviewer_name}</p>
        <blockquote className="rounded bg-emerald-50 border-r-4 border-emerald-400 px-3 py-2 text-sm whitespace-pre-wrap">
          {row.recommendation_text}
        </blockquote>
        <p className="text-xs text-gray-500">
          לחצ/י על הודעה לבחירה, ואז סמנ/י אותה כהמלצה או כשאלת מקור באמצעות הסרגל למטה. ניתן לבחור כמה הודעות לכל תפקיד.
        </p>
      </div>

      {error && <div className="rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}

      {!data.found ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 space-y-2">
          <p>לא הצלחנו לאתר את ההמלצה הזו בקובץ הצ&quot;אט (התאמה הטובה ביותר: {(data.matchScore * 100).toFixed(0)}%).</p>
          {data.closestText && (
            <p className="text-xs text-amber-700">קרוב ביותר: &quot;{data.closestText}&quot;</p>
          )}
        </div>
      ) : (
        <>
          {data.matchScore < 0.9 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              ⚠ התאמה לא מדויקת ({(data.matchScore * 100).toFixed(0)}%) — בדוק/י שזו ההודעה הנכונה למטה.
            </div>
          )}

          {data.hasMoreBefore && (
            <button
              onClick={() => setBefore(b => b + 30)}
              disabled={fetching}
              className="w-full text-xs py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {fetching ? "טוען..." : "⬆ טען עוד 30 הודעות קודמות"}
            </button>
          )}

          <div className="space-y-2">
            {data.messages.map((msg, i) => {
              const prev = data.messages[i - 1];
              const { date, time } = splitTimestamp(msg.timestamp);
              const prevDate = prev ? splitTimestamp(prev.timestamp).date : null;
              const showDateDivider = date && date !== prevDate;
              const isRecommendation = recommendationIndices.has(msg.index);
              const isSource = sourceIndices.has(msg.index);
              const isPending = pendingSelection.has(msg.index);

              const bg = isRecommendation ? "bg-emerald-100" : isSource ? "bg-amber-50" : "bg-gray-100 hover:bg-gray-200";
              const ring = isPending
                ? "ring-2 ring-blue-400"
                : isRecommendation
                ? "ring-1 ring-emerald-300"
                : isSource
                ? "ring-1 ring-amber-300"
                : "";

              return (
                <div key={msg.index}>
                  {showDateDivider && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-3 py-0.5">{date}</span>
                    </div>
                  )}
                  <div
                    onClick={() => togglePending(msg.index)}
                    className={`max-w-[85%] rounded-lg px-3 py-2 cursor-pointer transition-colors ${bg} ${ring}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: senderColor(msg.name) }}>{msg.name}</span>
                      <span className="flex items-center gap-1">
                        {isRecommendation && <span className="text-[10px] font-semibold text-emerald-700">💡 המלצה</span>}
                        {isSource && <span className="text-[10px] font-semibold text-amber-700">❓ שאלת מקור</span>}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed mt-0.5">{msg.text}</p>
                    <div className="text-[10px] text-gray-400 mt-1 text-end">{time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(pendingSelection.size > 0 || dirty) && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg p-3 flex flex-col items-center gap-2">
          {pendingSelection.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-sm text-gray-600">{pendingSelection.size} הודעות נבחרו:</span>
              <button onClick={() => assignRole("recommendation")} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold">
                💡 סמנ/י כהמלצה
              </button>
              <button onClick={() => assignRole("source")} className="px-3 py-1 rounded bg-amber-500 text-white text-xs font-semibold">
                ❓ סמנ/י כשאלת מקור
              </button>
              <button onClick={clearRoles} className="px-3 py-1 rounded border text-xs text-gray-600">
                🗑 הסר סימון
              </button>
            </div>
          )}
          {dirty && (
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                {saving ? "שומר..." : "שמור שינויים"}
              </button>
              <button onClick={cancelChanges} disabled={saving} className="px-4 py-1.5 rounded border text-sm text-gray-600">
                ביטול
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
