# GanMatch — Gan Type Reference

This document is the canonical reference for childcare framework types in Israel, how they map to the app's `category` enum, icons, and colors — and what each type means for parents.

---

## Type Table

For 3+ frameworks, a location can appear in 3 states on the map. **גן + צהרון** is the default combined state — the icon used is the tzaharon icon since parents are searching for a full-day solution.

<table>
<thead>
<tr>
<th>פין במפה</th>
<th>סוג המסגרת</th>
<th>גיל</th>
<th>פיקוח</th>
<th>סבסוד / מחיר</th>
<th>הערות לאפליקציה</th>
</tr>
</thead>
<tbody>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#3B82F6;font-size:18px;">🏛️</span></td>
<td>מעון סמל (ויצו/נעמת)</td>
<td>0–3</td>
<td>✅ מלא</td>
<td>✅ לפי דרגה</td>
<td>מחיר מפוקח, סבסוד לפי הכנסה</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#3B82F6;font-size:18px;">🏠</span></td>
<td>משפחתון סמל (משרד העבודה)</td>
<td>0–3</td>
<td>✅ מלא</td>
<td>✅ לפי דרגה</td>
<td>עד 5 ילדים בבית מטפלת, סבסוד כמו במעון</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#F97316;font-size:18px;">🏠</span></td>
<td>משפחתון פרטי (ביתי)</td>
<td>0–3</td>
<td>❌</td>
<td>❌ מחיר שוק</td>
<td>לרוב ללא פיקוח ממשלתי, מחיר יקר</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#22C55E;font-size:18px;">🧩</span></td>
<td>גן פרטי בפיקוח</td>
<td>0–3 / +3</td>
<td>✅ חלקי</td>
<td>❌ מחיר שוק</td>
<td>פיקוח בטיחותי/פדגוגי בסיסי, אין סבסוד</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#F97316;font-size:18px;">🧩</span></td>
<td>גן פרטי ללא פיקוח</td>
<td>0–3 / +3</td>
<td>❌</td>
<td>❌ מחיר שוק</td>
<td>"המערב הפרוע", אחריות מלאה על ההורה</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#3B82F6;font-size:18px;">🏙️</span></td>
<td>גן עירייה — בוקר בלבד</td>
<td>+3</td>
<td>✅ מלא</td>
<td>✅ חינם</td>
<td>חוק חינוך חינם, עד ~14:00</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#3B82F6;font-size:18px;position:relative;">🌆</span></td>
<td><strong>גן עירייה + צהרון עירוני ✦</strong></td>
<td>+3</td>
<td>✅ מלא</td>
<td>✅ מחיר מפוקח</td>
<td>סבסוד אוטומטי בערים מסוימות (אשכול למ"ס)</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#3B82F6;font-size:18px;">⏰</span></td>
<td>צהרון עירוני — עצמאי</td>
<td>+3</td>
<td>✅ מלא</td>
<td>✅ מחיר מפוקח</td>
<td>צהרון ללא גן בוקר משויך</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#22C55E;font-size:18px;">🚐</span></td>
<td>צהרון פרטי בפיקוח — עצמאי</td>
<td>+3</td>
<td>✅ בטיחותי</td>
<td>❌ מחיר שוק</td>
<td>יש רישיון הפעלה, איסוף מגן עירוני</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#F97316;font-size:18px;">🚐</span></td>
<td>צהרון פרטי ללא פיקוח — עצמאי</td>
<td>+3</td>
<td>❌</td>
<td>❌ מחיר שוק</td>
<td>צהרוני בית, איסוף מהגן, ללא פיקוח חיצוני</td>
</tr>

<tr>
<td><span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#6B7280;font-size:18px;">📍</span></td>
<td>לא ידוע</td>
<td>—</td>
<td>—</td>
<td>—</td>
<td>נתון חסר</td>
</tr>

</tbody>
</table>

> ✦ = **גן + צהרון** combined — the default state shown on the map for full-day locations.

---

## Color System

Colors convey supervision and subsidy status at a glance. Applies to all icons across all states.

| Color | Meaning | Applies to |
|---|---|---|
| 🔵 Blue | ממלכתי — מפוקח ומסובסד | מעון סמל, משפחתון סמל, גן עירייה, צהרון עירוני |
| 🟢 Green | פיקוח פרטי / חלקי | גן פרטי בפיקוח, צהרון פרטי בפיקוח |
| 🟠 Orange | ללא פיקוח — שים לב | משפחתון פרטי, גן פרטי ללא פיקוח, צהרון פרטי ללא פיקוח |
| ⚫ Gray | לא ידוע | UNSPECIFIED |

---

## `category` enum — database mapping

PostgreSQL enum `gan_category`. Values below are what the app and imports use today. Three tzaharon-related values (`TZAHARON_*`) were added in v3 (migration `supabase/migrations/20260328000000_v3_gan_category_tzaharon.sql`).

### All `category` values

| `category` value | Hebrew label | Sub-field | Color | How rows typically arrive |
|---|---|---|---|---|
| `MAON_SYMBOL` | מעון סמל (ויצו/נעמת) | `maon_symbol_code` | 🔵 Blue | data.gov.il (`maon_type_code = 0`) |
| `MISHPACHTON` | משפחתון | `mishpachton_affiliation`: `TAMAT` / `PRIVATE` | 🔵 / 🟠 | data.gov.il (`maon_type_code = 1`, affiliation `TAMAT`) or scraper / community |
| `PRIVATE_GAN` | גן פרטי | `private_supervision`: `SUPERVISED` / `NOT_SUPERVISED` | 🟢 / 🟠 | Scraper (name inference) / community |
| `MUNICIPAL_GAN` | גן עירייה | `municipal_grade`: `TTAH` / `TAH` / `HOVA` | 🔵 Blue | Scraper (name inference) / community |
| `TZAHARON_MUNICIPAL` | גן + צהרון עירוני | — | 🔵 Blue | data.gov.il (`maon_type_code = 2`) + migration backfill on existing DBs |
| `TZAHARON_PRIVATE_SUPERVISED` | צהרון פרטי בפיקוח | — | 🟢 Green | Community (suggest a gan, edits) |
| `TZAHARON_PRIVATE_UNSUPERVISED` | צהרון פרטי ללא פיקוח | — | 🟠 Orange | Community (suggest a gan, edits) |
| `UNSPECIFIED` | לא ידוע | — | ⚫ Gray | Scraper (no match) / fallback |

### Gov import (`data.gov.il`)

The importer (`scripts/gov_import/import_maon_symbol_datagovil.py`) sets `category` from the registry’s `maon_type_code` (also present under `metadata.gov`):

| `maon_type_code` | Meaning | `category` | Other fields |
|---|---|---|---|
| `0` | מעון סמל | `MAON_SYMBOL` | — |
| `1` | משפחתון סמל | `MISHPACHTON` | `mishpachton_affiliation = TAMAT` |
| `2` | צהרון (רישום משרדי) | `TZAHARON_MUNICIPAL` | — |

**Legacy DBs:** If migrations through `20260328000000_v3_gan_category_tzaharon.sql` have not been applied, older rows may still have types `1` / `2` stored as `MAON_SYMBOL` until that migration (and a fresh import) run.

The parent-facing Type Table at the top distinguishes **גן + צהרון ✦** from **צהרון עירוני עצמאי**; in the DB, municipal facilities coming from this feed as `maon_type_code = 2` share **`TZAHARON_MUNICIPAL`** (one enum for that registry track).

### Icon mapping per category

The DB field that drives the icon is `category`. For `MISHPACHTON` and `PRIVATE_GAN`, a sub-field further determines the color. The icon shape is always the same within a category — only the color changes.

| `category` | DB sub-field | Sub-value | Icon | Color |
|---|---|---|---|---|
| `MAON_SYMBOL` | — | — | 🏛️ | 🔵 |
| `MISHPACHTON` | `mishpachton_affiliation` | `TAMAT` | 🏠 | 🔵 |
| `MISHPACHTON` | `mishpachton_affiliation` | `PRIVATE` | 🏠 | 🟠 |
| `MISHPACHTON` | `mishpachton_affiliation` | `UNKNOWN` / null | 🏠 | ⚫ gray (fallback) |
| `PRIVATE_GAN` | `private_supervision` | `SUPERVISED` | 🧩 | 🟢 |
| `PRIVATE_GAN` | `private_supervision` | `NOT_SUPERVISED` | 🧩 | 🟠 |
| `PRIVATE_GAN` | `private_supervision` | `UNKNOWN` / null | 🧩 | ⚫ gray (fallback) |
| `MUNICIPAL_GAN` | — | — | 🏙️ | 🔵 |
| `TZAHARON_MUNICIPAL` | — | — | 🌆 | 🔵 |
| `TZAHARON_PRIVATE_SUPERVISED` | — | — | 🚐 | 🟢 |
| `TZAHARON_PRIVATE_UNSUPERVISED` | — | — | 🚐 | 🟠 |
| `UNSPECIFIED` | — | — | 📍 | ⚫ |

**Sub-field population status:**
- `mishpachton_affiliation` for gov-imported rows (type 1): set to `TAMAT` by the v3 migration ✅
- `mishpachton_affiliation` for scraper rows: inferred from name patterns — may be `UNKNOWN` for some rows
- `private_supervision` for scraper rows: inferred from `raw_address` content — may be `UNKNOWN` for some rows
- `UNKNOWN` rows show gray fallback icon until a user edit or admin fix populates the sub-field

> `MUNICIPAL_GAN` (🏙️) = morning-only. `TZAHARON_MUNICIPAL` (🌆) = combined gan+tzaharon full-day — this is the ✦ combined state from the type table above.

---

## Data sources per type (vs Type Table above)

Rough mapping from the **Type Table** rows to **whether we usually have rows** and **where they come from**. “Partial” means some listings exist from the municipal scraper / UGC, not necessarily full national coverage.

| Type (as in Type Table) | In DB / map? | Source |
|---|---|---|
| מעון סמל | ✅ Yes | data.gov.il → `MAON_SYMBOL` |
| משפחתון סמל (משרד העבודה) | ✅ Yes | data.gov.il → `MISHPACHTON` + `TAMAT` |
| משפחתון פרטי | Partial | Scraper / name inference → `MISHPACHTON` (`PRIVATE` or unknown) / suggest |
| גן פרטי בפיקוח / ללא פיקוח | Partial | Scraper → `PRIVATE_GAN` / suggest |
| גן עירייה — בוקר בלבד | Partial | Scraper → `MUNICIPAL_GAN` / suggest |
| גן עירייה + צהרון ✦ / צהרון עירוני עצמאי | ✅ Yes (municipal registry track) | data.gov.il type `2` → `TZAHARON_MUNICIPAL` (see note above) |
| צהרון פרטי בפיקוח / ללא פיקוח | When contributed | Suggest a gan / edits → `TZAHARON_PRIVATE_*` |
| לא ידוע | As needed | `UNSPECIFIED` |

---

## Reviews — Gan vs. Tzaharon (`review_scope`)

Only **`TZAHARON_MUNICIPAL`** (גן עירייה + צהרון עירוני — the ✦ combined row above) is both a gan and a tzaharon in one map pin. **`MUNICIPAL_GAN`** is morning-only; **`TZAHARON_PRIVATE_*`** are standalone afternoon frameworks — no morning/tzaharon split on the same entity.

**Planned (v3 — see [V3_PLAN.md](V3_PLAN.md) §6):** For **`TZAHARON_MUNICIPAL`** reviews only, the form should offer **"הגן (בוקר)"**, **"הצהרון"**, **"שניהם"** (default **"שניהם"**) as `review_scope`, flowing through triage into **`confirmed_reviews`**. That flow is **not implemented in the app yet**; the paragraph above explains **why** only this category needs a scope, once reviews support it.

---

## Explanatory Page (v3)

The explanatory page (accessible from the landing screen and from within the main app) will display:
- The full type table (Hebrew)
- The color legend: 🔵 ממלכתי · 🟢 בפיקוח פרטי · 🟠 ללא פיקוח
- The icon legend with short parent-friendly descriptions per type

This gives parents context to understand what they're looking at on the map before or during their search.
