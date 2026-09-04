# Launch Checklist — What's Left Before We Go Public

Plain-language list of what still needs to happen before GanMatch is ready to show to real people. Written for a non-technical read — if a line doesn't make sense, ask before treating it as done.

**Launch plan:** first users arrive via a WhatsApp group — a warm, trusting audience, not cold strangers off the internet. That lowers the urgency of some "convince a stranger" items below, but doesn't remove them.

**Last updated:** 2026-09-04

---

## 🔴 Blocking — do before sharing the link at all

### 1. Confirm the hosting won't go to sleep
The database (Supabase) is on a free tier that has, in the past, automatically paused itself after a period of no activity — which would take the whole site offline until manually un-paused. This is a five-minute check with a catastrophic downside if skipped ("the link a parent forwards to a friend next week just doesn't work"), so it goes first.

### 2. No privacy policy / terms of use
There's currently no page explaining what happens to a person's data, how the anonymous-contact-a-reviewer feature works (what's logged, who can see it), or basic terms of use. This app touches decisions about people's children and relays people's email addresses to strangers through the contact feature — that's real legal exposure, not just good hygiene.

### 3. Almost no reviews exist yet
As of the last count: only ~34 reviews existed across the entire app, and 93% of daycare listings had zero reviews. Even a warm WhatsApp audience will bounce off an empty, review-less page — an empty product feels broken no matter how well it's introduced. Worth pre-seeding a first batch of reviews (from the WhatsApp group history you've been triaging) before sharing the link.

---

## 🟡 Should fix soon — wanted before/soon after sharing, less urgent given a warm audience

### 4. No introduction / landing page
Right now, opening the website takes you straight to the map with zero explanation. Confirmed: you still want this built before launch, even though a WhatsApp-group audience needs less convincing than cold strangers would.

**What's needed:** A simple welcome page (or a short overlay) explaining what GanMatch is, where the data comes from, and how "help us and we help you" review access works — before the person is dropped onto a bare map.

### 5. Emails to reviewers don't actually deliver yet
When someone clicks "send a message" to a reviewer, the message is written and prepared correctly, but the email fails to actually arrive — unless the recipient happens to be your own email address. Downgraded from blocking: with only ~34 reviews total (most of them yours), almost nobody will hit this button in the first weeks.

**Why:** The email-sending service (Resend) treats new accounts as "test mode" until you prove you own a real website address (a domain) by adding a couple of entries to its settings. Without that, Resend refuses to deliver to anyone except the account owner.

**What needs to happen:**
- Buy or use a domain you own (a domain is basically a web address like `example.com` — costs a few dollars a year from any domain seller)
- Add it in Resend's dashboard, add the two entries it asks for at wherever the domain is managed
- Update the "from" email address setting to use that domain

**In progress:** Currently being worked on with help from another AI assistant (see the prompt already handed off). Come back to this doc once that's done.

### 6. Key details are missing on most listings
Price, whether there's space available, age range, and hours are essentially blank on most of the official government-sourced daycare listings. People can now submit these themselves via a review, but almost nothing has been filled in yet.

### 7. Doctor and cosmetics listings are much thinner than daycare listings
Daycare (kids) listings let people fill in a lot of detail — price, hours, safety features, meal type, and more. Doctor and cosmetics listings only have a couple of fields people can add. If you plan to promote those two categories at launch (not just kids), they'll feel noticeably less complete.

### 8. The map doesn't always show the latest info
If something about a place changes in the background (a staff member fixes its location, a price gets corrected), anyone who already has the page open won't see the update unless they reload the whole page. Not data loss — just a stale-looking screen.

### 9. Clicking a cluster of map pins looks rough
When several places are close together on the map and you tap the cluster, the list that pops up looks visibly less polished than the rest of the app — cramped, no real design applied yet.

---

## 🟢 Nice to have — polish for after launch

- The "message a reviewer" popup isn't great on phones/tablets yet — it can feel cramped or get partially cut off.
- The search results panel doesn't yet have a way to collapse it to see more of the map, especially on tablets.
- The little icons that describe a place's features (meals, languages, safety, etc.) only explain themselves on hover with a mouse — which means they explain nothing at all on a phone or tablet, since there's no mouse to hover with.
- No way yet for a shortlist/favorites list, or to track "I contacted them / I visited / I applied" for a place you're considering.

---

## How to use this list

Work top to bottom. Items 1–3 are cheap-to-catastrophic or foundational — do these before the link goes to anyone. Items 4–9 are wanted but softened in urgency because the first audience is a trusting WhatsApp group, not cold traffic — still worth clearing before or shortly after the first share. The 🟢 tier can wait until after real usage tells you what actually matters.
