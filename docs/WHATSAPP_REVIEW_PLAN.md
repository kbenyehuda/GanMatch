# WhatsApp Recommendations → Published Reviews — Plan

Turn the WhatsApp group history into published, anonymized reviews on the app, without anyone having to triage thousands of rows by hand. Claude reads the chat, scores each place, you check a calibration sample, then everything above a confidence threshold gets published.

**Started:** 2026-10-28 · **Target launch (link shared in the group):** Sunday 2026-11-15

**Privacy rules for this whole process:**
- The chat export and the review file stay **outside the repo** (`C:\Users\kbeny\Documents\whatsapp-exports\`). Never commit them.
- Only reworded, anonymized summaries get published. No names, no phone numbers, and no hint of which group a recommendation came from.
- Online lookups use only business name + city + category. No reviewer names, phones or message text.
- A negative review of a named individual (home daycare, specific doctor) never auto-publishes. You decide on each one.

Owner: **C** = Claude, **Y** = you.

---

## Phase 0 — Unblock (due Thu 2026-10-29)

- [x] C — Export received and extracted: 678 messages, Sep 2024 – Oct 2026, plus 7 shared contact cards (2026-10-28)
- [ ] Y — **Restore the Supabase project. It is paused right now**, so the live site is likely down (found 2026-10-28: the project's address doesn't resolve)
- [ ] Y — Decide how to stop it pausing again: Pro plan (~$25/mo, reliable) or a free keep-alive ping (fragile). Due Fri 2026-10-30
- [ ] Y — Move the export zip from Downloads to `C:\Users\kbeny\Documents\whatsapp-exports\`

## Phase 1 — Read the chat (due Fri 2026-10-30)

- [x] C — Read all 678 messages and the 7 contact cards (2026-10-28)
- [x] C — Find every recommendation thread (question + replies) in the kids, cosmetics and doctor categories (2026-10-28)
- [x] C — For each place: name, category, positive/negative, date, the question it answered, and the original reply text, in the private review file `C:\Users\kbeny\Documents\whatsapp-exports\review_2026-10-28.csv` (2026-10-28)
- [x] C — Merge the same place written different ways into one row (2026-10-28)

**What this group actually contains (2026-10-28):** mostly community life (events, politics, ticket swaps, support), not recommendations. Out of 678 messages:
- **1 strong review:** Dr. Yossi Binyamini (mohel / pediatric urologist), two independent first-hand recommendations.
- **3 weak ones:** Dr. Kessler (hearsay only), Dr. Steiner (bare name), the רג"עים playroom in Beit Rosen (one recommendation with a caveat).
- **4 self-promotions** (the Hachamama clinic, two home daycares, a Montessori job ad). These are place listings at most, not reviews. Home daycares need the owner's consent.
- **0 cosmetics.**
- **One lead worth more than all of the above:** a shared Google Sheet of Givatayim ganim that parents fill in (posted Oct 2025).

**This group alone can't fill the app.** The old ~7,000-row staging backlog came from bigger groups, and those are where the content is.

## Phase 1b — Get the real sources (due Sat 2026-10-31)

- [x] Y — Export the real group ("אמהות בגבעתיים": 56,646 messages, Jan 2024 – Oct 2026, 2,927 shared contact cards) (2026-10-28)
- [x] C — Look at the Givatayim ganim Google Sheet: only 2 filled rows in a year, both added to the review file. Its creator is a potential partner more than a data source (2026-10-28)
- [x] C — Split the chat into 31 chunks, write the reader instructions and the quote-verification script (2026-10-28)
- [x] C — Run parallel readers on chunks 01–20 (Jan 2024–Jul 2025, 68% of messages): 4,665 verified findings, every quote checked word-for-word (2026-10-29)
- [ ] C+Y — Chunks 21–31 (Aug 2025–Oct 2026, ~3M tokens): **paused to save weekly usage.** If resumed, do the newest first (27–31)
- [x] C — Merge per provider (script only), filter by match confidence, check against the DB, and show you a triage preview: 2,401 providers, 993 triage candidates (262 with 2+ independent recommenders), 30 already on the map, covering 2,181 of the 9,353 old pending rows. Preview: `whatsapp-exports\work\merged	riage_preview.html` (2026-10-29)
- [x] C — Insert the 262 providers with 2+ recommenders into triage: 891 rows, batch `claude-review-2026-10`, and set aside 1,205 old pending rows for the same providers (restorable) (2026-10-29)
- [ ] Y — Triage the new batch in /admin/whatsapp (tick "רק הסקירה החדשה")
- [ ] C — **Backlog:** insert the 731 single-recommender providers (one row each, same batch) and set aside the 573 old pending rows that cover them (restorable). Ready to run: `stage_insert.py --min-recs=1 --append --rerank --commit --supersede`; `--rerank` also re-orders the 262 groups already in triage so the strongest providers come first
- [ ] C — Chunks 21–31 (Aug 2025–Oct 2026) after the weekly usage reset, newest first
- [x] C — Approving a new-batch row now automatically replaces an older published copy of the same recommendation (same wording) from the May import (2026-10-29)
- [ ] C — After triage: delete the raw quotes (`recommendation_text`, `source_messages`) from decided rows and keep only the summaries
- [ ] Y — Decide about the 5 sensitive rows (abuse/neglect allegations at 4 ganim). They are never published or put in triage
- [ ] Y — Commit the triage-screen change that shows "נכתב / נוסף" dates on every row (`src/app/admin/whatsapp/page.tsx`, uncommitted)
- [ ] Y — Optional: ask the Google Sheet's creator about partnering (spreading the link, adding her ganim data)
- [ ] Y — Optional: ask the two home-daycare owners if they want a listing
- [ ] C — Read the new exports the same way (Phase 1), merged into the same review file

## Phase 2 — Check against the DB (due Sat 2026-10-31, needs Phase 0)

- [ ] C — Match each place against `places` (fuzzy name match, same logic as `src/lib/dedupe.ts`): existing or new
- [ ] C — Match against `whatsapp_import_staging`: which old pending rows each one replaces
- [ ] C — Flag unresolved possible duplicates (hard blocker, goes to you)

## Phase 3 — Check online (due Mon 2026-11-02)

- [ ] C — Look up each place: exists? address? still open?
- [ ] C — Resolve ambiguous names where the chat gives enough clues; otherwise mark "needs your input"
- [ ] C — Record the source link for every online fact

## Phase 4 — Score and calibrate (due Thu 2026-11-05)

Score 0–100: chat evidence (35) + independent recommenders (15) + recency (15) + confirmed online (20) + known location (10) + clean DB match (5).
Hard blockers, never auto-published: closed/moved · ambiguous identity · unresolved duplicate · negative or mixed opinion · personal info risk.

- [ ] C — Score every place and deliver the review file (spreadsheet, outside the repo). Due Mon 2026-11-02
- [ ] Y — Mark the calibration sample yes/no **without looking at the scores** (~40 places, or all of them if fewer). Due Wed 2026-11-04. If the bigger exports don't arrive and there are only a handful of places, skip the threshold and just decide each one yourself
- [ ] C+Y — Compare and agree on the threshold (starting guess: 75). Due Thu 2026-11-05
- [ ] Y — Decide each hard-blocked place (publish / skip / fix)

## Phase 5 — Publish (due Sat 2026-11-07)

- [ ] C — Write the reworded, anonymized summary for every place above the threshold, and show you a sample
- [ ] Y — Confirm the publish batch (one confirmation for the whole batch)
- [ ] C — Write to the DB: create new places, attach reviews, mark staging rows approved or replaced
- [ ] Y — Spot-check 10 places on the live site (pin location, summary, rating)

## Phase 6 — Launch prep (due Thu 2026-11-12)

From the 2026-10-28 repo review. Each item gets your OK before it's built.

- [ ] C — Merge the intro and login screens into one first-visit screen. Shared `/place/...` links skip it and open the place directly
- [ ] C — Add a preview image (`og:image`) so shared links look good in WhatsApp
- [ ] C — Wire basic telemetry in the live app: link opened, place viewed, review started/submitted
- [ ] C — Stop `GET /api/place-reviews` returning `user_id` (and check `reviewer_public_name`) on anonymous reviews
- [ ] C — Update Next.js to the latest 14.2.x patch
- [ ] C — Rewrite `CLAUDE.md` to describe the live `places` app, not the legacy `ganim_v2` one
- [ ] Y — Decide whether doctor reviews launch now or later (they name individual people)
- [ ] Y — Click through the whole app on your phone

## Phase 7 — Launch (Sun 2026-11-15)

- [ ] Y — Optional heads-up post in the group: what the app is, and "tell us if you'd like something removed"
- [ ] Y — Share the link
- [ ] C+Y — One week later (Sun 2026-11-22): look at telemetry: who opened it, who viewed places, who wrote reviews

## Later (after launch)

- [ ] Y — Export the other, bigger groups that fed the old staging backlog. Same process
- [ ] C+Y — Retire the old pending staging rows this process replaces (needs your confirmation)
- [ ] C — Remove the dead legacy `gan/` code
- [ ] C+Y — Revisit give-to-get once most places have several reviews (start with a soft nudge, not a lock)
