"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS } from "@/types/places";
import type { PlaceCategory } from "@/types/places";

const PAGE_SIZE = 100;
const BUILTIN_CATEGORIES: (PlaceCategory | "other")[] = ["doctor", "clinic", "cafe", "kids", "sport", "attraction", "food", "cosmetics", "other"];
// Triage-only label overrides — the live app's PLACE_CATEGORY_LABELS stay untouched.
const TRIAGE_CATEGORY_LABELS: Record<string, string> = { ...PLACE_CATEGORY_LABELS, kids: "ילדים" };
const CUSTOM_CATS_KEY = "whatsapp_triage_custom_categories";
const HMO_OPTIONS = ["מכבי", "כללית", "מאוחדת", "לאומית"];
const HMO_CATEGORIES = new Set(["doctor", "clinic"]);

type StagingStatus = "pending" | "approved" | "rejected";

// URL helpers — read/write filter state from the address bar
function readUrlParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function syncUrl(status: string, category: string, page: number) {
  const p = new URLSearchParams();
  if (status && status !== "pending") p.set("status", status);
  if (category) p.set("category", category);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

type StagingItem = {
  id: string;
  place_name: string;
  category: string;
  address_hint: string | null;
  recommendation_text: string;
  summary_text: string | null;
  is_summarized: boolean;
  rating: number | null;
  tags: string[] | null;
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
  message_date: string | null;
  specialty: string | null;
  hmo: string[] | null;
  for_children: boolean | null;
  // Kids-category structured fields (kosher/hours/friday_schedule/mamad/cctv)
  kosher: string | null;
  hours: string | null;
  friday_schedule: string | null;
  has_mamad: boolean | null;
  has_cctv: boolean | null;
};

const KOSHER_OPTIONS = [
  { value: "CERTIFIED", label: "כשר" },
  { value: "NOT_CERTIFIED", label: "לא כשר" },
];
const FRIDAY_OPTIONS = [
  { value: "NONE", label: "סגור בשישי" },
  { value: "EVERY_FRIDAY", label: "פתוח כל שישי" },
  { value: "EVERY_OTHER_FRIDAY", label: "שישי שני" },
];

const ENTHUSIASM_STARS: Record<string, string> = {
  high: "⭐⭐⭐⭐⭐",
  medium: "⭐⭐⭐⭐",
  negative: "⭐⭐",
};

const RATING_OPTIONS = [5, 4, 2, 1] as const;
const RATING_LABELS: Record<number, string> = {
  5: "5 — יוצא דופן",
  4: "4 — חיובי",
  2: "2 — שלילי",
  1: "1 — חריף",
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

function formatMessageDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
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

// Custom dropdown — native <select> ignores dir="rtl" in Windows popup, so
// we render our own list of <button> elements inside a dir="rtl" div.
function HebrewSelect({
  value,
  options,
  onChange,
  placeholder = "— בחר —",
  disabled = false,
  triggerClassName = "text-xs rounded border px-2 py-1 bg-white min-w-[8rem]",
  triggerStyle,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative" dir="rtl">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center justify-between gap-1 ${triggerClassName} ${disabled ? "opacity-70 cursor-default" : "cursor-pointer"}`}
        style={triggerStyle}
        dir="rtl"
      >
        <span className={current ? "" : "opacity-50"}>{current?.label ?? placeholder}</span>
        {!disabled && <span className="opacity-50 text-[10px] shrink-0">▾</span>}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-0.5 end-0 min-w-full rounded border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto" dir="rtl">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              dir="rtl"
              className={`block w-full px-3 py-1.5 text-xs hover:bg-gray-50 text-start ${
                value === opt.value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WhatsAppStagingPage() {
  const { user, loading } = useSession();

  // Initialise filter state from URL so reloads preserve the view
  const [status, setStatus] = useState<StagingStatus>(() => {
    const s = readUrlParam("status");
    return (s === "approved" || s === "rejected") ? s : "pending";
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => readUrlParam("category"));
  const [page, setPage] = useState<number>(() => Math.max(1, parseInt(readUrlParam("page") || "1", 10)));
  const [total, setTotal] = useState(0);

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
  const [onlyWithContext, setOnlyWithContext] = useState(false);
  const [missingSummaryOnly, setMissingSummaryOnly] = useState(false);
  const [summaryById, setSummaryById] = useState<Record<string, string>>({});
  const [summarizingById, setSummarizingById] = useState<Record<string, boolean>>({});
  const [batchSummarizing, setBatchSummarizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [ratingById, setRatingById] = useState<Record<string, number>>({});
  const [tagsById, setTagsById] = useState<Record<string, string>>({});

  // Enrichment fields — local overrides on top of DB values
  const [specialtyById, setSpecialtyById] = useState<Record<string, string>>({});
  const [hmoById, setHmoById] = useState<Record<string, string[]>>({});
  const [forChildrenById, setForChildrenById] = useState<Record<string, boolean | null>>({});

  // Kids-category structured fields
  const [kosherById, setKosherById] = useState<Record<string, string>>({});
  const [hoursById, setHoursById] = useState<Record<string, string>>({});
  const [fridayById, setFridayById] = useState<Record<string, string>>({});
  const [mamadById, setMamadById] = useState<Record<string, boolean | null>>({});
  const [cctvById, setCctvById] = useState<Record<string, boolean | null>>({});

  // Specialty taxonomy
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  const [tagTaxonomy, setTagTaxonomy] = useState<Record<string, string[]>>({});
  const [showAddSpecialtyId, setShowAddSpecialtyId] = useState<string | null>(null);
  const [addSpecialtyText, setAddSpecialtyText] = useState<Record<string, string>>({});

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

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    return supabase.auth.getSession().then(r => r.data.session?.access_token ?? null);
  }, []);

  // Coordinated filter setters — always reset to page 1 and sync URL
  const changeStatus = useCallback((s: StagingStatus) => {
    setStatus(s); setPage(1); syncUrl(s, categoryFilter, 1);
  }, [categoryFilter]);

  const changeCategoryFilter = useCallback((c: string) => {
    setCategoryFilter(c); setPage(1); syncUrl(status, c, 1);
  }, [status]);

  const changePage = useCallback((p: number) => {
    setPage(p); syncUrl(status, categoryFilter, p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [status, categoryFilter]);

  const changeOnlyWithContext = useCallback((v: boolean) => {
    setOnlyWithContext(v); setPage(1); syncUrl(status, categoryFilter, 1);
  }, [status, categoryFilter]);

  const changeMissingSummaryOnly = useCallback((v: boolean) => {
    setMissingSummaryOnly(v); setPage(1); syncUrl(status, categoryFilter, 1);
  }, [status, categoryFilter]);

  const loadTaxonomy = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [specialtyRes, tagRes] = await Promise.all([
        fetch("/api/admin/whatsapp-staging/taxonomy", { headers: { authorization: `Bearer ${token}` } }),
        fetch("/api/admin/whatsapp-staging/taxonomy?type=tag", { headers: { authorization: `Bearer ${token}` } }),
      ]);
      const specialtyData = await specialtyRes.json().catch(() => ({}));
      if (specialtyRes.ok) setTaxonomy(specialtyData?.taxonomy ?? {});
      const tagData = await tagRes.json().catch(() => ({}));
      if (tagRes.ok) setTagTaxonomy(tagData?.taxonomy ?? {});
    } catch { /* non-critical */ }
  }, [getToken]);

  const loadItems = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing token");
      const offset = (page - 1) * PAGE_SIZE;
      const catParam = categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : "";
      const ctxParam = onlyWithContext ? "&has_context=true" : "";
      const summaryParam = missingSummaryOnly ? "&missing_summary=true" : "";
      const res = await fetch(
        `/api/admin/whatsapp-staging?status=${status}&limit=${PAGE_SIZE}&offset=${offset}${catParam}${ctxParam}${summaryParam}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
      setItems([]);
    } finally {
      setReloading(false);
    }
  }, [status, user, categoryFilter, page, onlyWithContext, missingSummaryOnly, getToken]);

  useEffect(() => { if (user) { loadItems(); loadTaxonomy(); } }, [user, loadItems, loadTaxonomy]);

  const patchField = useCallback(async (id: string, fields: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) return;
    try {
      await fetch("/api/admin/whatsapp-staging", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, ...fields }),
      });
    } catch { /* non-critical */ }
  }, [getToken]);

  const patchCategory = useCallback(async (id: string, category: string) => {
    setCategoryById(prev => ({ ...prev, [id]: category }));
    patchField(id, { category });
  }, [patchField]);

  const patchSpecialty = useCallback(async (id: string, specialty: string) => {
    setSpecialtyById(prev => ({ ...prev, [id]: specialty }));
    patchField(id, { specialty: specialty || null });
  }, [patchField]);

  const saveSummary = useCallback((id: string, text: string) => {
    patchField(id, { summary_text: text });
  }, [patchField]);

  const saveRating = useCallback((id: string, rating: number) => {
    setRatingById(prev => ({ ...prev, [id]: rating }));
    patchField(id, { rating });
  }, [patchField]);

  const saveTags = useCallback((id: string, tagsText: string) => {
    const tags = tagsText.split(",").map(t => t.trim()).filter(Boolean);
    patchField(id, { tags });
  }, [patchField]);

  const generateSummary = useCallback(async (id: string) => {
    const token = await getToken();
    if (!token) return;
    setSummarizingById(prev => ({ ...prev, [id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/admin/whatsapp-staging/summarize", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Summarize failed");
      setSummaryById(prev => ({ ...prev, [id]: String(data?.summary ?? "") }));
      if (typeof data?.rating === "number") setRatingById(prev => ({ ...prev, [id]: data.rating }));
      if (Array.isArray(data?.tags)) setTagsById(prev => ({ ...prev, [id]: data.tags.join(", ") }));
      if (data?.kosher) setKosherById(prev => ({ ...prev, [id]: data.kosher }));
      if (data?.hours) setHoursById(prev => ({ ...prev, [id]: data.hours }));
      if (data?.friday_schedule) setFridayById(prev => ({ ...prev, [id]: data.friday_schedule }));
      if (typeof data?.has_mamad === "boolean") setMamadById(prev => ({ ...prev, [id]: data.has_mamad }));
      if (typeof data?.has_cctv === "boolean") setCctvById(prev => ({ ...prev, [id]: data.has_cctv }));
    } catch (e: any) {
      setError(e?.message ?? "Summarize failed");
    } finally {
      setSummarizingById(prev => ({ ...prev, [id]: false }));
    }
  }, [getToken]);

  const summarizeAllMissing = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setBatchSummarizing(true);
    setBatchProgress(0);
    setError(null);
    try {
      let total = 0;
      while (true) {
        const res = await fetch("/api/admin/whatsapp-staging/summarize-batch", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ category: categoryFilter || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Batch summarize failed");
        total += data.processed ?? 0;
        setBatchProgress(total);
        if (!data.processed || data.done) break;
      }
      await loadItems();
      await loadTaxonomy();
    } catch (e: any) {
      setError(e?.message ?? "Batch summarize failed");
    } finally {
      setBatchSummarizing(false);
    }
  }, [categoryFilter, getToken, loadItems, loadTaxonomy]);

  const toggleHmo = useCallback(async (id: string, hmo: string, currentHmo: string[]) => {
    const next = currentHmo.includes(hmo)
      ? currentHmo.filter(h => h !== hmo)
      : [...currentHmo, hmo];
    setHmoById(prev => ({ ...prev, [id]: next }));
    patchField(id, { hmo: next });
  }, [patchField]);

  const patchForChildren = useCallback(async (id: string, value: boolean | null) => {
    setForChildrenById(prev => ({ ...prev, [id]: value }));
    patchField(id, { for_children: value });
  }, [patchField]);

  const patchKosher = useCallback((id: string, value: string) => {
    setKosherById(prev => ({ ...prev, [id]: value }));
    patchField(id, { kosher: value || null });
  }, [patchField]);

  const saveHours = useCallback((id: string, value: string) => {
    patchField(id, { hours: value.trim() || null });
  }, [patchField]);

  const patchFriday = useCallback((id: string, value: string) => {
    setFridayById(prev => ({ ...prev, [id]: value }));
    patchField(id, { friday_schedule: value || null });
  }, [patchField]);

  const patchMamad = useCallback((id: string, value: boolean | null) => {
    setMamadById(prev => ({ ...prev, [id]: value }));
    patchField(id, { has_mamad: value });
  }, [patchField]);

  const patchCctv = useCallback((id: string, value: boolean | null) => {
    setCctvById(prev => ({ ...prev, [id]: value }));
    patchField(id, { has_cctv: value });
  }, [patchField]);

  // Park a row as category=other/specialty=unknown without approving or rejecting it —
  // stays pending so it can be revisited later, just out of the way for now.
  const ignoreItem = useCallback(async (id: string) => {
    setCategoryById(prev => ({ ...prev, [id]: "other" }));
    setSpecialtyById(prev => ({ ...prev, [id]: "unknown" }));
    await patchField(id, { category: "other", specialty: "unknown" });
    setItems(prev => prev.filter(i => i.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  }, [patchField]);

  const addSpecialty = useCallback(async (id: string, category: string) => {
    const name = (addSpecialtyText[id] ?? "").trim();
    if (!name) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/admin/whatsapp-staging/taxonomy", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, name }),
      });
      if (!res.ok) return;
      setTaxonomy(prev => ({
        ...prev,
        [category]: Array.from(new Set([...(prev[category] ?? []), name])).sort((a, b) => a.localeCompare(b, "he")),
      }));
      setSpecialtyById(prev => ({ ...prev, [id]: name }));
      patchField(id, { specialty: name });
      setShowAddSpecialtyId(null);
      setAddSpecialtyText(prev => ({ ...prev, [id]: "" }));
    } catch { /* non-critical */ }
  }, [addSpecialtyText, getToken, patchField]);

  const decide = useCallback(async (id: string, action: "approve" | "reject") => {
    if (!supabase || !user) return;
    setBusyId(id);
    setError(null);
    try {
      const token = await getToken();
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
      setTotal(prev => Math.max(0, prev - 1));
    } catch (e: any) {
      setError(e?.message ?? "Decision failed");
    } finally {
      setBusyId(null);
    }
  }, [reasonById, user, getToken, includeTextById]);

  const runMerge = useCallback(async () => {
    if (!supabase || !user) return;
    setMerging(true);
    setMergeResult(null);
    setError(null);
    try {
      const token = await getToken();
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
  }, [user, loadItems, getToken]);

  if (loading) return <div className="p-6 font-hebrew">טוען...</div>;
  if (!user) return <div className="p-6 font-hebrew">נדרשת כניסה לחשבון מנהל.</div>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Group items by merge_group_id for display
  const sections: { groupId: string | null; items: StagingItem[] }[] = [];
  const groupedItems: StagingItem[] = [];
  const ungroupedItems: StagingItem[] = [];
  const seenGroups = new Map<string, StagingItem[]>();
  for (const item of items) {
    if (item.merge_group_id) {
      if (!seenGroups.has(item.merge_group_id)) {
        seenGroups.set(item.merge_group_id, []);
        sections.push({ groupId: item.merge_group_id, items: seenGroups.get(item.merge_group_id)! });
      }
      seenGroups.get(item.merge_group_id)!.push(item);
    } else {
      sections.push({ groupId: null, items: [item] });
    }
  }
  void groupedItems; void ungroupedItems; // unused, grouping done inline above

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
          <button key={s} onClick={() => changeStatus(s)}
            className={`px-3 py-1.5 rounded border text-sm ${status === s ? "bg-[#0A2B6B] text-white border-[#0A2B6B]" : "bg-white"}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <button onClick={loadItems} disabled={reloading} className="px-3 py-1.5 rounded border text-sm bg-white disabled:opacity-50">
          {reloading ? "טוען..." : "רענן"}
        </button>
        <span className="text-sm text-gray-500">
          {total} רשומות
          {totalPages > 1 && ` · עמוד ${page} מתוך ${totalPages}`}
        </span>

        {status === "pending" && (
          <button onClick={runMerge} disabled={merging}
            className="px-3 py-1.5 rounded border text-sm bg-amber-50 border-amber-300 text-amber-800 disabled:opacity-50 mr-auto">
            {merging ? "מנתח..." : "🔍 נתח כפילויות"}
          </button>
        )}
        {status === "approved" && (
          <button onClick={summarizeAllMissing} disabled={batchSummarizing}
            className="px-3 py-1.5 rounded border text-sm bg-indigo-50 border-indigo-300 text-indigo-800 disabled:opacity-50 mr-auto"
            title="מסכם רק רשומות שאושרו ועוד אין להן סיכום — לא נוגע ברשומות שמחכות לאישור">
            {batchSummarizing ? `✨ מסכם... (${batchProgress})` : "✨ סכם הכל (מאושרות ללא סיכום)"}
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 ml-1">קטגוריה:</span>
        <button onClick={() => changeCategoryFilter("")}
          className={`px-3 py-1 rounded-full text-xs border ${categoryFilter === "" ? "bg-[#0A2B6B] text-white border-[#0A2B6B]" : "bg-white"}`}>
          הכל
        </button>
        {allCategories.map(c => (
          <button key={c} onClick={() => changeCategoryFilter(c === categoryFilter ? "" : c)}
            className={`px-3 py-1 rounded-full text-xs border ${categoryFilter === c ? "text-white border-transparent" : "bg-white"}`}
            style={categoryFilter === c ? { background: PLACE_CATEGORY_COLORS[c as PlaceCategory] ?? "#6B7280" } : {}}>
            {TRIAGE_CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer mr-2">
          <input type="checkbox" checked={onlyWithContext}
            onChange={e => changeOnlyWithContext(e.target.checked)} className="w-3.5 h-3.5" />
          יש שאלה מקורית בלבד
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={missingSummaryOnly}
            onChange={e => changeMissingSummaryOnly(e.target.checked)} className="w-3.5 h-3.5" />
          רק ללא סיכום
        </label>
      </div>

      {mergeResult && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{mergeResult}</div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Items */}
      <div className="space-y-3">
        {reloading && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
            <svg className="animate-spin h-5 w-5 text-[#0A2B6B]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            טוען...
          </div>
        )}
        {!reloading && sections.length === 0 && (
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
              const displayMessages = item.source_messages ?? [];
              const hasContext = displayMessages.length > 0;

              const effectiveSummary = item.id in summaryById ? summaryById[item.id] : (item.summary_text ?? "");
              const effectiveRating = ratingById[item.id] ?? item.rating ?? 4;
              const effectiveTags = item.id in tagsById ? tagsById[item.id] : (item.tags ?? []).join(", ");
              const effectiveSpecialty = specialtyById[item.id] ?? item.specialty ?? "";
              const effectiveHmo = hmoById[item.id] ?? item.hmo ?? [];
              const effectiveForChildren = item.id in forChildrenById ? forChildrenById[item.id] : item.for_children;
              const effectiveKosher = kosherById[item.id] ?? item.kosher ?? "";
              const effectiveHours = item.id in hoursById ? hoursById[item.id] : (item.hours ?? "");
              const effectiveFriday = fridayById[item.id] ?? item.friday_schedule ?? "";
              const effectiveMamad = item.id in mamadById ? mamadById[item.id] : item.has_mamad;
              const effectiveCctv = item.id in cctvById ? cctvById[item.id] : item.has_cctv;
              const showHmoSection = HMO_CATEGORIES.has(effectiveCat);
              const showKidsSection = effectiveCat === "kids";
              const catTaxonomy = taxonomy[effectiveCat] ?? [];
              const isPending = status === "pending";

              return (
                <section key={item.id} className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
                  {/* Title row */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold">{item.place_name}</span>
                        <HebrewSelect
                          value={effectiveCat}
                          options={allCategories.map(c => ({ value: c, label: TRIAGE_CATEGORY_LABELS[c] ?? c }))}
                          onChange={cat => patchCategory(item.id, cat)}
                          disabled={!isPending}
                          triggerClassName="text-xs font-semibold px-2 py-0.5 rounded-full text-white border-0"
                          triggerStyle={{ background: catColor }}
                        />
                        <span className="text-base">{ENTHUSIASM_STARS[item.enthusiasm]}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatMessageDate(item.message_date) ?? `יובא ${formatAge(item.created_at)}`} · {item.source_file ?? "—"}
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

                  {/* Enrichment fields */}
                  <div className="space-y-2">
                    {/* Specialty */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 w-14 shrink-0">התמחות:</span>
                      {isPending ? (
                        <>
                          <HebrewSelect
                            value={effectiveSpecialty}
                            options={[
                              ...catTaxonomy.map(s => ({ value: s, label: s })),
                              { value: "__NEW__", label: "+ הוסף חדש..." },
                            ]}
                            onChange={v => {
                              if (v === "__NEW__") {
                                setShowAddSpecialtyId(item.id);
                              } else {
                                setShowAddSpecialtyId(null);
                                patchSpecialty(item.id, v);
                              }
                            }}
                          />
                          {showAddSpecialtyId === item.id && (
                            <div className="flex gap-1 items-center">
                              <input
                                value={addSpecialtyText[item.id] ?? ""}
                                onChange={e => setAddSpecialtyText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                onKeyDown={e => e.key === "Enter" && addSpecialty(item.id, effectiveCat)}
                                placeholder="שם התמחות..."
                                autoFocus
                                dir="rtl"
                                className="text-xs rounded border px-2 py-1 w-32"
                              />
                              <button onClick={() => addSpecialty(item.id, effectiveCat)}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">שמור</button>
                              <button onClick={() => setShowAddSpecialtyId(null)}
                                className="text-xs px-2 py-1 rounded border text-gray-600">ביטול</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-700">{effectiveSpecialty || "—"}</span>
                      )}
                    </div>

                    {/* HMO checkboxes */}
                    {showHmoSection && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 w-14 shrink-0">קופת חולים:</span>
                        {HMO_OPTIONS.map(hmo => (
                          <label key={hmo} className="flex items-center gap-1 text-xs cursor-pointer select-none">
                            <input type="checkbox" checked={effectiveHmo.includes(hmo)} disabled={!isPending}
                              onChange={() => toggleHmo(item.id, hmo, effectiveHmo)} className="w-3.5 h-3.5" />
                            {hmo}
                          </label>
                        ))}
                      </div>
                    )}

                    {/* For children */}
                    {showHmoSection && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-14 shrink-0">לילדים:</span>
                        {isPending ? (
                          <div className="flex gap-2 text-xs">
                            {([true, false, null] as const).map(val => (
                              <label key={String(val)} className="flex items-center gap-1 cursor-pointer select-none">
                                <input type="radio" name={`for_children_${item.id}`}
                                  checked={effectiveForChildren === val}
                                  onChange={() => patchForChildren(item.id, val)} className="w-3.5 h-3.5" />
                                {val === true ? "כן" : val === false ? "לא" : "לא ידוע"}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-700">
                            {effectiveForChildren === true ? "כן" : effectiveForChildren === false ? "לא" : "—"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Kids structured fields */}
                    {showKidsSection && (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 w-14 shrink-0">כשרות:</span>
                          {isPending ? (
                            <HebrewSelect value={effectiveKosher} options={KOSHER_OPTIONS}
                              onChange={v => patchKosher(item.id, v)} />
                          ) : (
                            <span className="text-xs text-gray-700">{KOSHER_OPTIONS.find(o => o.value === effectiveKosher)?.label ?? "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 w-14 shrink-0">שעות:</span>
                          {isPending ? (
                            <input value={effectiveHours}
                              onChange={e => setHoursById(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onBlur={e => saveHours(item.id, e.target.value)}
                              placeholder="למשל: 7:30–16:30" dir="rtl"
                              className="text-xs rounded border px-2 py-1 flex-1 min-w-[8rem]" />
                          ) : (
                            <span className="text-xs text-gray-700">{effectiveHours || "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 w-14 shrink-0">ימי שישי:</span>
                          {isPending ? (
                            <HebrewSelect value={effectiveFriday} options={FRIDAY_OPTIONS}
                              onChange={v => patchFriday(item.id, v)} />
                          ) : (
                            <span className="text-xs text-gray-700">{FRIDAY_OPTIONS.find(o => o.value === effectiveFriday)?.label ?? "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-14 shrink-0">ממ&quot;ד:</span>
                          {isPending ? (
                            <div className="flex gap-2 text-xs">
                              {([true, false, null] as const).map(val => (
                                <label key={String(val)} className="flex items-center gap-1 cursor-pointer select-none">
                                  <input type="radio" name={`mamad_${item.id}`}
                                    checked={effectiveMamad === val}
                                    onChange={() => patchMamad(item.id, val)} className="w-3.5 h-3.5" />
                                  {val === true ? "כן" : val === false ? "לא" : "לא ידוע"}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-700">
                              {effectiveMamad === true ? "כן" : effectiveMamad === false ? "לא" : "—"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-14 shrink-0">מצלמות:</span>
                          {isPending ? (
                            <div className="flex gap-2 text-xs">
                              {([true, false, null] as const).map(val => (
                                <label key={String(val)} className="flex items-center gap-1 cursor-pointer select-none">
                                  <input type="radio" name={`cctv_${item.id}`}
                                    checked={effectiveCctv === val}
                                    onChange={() => patchCctv(item.id, val)} className="w-3.5 h-3.5" />
                                  {val === true ? "כן" : val === false ? "לא" : "לא ידוע"}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-700">
                              {effectiveCctv === true ? "כן" : effectiveCctv === false ? "לא" : "—"}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Source context */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setExpandedContext(prev => ({ ...prev, [item.id]: !contextOpen }))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {contextOpen ? "▲ הסתר הקשר" : "▼ הצג שאלה מקורית"}
                      </button>
                      <button
                        onClick={() => window.open(`/admin/whatsapp/context/${item.id}`, "_blank")}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        🗨️ פתח שיחה מקורית
                      </button>
                    </div>

                    {contextOpen && (
                      <div className="mt-2 space-y-1 rounded bg-blue-50 border border-blue-100 px-3 py-2">
                        {hasContext ? (
                          displayMessages.map((msg, i) => (
                            <p key={i} className="text-xs text-blue-800 leading-relaxed">{msg}</p>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">אין שאלת מקור עדיין</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Verbatim original — admin-only context, never published */}
                  <div>
                    <div className="text-xs text-gray-400 mb-1">טקסט מקורי (לעיניי מנהל בלבד, לא מתפרסם):</div>
                    <blockquote className="rounded bg-gray-50 border-r-4 border-gray-300 px-3 py-2 text-sm text-gray-800 leading-relaxed">
                      {item.recommendation_text}
                    </blockquote>
                  </div>

                  {/* Anonymized summary — this is what gets published */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">
                        סיכום לפרסום (אנונימי){!isPending && item.is_summarized && " — מפורסם"}:
                      </span>
                      <button type="button" onClick={() => generateSummary(item.id)} disabled={!!summarizingById[item.id]}
                        className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 shrink-0">
                        {summarizingById[item.id] ? "מסכם..." : "✨ הצע סיכום"}
                      </button>
                    </div>
                    <textarea
                      value={effectiveSummary}
                      onChange={e => setSummaryById(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={e => saveSummary(item.id, e.target.value)}
                      placeholder="לחץ/י על 'הצע סיכום', או כתוב/י כאן סיכום ידני..."
                      className="w-full rounded border p-2 text-sm resize-none bg-indigo-50/40 border-indigo-200" rows={2}
                    />
                    {effectiveSummary.trim() === "" && isPending && (
                      <p className="text-xs text-amber-600">
                        אין סיכום עדיין — אם אין מידע נוסף מעבר לשם המקום, אפשר לאשר ככוכבים בלבד (בטל/י את הסימון מטה). באישור, אם השדה ריק ייווצר סיכום אוטומטית.
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="text-xs text-gray-500 shrink-0">דירוג:</span>
                      {RATING_OPTIONS.map(r => (
                        <button key={r} type="button" onClick={() => saveRating(item.id, r)}
                          className={`text-xs px-2 py-1 rounded border ${effectiveRating === r ? "bg-[#0A2B6B] text-white border-[#0A2B6B]" : "bg-white"}`}>
                          {RATING_LABELS[r]}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 shrink-0">תגיות:</span>
                      <input
                        value={effectiveTags}
                        onChange={e => setTagsById(prev => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={e => saveTags(item.id, e.target.value)}
                        placeholder="מופרד בפסיקים, למשל: ידידותי לחיות מחמד, מחיר נוח"
                        dir="rtl"
                        className="flex-1 rounded border px-2 py-1 text-xs"
                      />
                    </div>
                    {(tagTaxonomy[effectiveCat] ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(tagTaxonomy[effectiveCat] ?? []).map(tag => {
                          const current = effectiveTags.split(",").map(t => t.trim()).filter(Boolean);
                          const active = current.includes(tag);
                          return (
                            <button key={tag} type="button"
                              onClick={() => {
                                const next = active ? current.filter(t => t !== tag) : [...current, tag];
                                const text = next.join(", ");
                                setTagsById(prev => ({ ...prev, [item.id]: text }));
                                saveTags(item.id, text);
                              }}
                              className={`text-xs px-2 py-0.5 rounded-full border ${active ? "bg-indigo-100 border-indigo-300 text-indigo-800" : "bg-white text-gray-500"}`}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Reviewer */}
                  <div className="text-xs text-gray-500">
                    ממליץ/ה: <span className="font-medium text-gray-700">{item.reviewer_name}</span>
                  </div>

                  {/* Actions (pending only) */}
                  {isPending && (
                    <div className="flex flex-col gap-2 pt-1">
                      <textarea placeholder="סיבה (אופציונלי)" value={reasonById[item.id] ?? ""}
                        onChange={e => setReasonById(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full rounded border p-2 text-sm resize-none" rows={2} />
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <input type="checkbox" checked={includeTextById[item.id] !== false}
                          onChange={e => setIncludeTextById(prev => ({ ...prev, [item.id]: e.target.checked }))}
                          className="w-4 h-4" />
                        כלול טקסט המלצה
                      </label>
                      <div className="flex gap-2">
                        <button disabled={busyId === item.id} onClick={() => decide(item.id, "approve")}
                          className="px-4 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                          ✓ אשר
                        </button>
                        <button disabled={busyId === item.id} onClick={() => decide(item.id, "reject")}
                          className="px-4 py-1.5 rounded bg-rose-600 text-white text-sm font-semibold disabled:opacity-50">
                          ✕ דחה
                        </button>
                        <button disabled={busyId === item.id} onClick={() => ignoreItem(item.id)}
                          className="px-4 py-1.5 rounded bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50">
                          🙈 התעלם
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Review result (approved/rejected) */}
                  {!isPending && (
                    <div className="text-xs text-gray-500">
                      {status === "approved" ? "אושר" : "נדחה"} ע&quot;י {item.reviewed_by ?? "—"} · {formatDate(item.reviewed_at)}
                      {item.moderation_reason && <span> · {item.moderation_reason}</span>}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 pb-4">
          <button disabled={page <= 1 || reloading} onClick={() => changePage(page - 1)}
            className="px-3 py-1.5 rounded border text-sm bg-white disabled:opacity-40">
            הקודם ←
          </button>
          <span className="text-sm text-gray-600">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} מתוך {total}
          </span>
          <button disabled={page >= totalPages || reloading} onClick={() => changePage(page + 1)}
            className="px-3 py-1.5 rounded border text-sm bg-white disabled:opacity-40">
            → הבא
          </button>
        </div>
      )}
    </main>
  );
}
