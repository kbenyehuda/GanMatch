"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS } from "@/types/places";
import type { PlaceCategory } from "@/types/places";

const BUILTIN_CATEGORIES: PlaceCategory[] = ["doctor", "clinic", "cafe", "kids", "sport", "attraction", "food", "cosmetics"];
const CUSTOM_CATS_KEY = "whatsapp_triage_custom_categories";

type StagingStatus = "pending" | "approved" | "rejected";

type StagingItem = {
  id: string;
  place_name: string;
  category: string;
  address_hint: string | null;
  recommendation_text: string;
  reviewer_name: string;
  enthusiasm: "high" | "medium" | "negative";
  source_file: string | null;
  source_messages: string[] | null;
  merge_group_id: string | null;
  existing_place_id: string | null;
  existing_place_name: string | null;
  created_place_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  moderation_reason: string | null;
  status: StagingStatus;
  created_at: string;
};

const ENTHUSIASM_STARS: Record<string, string> = {
  high: "⭐⭐⭐⭐⭐",
  medium: "⭐⭐⭐⭐",
  negative: "⭐⭐",
};

const STATUS_LABELS: Record<StagingStatus, string> = {
  pending: "ממתין",
  approved: "אושר",
  rejected: "נדחה",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL");
}

function formatAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "הרגע";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

export default function WhatsAppStagingPage() {
  const { user, loading } = useSession();
  const [status, setStatus] = useState<StagingStatus>("pending");
  const [items, setItems] = useState<StagingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [categoryById, setCategoryById] = useState<Record<string, string>>({});
  const [expandedContext, setExpandedContext] = useState<Record<string, boolean>>({});
  const [includeTextById, setIncludeTextById] = useState<Record<string, boolean>>({});
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) ?? "[]"); } catch { return []; }
  });
  const [newCatInput, setNewCatInput] = useState("");

  const allCategories = [...BUILTIN_CATEGORIES, ...customCategories];

  const addCustomCategory = useCallback(() => {
    const name = newCatInput.trim();
    if (!name || allCategories.includes(name as PlaceCategory)) return;
    const updated = [...customCategories, name];
    setCustomCategories(updated);
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(updated));
    setNewCatInput("");
  }, [newCatInput, customCategories, allCategories]);

  const loadItems = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const token = await supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing token");
      const res = await fetch(`/api/admin/whatsapp-staging?status=${status}&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
      setItems([]);
    } finally {
      setReloading(false);
    }
  }, [status, user]);

  useEffect(() => { if (user) loadItems(); }, [user, loadItems]);

  const decide = useCallback(async (id: string, action: "approve" | "reject") => {
    if (!supabase || !user) return;
    setBusyId(id);
    setError(null);
    try {
      const token = await supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing token");
      const res = await fetch("/api/admin/whatsapp-staging/decision", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id,
          action,
          moderation_reason: (reasonById[id] ?? "").trim() || null,
          include_text: includeTextById[id] !== false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Decision failed");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Decision failed");
    } finally {
      setBusyId(null);
    }
  }, [reasonById, user]);

  const patchCategory = useCallback(async (id: string, category: string) => {
    if (!supabase || !user) return;
    setCategoryById(prev => ({ ...prev, [id]: category }));
    try {
      const token = await supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing token");
      await fetch("/api/admin/whatsapp-staging", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, category }),
      });
    } catch { /* non-critical — local state already updated */ }
  }, [user]);

  const runMerge = useCallback(async () => {
    if (!supabase || !user) return;
    setMerging(true);
    setMergeResult(null);
    setError(null);
    try {
      const token = await supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing token");
      const res = await fetch("/api/admin/whatsapp-staging/merge", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ min_similarity: 0.82 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Merge failed");
      setMergeResult(`${data.groups_created} קבוצות מיזוג, ${data.records_affected} רשומות מסומנות`);
      loadItems();
    } catch (e: any) {
      setError(e?.message ?? "Merge failed");
    } finally {
      setMerging(false);
    }
  }, [user, loadItems]);

  if (loading) return <div className="p-6 font-hebrew">טוען...</div>;
  if (!user) return <div className="p-6 font-hebrew">נדרשת כניסה לחשבון מנהל.</div>;

  // Group items by merge_group_id for display
  const grouped: { groupId: string | null; items: StagingItem[] }[] = [];
  const ungrouped: StagingItem[] = [];
  const seenGroups = new Map<string, StagingItem[]>();

  for (const item of items) {
    if (item.merge_group_id) {
      if (!seenGroups.has(item.merge_group_id)) {
        seenGroups.set(item.merge_group_id, []);
        grouped.push({ groupId: item.merge_group_id, items: seenGroups.get(item.merge_group_id)! });
      }
      seenGroups.get(item.merge_group_id)!.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  const sections = [
    ...grouped.map(g => ({ groupId: g.groupId, items: g.items })),
    ...ungrouped.map(item => ({ groupId: null, items: [item] })),
  ];

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6 space-y-4 font-hebrew" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ייבוא המלצות WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">סקור המלצות שחולצו אוטומטית לפני שיופיעו באפליקציה</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newCatInput}
            onChange={e => setNewCatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustomCategory()}
            placeholder="קטגוריה חדשה..."
            className="px-2 py-1.5 rounded border text-sm w-36"
          />
          <button onClick={addCustomCategory} disabled={!newCatInput.trim()}
            className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50 disabled:opacity-40">
            + הוסף
          </button>
        </div>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">← חזרה לאפליקציה</a>
      </div>

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "rejected"] as StagingStatus[]).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded border text-sm ${status === s ? "bg-[#0A2B6B] text-white border-[#0A2B6B]" : "bg-white"}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <button onClick={loadItems} disabled={reloading} className="px-3 py-1.5 rounded border text-sm bg-white disabled:opacity-50">
          {reloading ? "טוען..." : "רענן"}
        </button>
        <span className="text-sm text-gray-500">{items.length} רשומות</span>

        {status === "pending" && (
          <button onClick={runMerge} disabled={merging}
            className="px-3 py-1.5 rounded border text-sm bg-amber-50 border-amber-300 text-amber-800 disabled:opacity-50 mr-auto">
            {merging ? "מנתח..." : "🔍 נתח כפילויות"}
          </button>
        )}
      </div>

      {mergeResult && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{mergeResult}</div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Items */}
      <div className="space-y-3">
        {sections.length === 0 && !reloading && (
          <div className="text-center text-gray-400 py-12 text-sm">אין רשומות בסטטוס זה</div>
        )}

        {sections.map(({ groupId, items: sectionItems }) => (
          <div key={groupId ?? sectionItems[0].id}
            className={groupId ? "rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-3" : ""}>
            {groupId && (
              <div className="text-xs font-semibold text-amber-700 mb-1">
                ⚠️ קבוצת מיזוג אפשרית — {sectionItems.length} רשומות עשויות להתייחס לאותו מקום
              </div>
            )}

            {sectionItems.map(item => {
              const effectiveCat = (categoryById[item.id] ?? item.category) as PlaceCategory;
              const catColor = PLACE_CATEGORY_COLORS[effectiveCat] ?? "#6B7280";
              const contextOpen = !!expandedContext[item.id];
              const hasContext = (item.source_messages ?? []).length > 0;

              return (
                <section key={item.id} className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
                  {/* Title row */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold">{item.place_name}</span>
                        <select
                          value={effectiveCat}
                          onChange={e => patchCategory(item.id, e.target.value)}
                          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white border-0 cursor-pointer"
                          style={{ background: catColor }}
                        >
                          {allCategories.map(c => (
                            <option key={c} value={c} style={{ background: "#fff", color: "#111" }}>
                              {PLACE_CATEGORY_LABELS[c as PlaceCategory] ?? c}
                            </option>
                          ))}
                        </select>
                        <span className="text-base">{ENTHUSIASM_STARS[item.enthusiasm]}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatAge(item.created_at)} · {item.source_file ?? "—"}
                        {item.address_hint && <span> · {item.address_hint}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Existing place match */}
                  {item.existing_place_name && (
                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      📍 מקום קיים במסד: <strong>{item.existing_place_name}</strong> — אישור יוסיף ביקורת למקום הקיים
                    </div>
                  )}

                  {/* Source context (questions that triggered this recommendation) */}
                  {hasContext && (
                    <div>
                      <button
                        onClick={() => setExpandedContext(prev => ({ ...prev, [item.id]: !contextOpen }))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {contextOpen ? "▲ הסתר הקשר" : "▼ הצג שאלה מקורית"}
                      </button>
                      {contextOpen && (
                        <div className="mt-2 space-y-1 rounded bg-blue-50 border border-blue-100 px-3 py-2">
                          {item.source_messages!.map((msg, i) => (
                            <p key={i} className="text-xs text-blue-800 leading-relaxed">{msg}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review text */}
                  <blockquote className="rounded bg-gray-50 border-r-4 border-gray-300 px-3 py-2 text-sm text-gray-800 leading-relaxed">
                    {item.recommendation_text}
                  </blockquote>

                  {/* Reviewer */}
                  <div className="text-xs text-gray-500">
                    ממליץ/ה: <span className="font-medium text-gray-700">{item.reviewer_name}</span>
                  </div>

                  {/* Actions (pending only) */}
                  {status === "pending" && (
                    <div className="flex flex-col gap-2 pt-1">
                      <textarea
                        placeholder="סיבה (אופציונלי)"
                        value={reasonById[item.id] ?? ""}
                        onChange={e => setReasonById(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full rounded border p-2 text-sm resize-none"
                        rows={2}
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeTextById[item.id] !== false}
                          onChange={e => setIncludeTextById(prev => ({ ...prev, [item.id]: e.target.checked }))}
                          className="w-4 h-4"
                        />
                        כלול טקסט המלצה
                      </label>
                      <div className="flex gap-2">
                        <button
                          disabled={busyId === item.id}
                          onClick={() => decide(item.id, "approve")}
                          className="px-4 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                          ✓ אשר
                        </button>
                        <button
                          disabled={busyId === item.id}
                          onClick={() => decide(item.id, "reject")}
                          className="px-4 py-1.5 rounded bg-rose-600 text-white text-sm font-semibold disabled:opacity-50">
                          ✕ דחה
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Review result (approved/rejected) */}
                  {status !== "pending" && (
                    <div className="text-xs text-gray-500">
                      {status === "approved" ? "אושר" : "נדחה"} ע"י {item.reviewed_by ?? "—"} · {formatDate(item.reviewed_at)}
                      {item.moderation_reason && <span> · {item.moderation_reason}</span>}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
