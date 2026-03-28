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

## `category` Enum — Current State + v3 Changes

### Currently in DB (`gan_category` PostgreSQL enum)

| `category` value | Hebrew label | Sub-field | Color | Data source |
|---|---|---|---|---|
| `MAON_SYMBOL` | מעון סמל (ויצו/נעמת) | `maon_symbol_code` | 🔵 Blue | data.gov.il (`maon_type_code = 0`) |
| `MISHPACHTON` | משפחתון | `mishpachton_affiliation`: `TAMAT` / `PRIVATE` | 🔵 / 🟠 | Scraper (name inference) |
| `PRIVATE_GAN` | גן פרטי | `private_supervision`: `SUPERVISED` / `NOT_SUPERVISED` | 🟢 / 🟠 | Scraper (name inference) |
| `MUNICIPAL_GAN` | גן עירייה | `municipal_grade`: `TTAH` / `TAH` / `HOVA` | 🔵 Blue | Scraper (name inference) |
| `UNSPECIFIED` | לא ידוע | — | ⚫ Gray | Scraper (no match) |

### The problem: gov import sets everything to `MAON_SYMBOL`

All rows imported from `data.gov.il` are currently stored as `MAON_SYMBOL` regardless of their real type. The actual type is in `metadata->'gov'->>'maon_type_code'`:

| `maon_type_code` | Real type | Current category | Correct category |
|---|---|---|---|
| `0` | מעון סמל | `MAON_SYMBOL` | `MAON_SYMBOL` ✅ |
| `1` | משפחתון סמל | `MAON_SYMBOL` | `MISHPACHTON` (affiliation=`TAMAT`) ❌ needs fix |
| `2` | צהרון | `MAON_SYMBOL` | `TZAHARON_MUNICIPAL` ❌ needs fix |

### New enum values added in v3

| New `category` value | Hebrew label | גיל | Color | How rows get in |
|---|---|---|---|---|
| `TZAHARON_MUNICIPAL` | גן + צהרון עירוני | +3 | 🔵 Blue | Backfill from `maon_type_code = 2` + future gov import |
| `TZAHARON_PRIVATE_SUPERVISED` | צהרון פרטי בפיקוח | +3 | 🟢 Green | Community-contributed (suggest a gan) |
| `TZAHARON_PRIVATE_UNSUPERVISED` | צהרון פרטי ללא פיקוח | +3 | 🟠 Orange | Community-contributed (suggest a gan) |

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

## Data Sources per Type

Not all types exist in the DB today — some depend on community contributions.

| Type | Exists today? | Source |
|---|---|---|
| מעון סמל | ✅ Yes | data.gov.il (type 0) |
| משפחתון סמל | ✅ Yes (wrongly labeled as MAON_SYMBOL) | data.gov.il (type 1) |
| צהרון עירוני | ✅ Yes (wrongly labeled as MAON_SYMBOL) | data.gov.il (type 2) |
| משפחתון פרטי | Partial (scraper) | Community suggest |
| גן פרטי בפיקוח | Partial (scraper) | Community suggest |
| גן פרטי ללא פיקוח | Partial (scraper) | Community suggest |
| גן עירייה (בוקר בלבד) | Partial (scraper) | Community suggest |
| צהרון פרטי בפיקוח | ❌ No | Community suggest only |
| צהרון פרטי ללא פיקוח | ❌ No | Community suggest only |

---

## Reviews — Gan vs. Tzaharon

When a parent submits a review for a +3 framework, the review form defaults to **"הגן והצהרון יחד"** but can be changed to:
- הגן (בוקר בלבד)
- הצהרון
- שניהם יחד

This lets the community gradually build separate morning/afternoon signal without a data migration upfront.

---

## Explanatory Page (v3)

The explanatory page (accessible from the landing screen and from within the main app) will display:
- The full type table (Hebrew)
- The color legend: 🔵 ממלכתי · 🟢 בפיקוח פרטי · 🟠 ללא פיקוח
- The icon legend with short parent-friendly descriptions per type

This gives parents context to understand what they're looking at on the map before or during their search.
