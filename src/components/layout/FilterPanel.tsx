"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Filter, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { GanFilters } from "@/types/filters";
import type { FridaySchedule, MealType, KosherStatus, SpokenLanguage, VacancyStatus } from "@/types/ganim";
import type { SearchSuggestion } from "@/types/search";

interface FilterPanelProps {
  filters: GanFilters;
  onFiltersChange: (f: GanFilters) => void;
  onClear: () => void;
  activeCount: number;
  onSearchSelect?: (s: SearchSuggestion) => void;
}

const FRIDAY_OPTS: { value: FridaySchedule; label: string }[] = [
  { value: "NONE", label: "ללא שישי" },
  { value: "EVERY_FRIDAY", label: "כל שישי" },
  { value: "EVERY_OTHER_FRIDAY", label: "כל שבועיים" },
];

const MEAL_OPTS: { value: MealType; label: string }[] = [
  { value: "IN_HOUSE_COOK", label: "בישול במקום" },
  { value: "EXTERNAL_CATERING", label: "קייטרינג חיצוני" },
  { value: "PARENTS_BRING", label: "הורים מביאים" },
  { value: "MIXED", label: "מעורב" },
];

const KOSHER_OPTS: { value: KosherStatus; label: string }[] = [
  { value: "CERTIFIED", label: "כשר" },
  { value: "NOT_CERTIFIED", label: "לא כשר" },
];

const VACANCY_OPTS: { value: VacancyStatus; label: string }[] = [
  { value: "Available", label: "יש מקום" },
  { value: "Limited", label: "מקומות מוגבלים" },
  { value: "Full", label: "מלא" },
];

const LANG_OPTS: { value: SpokenLanguage; label: string }[] = [
  { value: "HEBREW", label: "עברית" },
  { value: "ENGLISH", label: "אנגלית" },
  { value: "RUSSIAN", label: "רוסית" },
  { value: "ARABIC", label: "ערבית" },
];

export function FilterPanel({
  filters,
  onFiltersChange,
  onClear,
  activeCount,
  onSearchSelect,
}: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const update = (patch: Partial<GanFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  useEffect(() => {
    const q = (filters.location_query ?? "").trim();
    if (q.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        const res = await fetch(`/api/geocode/suggest?${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: SearchSuggestion[] };
        const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(next);
        setShowSuggestions(next.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [filters.location_query]);

  const chooseSuggestion = useCallback(
    (s: SearchSuggestion) => {
      setSuggestions([]);
      setShowSuggestions(false);
      const isCity = s.place_type?.includes("place") && !s.place_type?.includes("address");
      const isAddressOrPoi =
        s.place_type?.includes("address") || s.place_type?.includes("poi");
      if (isAddressOrPoi || (!isCity && (s.place_type?.length ?? 0) === 0)) {
        onFiltersChange({ ...filters, location_query: null });
        onSearchSelect?.(s);
      } else {
        onFiltersChange({ ...filters, location_query: s.place_name });
      }
    },
    [filters, onFiltersChange, onSearchSelect]
  );

  const toggleLang = (lang: SpokenLanguage) => {
    const current = filters.languages_spoken ?? [];
    const next = current.includes(lang)
      ? current.filter((l) => l !== lang)
      : [...current, lang];
    update({ languages_spoken: next.length ? next : null });
  };

  return (
    <div className="border-b border-gan-accent/30 shrink-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm font-hebrew text-gan-dark hover:bg-gan-muted/20"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          סינון
          {activeCount > 0 && (
            <span className="bg-gan-primary text-white text-xs px-2 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 text-xs text-gan-primary hover:underline font-hebrew"
            >
              <X className="w-3 h-3" />
              נקה סינון
            </button>
          )}

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">מיקום (עיר / כתובת)</label>
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="search"
                placeholder="חיפוש לפי עיר או כתובת..."
                value={filters.location_query ?? ""}
                onChange={(e) => update({ location_query: e.target.value || null })}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="w-full pe-10 ps-10 py-2 rounded-lg border border-gan-accent/50 focus:outline-none focus:ring-2 focus:ring-gan-primary/50 text-sm font-hebrew"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full start-0 end-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gan-accent/50 bg-white shadow-lg z-50">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-start px-4 py-2 text-sm font-hebrew hover:bg-gan-muted/30 border-b border-gan-accent/20 last:border-b-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        chooseSuggestion(s);
                      }}
                    >
                      {s.place_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">ימי שישי</label>
            <div className="flex flex-wrap gap-2">
              {FRIDAY_OPTS.map((o) => {
                const selected = (filters.friday_schedule ?? []).includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-1 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const curr = filters.friday_schedule ?? [];
                        const next = selected
                          ? curr.filter((v) => v !== o.value)
                          : [...curr, o.value];
                        update({ friday_schedule: next.length ? next : null });
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">סוג אוכל</label>
            <div className="flex flex-wrap gap-2">
              {MEAL_OPTS.map((o) => {
                const selected = (filters.meal_type ?? []).includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-1 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const curr = filters.meal_type ?? [];
                        const next = selected
                          ? curr.filter((v) => v !== o.value)
                          : [...curr, o.value];
                        update({ meal_type: next.length ? next : null });
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">כשרות</label>
            <div className="flex flex-wrap gap-2">
              {KOSHER_OPTS.map((o) => {
                const selected = (filters.kosher_status ?? []).includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-1 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const curr = filters.kosher_status ?? [];
                        const next = selected
                          ? curr.filter((v) => v !== o.value)
                          : [...curr, o.value];
                        update({ kosher_status: next.length ? next : null });
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">מקום פנוי</label>
            <div className="flex flex-wrap gap-2">
              {VACANCY_OPTS.map((o) => {
                const selected = (filters.vacancy_status ?? []).includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-1 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const curr = filters.vacancy_status ?? [];
                        const next = selected
                          ? curr.filter((v) => v !== o.value)
                          : [...curr, o.value];
                        update({ vacancy_status: next.length ? next : null });
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">מחיר מקסימום (₪)</label>
            <input
              type="number"
              value={filters.max_price_nis ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({ max_price_nis: v ? Number(v) : null });
              }}
              placeholder="הכל"
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">דיאטה</label>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-vegan"
                  checked={filters.vegan_friendly === true}
                  onChange={(e) =>
                    update({ vegan_friendly: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-vegan" className="text-sm font-hebrew">טבעוני</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-veg"
                  checked={filters.vegetarian_friendly === true}
                  onChange={(e) =>
                    update({ vegetarian_friendly: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-veg" className="text-sm font-hebrew">צמחוני</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-meat"
                  checked={filters.meat_served === true}
                  onChange={(e) =>
                    update({ meat_served: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-meat" className="text-sm font-hebrew">בשר</label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">אחר</label>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-allergy"
                  checked={filters.allergy_friendly === true}
                  onChange={(e) =>
                    update({ allergy_friendly: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-allergy" className="text-sm font-hebrew">אלרגיות</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-firstaid"
                  checked={filters.first_aid_trained === true}
                  onChange={(e) =>
                    update({ first_aid_trained: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-firstaid" className="text-sm font-hebrew">עזרה ראשונה</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-outdoor"
                  checked={filters.has_outdoor_space === true}
                  onChange={(e) =>
                    update({ has_outdoor_space: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-outdoor" className="text-sm font-hebrew">חצר</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="checkbox"
                  id="f-mamad"
                  checked={filters.has_mamad === true}
                  onChange={(e) =>
                    update({ has_mamad: e.target.checked ? true : null })
                  }
                />
                <label htmlFor="f-mamad" className="text-sm font-hebrew">ממ&quot;ד / מיקלט</label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">שפות (חייב)</label>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTS.map((o) => (
                <div key={o.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id={`f-lang-${o.value}`}
                    checked={(filters.languages_spoken ?? []).includes(o.value)}
                    onChange={() => toggleLang(o.value)}
                  />
                  <label htmlFor={`f-lang-${o.value}`} className="text-sm font-hebrew">
                    {o.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">שעות פעילות (מכיל)</label>
            <input
              type="text"
              value={filters.operating_hours ?? ""}
              onChange={(e) =>
                update({
                  operating_hours: e.target.value.trim() ? e.target.value.trim() : null,
                })
              }
              placeholder="7:30, 8:00, 16:00..."
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">חוג (מכיל)</label>
            <input
              type="text"
              value={filters.chugim_has ?? ""}
              onChange={(e) =>
                update({
                  chugim_has: e.target.value.trim() ? e.target.value.trim() : null,
                })
              }
              placeholder="מוזיקה, אמנות..."
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
            />
          </div>
        </div>
      )}
    </div>
  );
}
