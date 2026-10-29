# UI/UX Refresh — Plan

Handoff for the UI session (prepared 2026-10-29). Work in this worktree (`GanMatch-ui`, branch `ui-ux-refresh`, based on `whatsapp-review-triage`). Another Claude session keeps working on the WhatsApp triage in the main `GanMatch` folder at the same time, so stay inside the files listed under **Your area**.

Read `CLAUDE.md` first. It describes the older `ganim_v2` app; the live app is the `places` app (`src/components/places/*`, `src/components/home/HomeMap.tsx`, `src/types/places.ts`, `src/types/place-filters.ts`, `src/lib/apply-place-filters.ts`). Its rules still hold: Hebrew-only UI, RTL with `start`/`end` (never `left`/`right`), ask before any state-changing action (DB writes, migrations, git push, deploys).

## How to run

- `npm run dev -- -p 3001` (port 3000 is the triage session's dev server).
- The user checks localhost herself. Don't drive the browser; after a change, run `npx tsc --noEmit -p .` and `npx next lint`, then hand her a short checklist of what to click and what to expect.

## Your area (and what to leave alone)

- **Yours:** `src/components/places/*`, `src/components/home/*`, `src/components/auth/*`, `src/app/place/*`, `src/app/layout.tsx`, `src/types/place-filters.ts`, `src/lib/apply-place-filters.ts`, `src/types/places.ts` (labels only).
- **Leave alone** (the triage session edits these): `src/app/admin/whatsapp/*`, `src/app/api/admin/whatsapp-staging/*`, `src/lib/whatsapp-summarize.ts`, `src/lib/whatsapp-geocode.ts`.
- Commit on `ui-ux-refresh`. Don't merge into `main` or push without asking.

## Data you're designing for (2026-10-29)

| Category | Places | On the map | Fields with real data |
|---|---|---|---|
| Kids (`ילדים`) | 175 | 137 | `gan_category` 116 (82 are municipal צהרונים from government data), `specialty` = kids type 71; almost every other kids field has 1–2 places |
| Doctors | 59 | 24 | `specialty` 59, `for_children` 48, `hmo` 42 |
| Cosmetics | 13 | 5 | `specialty` 11 |

These numbers grow fast: the user is approving ~1,000 WhatsApp recommendations, and approval now fills type/specialty, `for_children`, health fund, gan facts and `chugim_types` (fixed list in `src/lib/whatsapp-summarize.ts`, `CHUGIM_TYPES`). Re-count with a read-only query before tuning thresholds.

Type values live in the `specialty_taxonomy` table:
- **kids:** גני ילדים, בייביסיטר, חוגים, שחייה, משחקייה, סדנאות
- **doctor:** ~27, e.g. רופא ילדים, עור, אף אוזן גרון, עיניים, גינקולוג, יועצת הנקה…
- **cosmetics:** שיער, מספרת ילדים, ציפורניים, פדיקור, גבות…

## The work, in order

1. **Desktop filters.** The user says "the web version of the filtering is awful". Desktop reuses the phone bottom sheet (`FilterSheet` in `PlaceFeedPanel.tsx`: full width `left-0 right-0 bottom-0`, 88% height, drag handle). It hides the map and the list, and changes only apply on close. Plan: an inline, collapsible "סינון" inside the 360px feed panel, live apply, and a row of active-filter chips above the list (each with ✕). Keep the phone sheet.
2. **One category at a time** (the user's idea, agreed). Tabs ילדים / רופאים / קוסמטיקה replace the multi-select category toggles. Exactly one is always active; the default is ילדים and the last choice is remembered. Search is the exception: it searches all categories and labels each result's category. Inside a category, these are single-select: kids type, doctor specialty, health fund. These are multi-select: chugim types, neighborhoods.
3. **Per-type filters** (the user says "the filters per type isn't good"):
   - Hide a filter until ~5 places have that field.
   - Kids: "סוג" first, then only the sub-filters for that type:
     - גני ילדים → gan type (merge the 3 צהרון variants into one "צהרון"), ages, price
     - חוגים → `chugim_types`
   - Add a doctor "לילדים" filter (`attributes.for_children`); none exists today.
   - Specialty lists: most common first, not alphabetical.
   - Yes/no filters mean "known to have"; drop the "no" option.
4. **Places without a pin are invisible** (35/59 doctors, 38/175 kids). Only search finds them. Show them in the list as "ללא מיקום מדויק". The user hasn't decided; recommend this and ask.
5. **Shared `/place/[id]` links go through `IntroOverlay` and `ConnectionGate`** before reaching the place (the gate in `HomeMap.tsx`). They should open the place directly, with a soft sign-in banner. This is launch-critical: the launch is a link shared in the WhatsApp group.
6. **No `og:image`** in `src/app/place/[id]/page.tsx` (title and description only), so WhatsApp previews are bare. Add a default image: brand plus category color.
7. **Guest review CTA:** `PlaceDetail` shows grey text "התחבר/י כדי לכתוב המלצה". Make it a sign-in button that returns to the same place.
8. **Type chip on `PlaceCard`:** doctor specialty plus "לילדים", kids type or chug, cosmetics type. Show kids "סוג" on `PlaceDetail` too (its specialty block is doctor/cosmetics only).
9. **Polish:**
   - 10–11px labels → minimum 12px.
   - Drop uppercase letter-spacing on Hebrew section titles.
   - Slash forms (כתוב/י, שלח/י, התחבר/י) → plural, like the intro ("כתבו", "תספרו").
   - The "+" in the mobile nav needs a label or `aria-label`.

Already done: the `PlaceDetail` hero went from 280px to 96px and the fake pager dots were removed (commit `113e96d`).

Discuss each block with the user before building it. That's her working style: one major block at a time, no auto-merging.
