# UI/UX Refresh — Plan

Handoff for the UI session (prepared 2026-10-29). **One folder only (user, 2026-10-30):** the `GanMatch-ui` worktree was merged back and deleted. Work in `GanMatch` on branch `whatsapp-review-triage`. Don't create worktrees or extra folders. The "Your area" split below still says which files the triage work owns.

Read `CLAUDE.md` first. It describes the older `ganim_v2` app; the live app is the `places` app (`src/components/places/*`, `src/components/home/HomeMap.tsx`, `src/types/places.ts`, `src/types/place-filters.ts`, `src/lib/apply-place-filters.ts`). Its rules still hold: Hebrew-only UI, RTL with `start`/`end` (never `left`/`right`), ask before any state-changing action (DB writes, migrations, git push, deploys).

## Status — read this first (updated 2026-10-30)

**Ganim come first** (user, 2026-10-30; also in `CLAUDE.md`). They are the most important part of the app. Prioritize gan data and gan UX.

### Deployed 2026-10-30, then built while the user was away (committed, NOT pushed)

Deployed to production: everything up to `ada3139`. After that, the user asked Claude to "continue with everything else" while away and to follow up on questions afterwards. Commits `c007452` … `ed936be` (not pushed):

- `c007452` **Items 5–7.** Shared `/place/<id>` links skip the intro and sign-in screens and open the place window. Signed-out visitors get a dismissible banner ("התחברו כדי לכתוב המלצה ולשמור מקומות"). `signInWithGoogle` (`src/lib/sign-in.ts`) returns to the starting page: OAuth still lands on the origin, and the path is kept in `sessionStorage`. The guest review text is now a sign-in button that returns to the same place. `/og/<category>` is a 1200×630 preview image (app icon on the category color, no text because the renderer has no Hebrew font). `metadataBase` comes from `NEXT_PUBLIC_SITE_URL`, else `VERCEL_PROJECT_PRODUCTION_URL`.
- `a37dc22` **Items 8–9.** `placeTypeLabel` (`src/lib/place-type.ts`) leads each card's meta line in the category color (משפחתון, חוג קפוארה, רופא עור · לילדים) and shows as "סוג" in the place window for kids. Polish: 12px minimum text, no uppercase letter-spacing, plural or neutral wording instead of slash forms, `aria-label` on the mobile "+".
- `683271f` **Doctor and cosmetics facts** (ids `dr_*`, `cos_*`), drafted from the real review tags. Coverage: doctors 150/159, cosmetics 37/40, kids 5/175.
- `c1e36fb` **The summarizer picks tags from the facts list** for kids, doctors and cosmetics (closed list in the prompt and the tool schema). Each fact also fills its field (`factsToAttributes`).
- `d3009b0` **"🏷️ עובדות לגנים" button** in WhatsApp triage. It re-reads only kids recommendations, fills empty fact fields and adds fact tags to the published reviews. **Not run** (one OpenAI call per approved kids row).
- `ed936be` **Bug fix: shared links to places without a pin returned 404** (120 of 159 doctors). Launch-critical; found while testing og tags.

**Decisions Claude made for the user (review these):**
1. Doctor facts: מקבל ילדים, מתאים להריון, קשוב וסבלני, תור קצר, זמינות אונליין, ביקורי בית, פרטי. Left out: "מקבל חיות מחמד" (8 tags; probably vets filed as doctors), "מחיר נוח" (too vague). "תינוקות" and "ילדים" count as מקבל ילדים.
2. Cosmetics facts: services (`attributes.services`: לק ג'ל, מניקור, פדיקור, גבות, חורים באוזניים, טיפול פנים, צבע שיער, תלתלים, החלקה / קראטין, איפור) plus הגעה לבית, מתאים לילדים, ללא תור, תורים פנויים.
3. Every category's cards show 2 chips + "+N". Kids lead with facts; doctors and cosmetics lead with health funds. Doctor cards skip "מקבל ילדים" because the type line already says "· לילדים".
4. Review chips show only facts in all three categories. Generic praise, health funds and locations no longer show under reviews.
5. The doctor "לילדים" pill stays separate and now counts parents' tags too, so 130 doctors instead of 48.
6. The shared-link banner appears only to signed-out visitors who never chose "המשך כאורח".
7. Facts that stay tag-only (not written to fields): פתוח בשישי (every vs every other Friday is unclear), שעות ארוכות (derived from hours), יש מקום פנוי (goes stale).
8. A tags → fields backfill from old review tags was skipped: the UI already counts tags as facts, so it adds nothing visible.

**Waiting on the user:**
- Push `c007452`…`ed936be` to production (the build passes locally).
- Press "🏷️ עובדות לגנים" in triage (OpenAI cost) to get real gan facts.
- Check `metadataBase` resolves to the real domain on Vercel; otherwise set `NEXT_PUBLIC_SITE_URL`. The production URL isn't known in this session.
- `decision/route.ts` still writes the reviewer name "חבר/ה מהשכונה" (a slash form) on every WhatsApp review; changing it needs a DB update for existing rows.
- The profile screen shows a hard-coded "באפליקציה מאז 2024".
- `neighborhood` is still null everywhere (filling it is a data task); possible duplicate `גן "שקד"` / `גן שקד`.

### Live as of 2026-10-30 evening (`19b6f3c`)

Since the list above, also deployed: open tags with merged meanings (user: "tags should be quite open… a few different tags that mean the same thing is bad"; `canonicalTag`/`displayTags` in `place-facts.ts`); gan facts written for 26 recommendations (kids places with a fact: 5 → 16); colored category squares removed; a place opened in one category no longer shows in another; "ערכו פרטים" edits are pending requests (`place_detail_requests`) that the user approves, **every change for now** (trust rules maybe later); every request (details and location) emails `ADMIN_EMAILS` with a link to `/admin/<page>?id=<id>`; approval pages have דילוג (hide). Local pre-deploy builds: `NEXT_DIST_DIR=.next-build npm run build`.

### Backlog (user, 2026-10-30)

1. **Test the approval email.** One real "ערכו פרטים" request: email arrives, its link opens that request.
2. **Run the other WhatsApp waves.** Recommendations about a place we already have must attach to it, not create a new place. Check the matching before running them: name variants (`גן "שקד"` / `פעוטון שקד`) and the same person under different names. **The same name is not always the same place** (user, 2026-10-30): גן שקד shows up at צה"ל/ארלוזורוב and at ל"ה, which may be two ganim. Match on name plus location or street, and when it's unclear, ask instead of merging. Dedupe existing duplicates the same way.
3. **Find locations** for places without a pin in the 3 visible categories (181 of 460; doctors 120 of 159).
4. **Domain.** `givemytimeapp.com` (bought 2026-09-05) is used only for sending email (`RESEND_FROM_EMAIL`, README lines 40–41, `docs/LAUNCH_CHECKLIST.md` line 53). The site is `gan-match.vercel.app`. Serving the site on the domain takes: add it in Vercel, DNS at the registrar, Supabase auth redirect URLs, Google OAuth origins, and optionally `NEXT_PUBLIC_SITE_URL`. No code has the domain hard-coded.
5. **Legal check before sharing.** Privacy and terms page (`/privacy`), publishing WhatsApp-group recommendations (consent, anonymity: summaries are anonymized, reviewer names stored as `whatsapp_reviewer_name`), personal data of babysitters and caregivers (names, phone numbers), Israeli privacy law and database registration, government data licence.
6. **Neighborhoods** are null everywhere (the filter is hidden); fill them from coordinates.

### Done earlier (deployed in `ada3139`)

- `5d1ade2` **Cap fix (ship to production soon, independent of the UI work).** `/api/places` capped `get_places_in_bbox` at 200 rows ordered by rating, so every unrated (newly approved) place disappeared once the city passed 200 pinned places. Cap is now 2000.
- `3737588` **Items 1, 2 and 4 plus Google-Maps-style map:**
  - Category tabs, one at a time (default ילדים, remembered in `localStorage` `gmt_category`). Search looks across all categories behind a temporary "תוצאות חיפוש" tab.
  - Live filter pills (`src/components/places/CategoryFilterBar.tsx`, facets in `filter-facets.ts`). Desktop opens a popover, phone a short sheet. Counts per option, most common first, ✕ on an active pill. A facet is hidden until ≥5 places have the field (`MIN_PLACES_FOR_FILTER`).
  - Kids type falls back to גני ילדים for gov-data places that only have `gan_category`. The three צהרון variants filter as one. New doctor `לילדים` filter (`doctor_for_children`).
  - Neighborhood and health fund are stored per category.
  - **All places load once** (`useAllPlaces`, `/api/places?all=1` → `get_all_places`, includes places with no pin). The list and counts no longer follow the map viewport. `usePlacesInViewport` is now unused.
  - Places without a pin are in the list with the label "ללא מיקום מדויק".
  - Desktop: hovering a card raises its pin on the map, or shows a "no location yet" note on the map if it has no pin. Clicking a pin opens the place directly.
  - All health funds are shown on cards, the map peek and the place header (it used to show only the first).
  - Removed the old full-width FilterSheet and the kosher / ₪ tier / rating / opening-hours filters from the UI. The filter logic is kept for the hidden categories.

### Data findings (2026-10-30, read-only queries)

- 460 places total; **181 have no pin** (doctors 120/159, babysitters 7/8, חוגים 8/10).
- **`neighborhood` is null for every place**, so the neighborhood pill is hidden by the ≥5 rule. Filling it from coordinates is a separate data task.
- Kids fields: ages, price and `chugim_types` have no data yet, so those pills stay hidden. Only 40 of 142 ganim have any review.
- Possible duplicate places: `גן "שקד"` / `גן שקד`. Worth a dedupe pass in triage.

### Next block: one "facts" vocabulary (tags = fields)

User's definition: **a tag is useful extra information that helps you choose** (חצר, טבעוני, יחס אישי, זמינות, מתאים להריון). It is never the type (גן, משפחתון, רופא עיניים), the category (ילדים), the age group (תינוקות), the health fund, or generic praise (מומלץ, מקצועי, אדיב). Tags and structured fields should be one vocabulary: חצר is both a tag and `has_outdoor_space`.

Today the summarizer writes free-text tags (`place_reviews.tags`, 140 distinct, collected in `tag_taxonomy`) separately from structured fields. Of 2,857 tag uses, only ~830 are real tags; type 998, generic 794, HMO 235. Doctors and cosmetics have useful ones. **Ganim have almost none** (13 uses). The prompt is tuned for services, so gan facts (מגיל חצי שנה, אנתרופוסופי, טבעוני, יחס אישי) stayed in the summary text. Tags currently render only as tiny 10px chips under each review in `PlaceDetail`.

**Gan facts — approved by the user 2026-10-30, built in `src/lib/place-facts.ts`** (that file is the source of truth for labels, fields and synonyms):
- Facilities: חצר (`has_outdoor_space`), ממ"ד (`has_mamad`), מצלמות (`has_cctv`; one chip that becomes "מצלמות עם צפייה להורים" when `cctv_streamed_online`), גן ביתי (new `is_home_gan`)
- Food: בישול במקום (`meal_type=IN_HOUSE_COOK`), טבעוני, צמחוני, מתאים לאלרגיות
- Approach: new multi-value field `approach` = ANTHROPOSOPHIC / NATURE / MONTESSORI / BILINGUAL (דו-לשוני is also true when `languages_spoken` has 2+)
- Staff and atmosphere: קבוצה קטנה / יחס אישי (new `small_group`), צוות יציב (new `stable_staff`), עזרה ראשונה, חוגים בגן (new `has_chugim_in_gan`)
- Hours and availability: פתוח בשישי (`friday_schedule`), שעות ארוכות (derived: `hours` closes at **16:30 or later**), גמישות בשעות (new `flexible_hours`), קייטנה בחופשים (new `has_holiday_camp`), יש מקום פנוי (`vacancy_status` Available/Limited)

User decisions: every fact is a real field (filterable and editable in "ערכו פרטים"), not tag-only. New fields live in the `attributes` JSON, so no migration. Synonym lists were drafted, not checked against review text (the user asked to save tokens). Ages, price and gan type are fields shown in their own spots, not tags.

Other categories (drafts):
- Doctors: מקבל ילדים, מתאים להריון, זמינות / תור קצר, קשוב / סבלני / עדין, מגיע לבית, פרטי, זמינות אונליין
- Cosmetics: service types (לק ג'ל, טיפול פנים, חורים באוזניים, תלתלים, צבע), הגעה לבית, ללא תור, מתאים לילדים

Steps:
1. **Done for ganim (2026-10-30, no DB writes):** `src/lib/place-facts.ts` with the vocabulary per category. Each fact has a label, its field if any, and tag synonyms. Map the existing tags onto it: merge synonyms (מקבל/מקבלת/מתאים לילדים/קידס פרנדלי → for_children), keep negatives (לא מומלץ, תור ארוך, חסר רגישות) out of the positive chips, and treat locations (קניון גבעתיים, בורוכוב) as location. Show a "מה ההורים אומרים" fact summary in the place window plus 1–2 facts on the card. Let filter facets count facts from tags as well as fields.
   Built: `place-facts.ts`; `/api/places/review-tags` (distinct tags per place, merged into `Place.review_tags` by `useAllPlaces`); facet "מה חשוב לכם" (AND, shown once גני ילדים is picked); 2 facts on kids cards plus a "+N" chip (user, 2026-10-30; facts parents mention come first); "מה ההורים אומרים" block in `PlaceDetail`; kids review chips show only fact labels; the 7 new fields in `EditKidsAttributesModal` + `/api/places/kids-attributes`; the phone "ללא מיקום מדויק על המפה" note in the address row. Doctors and cosmetics vocabularies are not built yet.
2. **Triage session (owns `src/lib/whatsapp-summarize.ts`):** the summarizer picks from the vocabulary instead of free text. Re-run it on the gan reviews. Then run a one-time backfill of mapped values into real fields, only with the user's OK.
3. **Later:** owners and parents confirm or add facts through "ערכו פרטים".

The user also asked about phones: hover is desktop-only. The phone equivalent of the "no location" note should go inside the place window (step 1 is a good time).

### Still open from the original list

Items 5–9 are done (see above). Remaining: the "waiting on the user" list above.

## How to run

- `npm run dev -- -p 3000` (as of 2026-10-30 the triage dev server is no longer running; use 3001 if it is back). Supabase only allows Google sign-in to return to localhost ports on its Redirect URLs list, which caused "requested path is invalid" on 3001.
- The user checks localhost herself. Don't drive the browser; after a change, run `npx tsc --noEmit -p .` and `npx next lint`, then hand her a short checklist of what to click and what to expect.

## Your area (and what to leave alone)

- **Yours:** `src/components/places/*`, `src/components/home/*`, `src/components/auth/*`, `src/app/place/*`, `src/app/layout.tsx`, `src/types/place-filters.ts`, `src/lib/apply-place-filters.ts`, `src/types/places.ts` (labels only).
- **Leave alone** (the triage session edits these): `src/app/admin/whatsapp/*`, `src/app/api/admin/whatsapp-staging/*`, `src/lib/whatsapp-summarize.ts`, `src/lib/whatsapp-geocode.ts`.
- Commit on `whatsapp-review-triage`. Don't merge into `main` or push without asking.

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
