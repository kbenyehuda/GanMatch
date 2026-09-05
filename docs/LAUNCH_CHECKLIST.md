# Launch Checklist — What's Left Before We Go Public

Plain-language list of what still needs to happen before GanMatch is ready to show to real people. Written for a non-technical read — if a line doesn't make sense, ask before treating it as done.

**Launch plan:** first users arrive via a WhatsApp group — a warm, trusting audience, not cold strangers off the internet. That lowers the urgency of some "convince a stranger" items below, but doesn't remove them.

**Last updated:** 2026-09-04

---

## 🔴 Blocking — do before sharing the link at all

### 1. Confirm the hosting won't go to sleep
The database (Supabase) is on a free tier that has, in the past, automatically paused itself after a period of no activity — which would take the whole site offline until manually un-paused. This is a five-minute check with a catastrophic downside if skipped ("the link a parent forwards to a friend next week just doesn't work"), so it goes first.

**Checked 2026-09-04:** confirmed — project is still on the `free` plan, which does auto-pause after about a week of inactivity. Two real fixes exist (upgrade to Pro, ~$25/mo, which removes auto-pause entirely; or a scheduled keep-alive ping, free but fragile). **Skipped for now** — revisit before launch.

### 2. No privacy policy / terms of use
There's currently no page explaining what happens to a person's data, how the anonymous-contact-a-reviewer feature works (what's logged, who can see it), or basic terms of use. This app touches decisions about people's children and relays people's email addresses to strangers through the contact feature — that's real legal exposure, not just good hygiene.

**Done 2026-09-04 (needs your review):** drafted a combined privacy policy + terms page at `/privacy` (`src/app/privacy/page.tsx`), and linked it from the sign-in screen footer (`ConnectionGate.tsx`). It's plain-language, in Hebrew, and written from the actual current data flows in the code (Google OAuth only, what the contact-reviewer relay logs and exposes, onboarding profile fields, telemetry, third-party processors). It explicitly says it isn't legal advice and recommends a professional pass before scaling. **Read it before launch** — the wording is mine, not a lawyer's.

### 3. Almost no reviews exist yet
As of the last count: only ~34 reviews existed across the entire app, and 93% of daycare listings had zero reviews. Even a warm WhatsApp audience will bounce off an empty, review-less page — an empty product feels broken no matter how well it's introduced. Worth pre-seeding a first batch of reviews (from the WhatsApp group history you've been triaging) before sharing the link.

**Status 2026-09-04:** deferred — you're doing the WhatsApp triage yourself later. Revisit before launch.

---

## 🟡 Should fix soon — wanted before/soon after sharing, less urgent given a warm audience

### 4. No introduction / landing page
Right now, opening the website takes you straight to the map with zero explanation. Confirmed: you still want this built before launch, even though a WhatsApp-group audience needs less convincing than cold strangers would.

**What's needed:** A simple welcome page (or a short overlay) explaining what GanMatch is, where the data comes from, and how "help us and we help you" review access works — before the person is dropped onto a bare map.

**Done 2026-09-04 (needs your review):** added a one-time full-screen intro overlay shown before the map on a visitor's very first visit (`src/components/home/IntroOverlay.tsx`, wired into `HomeMap.tsx`) — three short points: what GiveMyTime is, where the data comes from, and a nudge to contribute a review. It never reappears after the first "בואו נתחיל" click (tracked in localStorage). Also added a persistent `/about` page (`src/app/about/page.tsx`) reachable via an "אודות" button (desktop, top-start corner) and a profile-screen card (mobile), for anyone who wants the explanation again later. Note: the overlay/about copy deliberately does **not** describe reviews as gated behind contributing — that give-to-get mechanic isn't actually wired up for the current `places` schema (only the legacy `ganim_v2` path has it), so the copy just encourages contributing rather than promising a hard unlock. **Please click through it locally before launch.**

### 5. Emails to reviewers don't actually deliver yet
When someone clicks "send a message" to a reviewer, the message is written and prepared correctly, but the email fails to actually arrive — unless the recipient happens to be your own email address. Downgraded from blocking: with only ~34 reviews total (most of them yours), almost nobody will hit this button in the first weeks.

**Why:** The email-sending service (Resend) treats new accounts as "test mode" until you prove you own a real website address (a domain) by adding a couple of entries to its settings. Without that, Resend refuses to deliver to anyone except the account owner.

**What needs to happen:**
- Buy or use a domain you own (a domain is basically a web address like `example.com` — costs a few dollars a year from any domain seller)
- Add it in Resend's dashboard, add the two entries it asks for at wherever the domain is managed
- Update the "from" email address setting to use that domain

**In progress:** Currently being worked on with help from another AI assistant (see the prompt already handed off). Come back to this doc once that's done.

**Status 2026-09-04:** still stuck — no domain purchased yet, no DNS records set up. Deferred, same as items 1 and 3. Revisit before launch.

**Status 2026-09-05:** domain bought — **`givemytimeapp.com`** (used only for sending mail, not hosting; the site keeps living on Vercel). DNS records added via Resend's one-click Cloudflare authorization, domain verified, `RESEND_FROM_EMAIL` updated to `"GiveMyTime <noreply@givemytimeapp.com>"` in both `.env.local` and Vercel, redeployed, and tested by sending a contact-reviewer message to a non-owner reviewer account — **delivered successfully. RESOLVED.**

### 6. Key details are missing on most listings
Price, whether there's space available, age range, and hours are essentially blank on most of the official government-sourced daycare listings. People can now submit these themselves via a review, but almost nothing has been filled in yet.

**Status 2026-09-04:** no separate action — resolves via items 3 (seeding reviews) and 4 (intro nudging people to contribute), not a standalone fix.

### 7. Doctor and cosmetics listings are much thinner than daycare listings
Daycare (kids) listings let people fill in a lot of detail — price, hours, safety features, meal type, and more. Doctor and cosmetics listings only have a couple of fields people can add. If you plan to promote those two categories at launch (not just kids), they'll feel noticeably less complete.

**Status 2026-09-04:** noted, no action taken. Revisit if/when doctor and cosmetics categories are pushed as launch-day categories rather than kids-first.

### 8. The map doesn't always show the latest info
If something about a place changes in the background (a staff member fixes its location, a price gets corrected), anyone who already has the page open won't see the update unless they reload the whole page. Not data loss — just a stale-looking screen.

**Done 2026-09-04:** open tabs now quietly re-fetch the current map viewport every 2 minutes and whenever the tab regains focus (`usePlacesInViewport.ts` + `HomeMap.tsx`) — no spinner, no jump, pins just refresh in place. Also fixed a related gap found along the way: if someone had a place's full detail panel open (not just the map pin), background edits weren't reaching that view even after a refresh — only the map pin was wired to update. Both now stay in sync.

### 9. Clicking a cluster of map pins looks rough
When several places are close together on the map and you tap the cluster, the list that pops up looks visibly less polished than the rest of the app — cramped, no real design applied yet.

**Done 2026-09-04:** redesigned to match the rest of the app's visual language (`PlaceClusterList` in `HomeMap.tsx`) — same navy gradient header as the sign-in/about screens, each row now uses the colored category-icon badge from the place detail peek sheet instead of a bare emoji, plus rating shown consistently. Also fixed a small pre-existing gap found along the way: cosmetics-category places had no icon defined at all (rendered blank) in both the peek sheet and this list — added one.

---

## 🟢 Nice to have — polish for after launch

**Done 2026-09-04:**
- The "message a reviewer" popup now uses a proper bottom sheet on phones/tablets (rounded top, scrollable, safe-area-aware) instead of a card that could get cut off with the keyboard open (`ContactReviewerModal.tsx`).
- The desktop/tablet search results panel now has a collapse/expand handle on the boundary with the map, so you can reclaim map space (`HomeMap.tsx`).
- Shortlist/favorites already existed (heart icon → localStorage → "מועדפים" tab). Added progress chips per saved place — "יצרתי קשר" / "ביקרתי" / "נרשמתי" — localStorage-backed, shown in the saved tab (`HomeMap.tsx`).
- Checked the "attribute icons only explain on hover" item: turned out to already be resolved in the live app — `PlaceDetail.tsx`'s attribute chips always show icon *and* text label. The hover-only version only existed in legacy `gan/` components the live app no longer renders. No change needed.

---

## How to use this list

Work top to bottom. Items 1–3 are cheap-to-catastrophic or foundational — do these before the link goes to anyone. Items 4–9 are wanted but softened in urgency because the first audience is a trusting WhatsApp group, not cold traffic — still worth clearing before or shortly after the first share. The 🟢 tier can wait until after real usage tells you what actually matters.
