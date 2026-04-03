# GanMatch cold start — “Community Utility” plan (Givatayim)

A step-by-step plan to move GanMatch from a map of pins to a map of voices. Assumes a solid technical foundation and UI that can read as credible enough to stand next to municipal tooling—use that as the wedge in Givatayim. With a store-led raffle off the table, the model shifts to **Community Utility**.

---

## Phase 1: The “Seed” Data (48 Hours)

Before you ask the public for data, you need to eliminate the “empty restaurant” syndrome.

1. **The “Big 5” Pre-fill:** Manually verify and update the 5 most “famous” gans in Givatayim (e.g., the Na’amat on Yarden, WIZO, or popular private ones like Dalia). Add their hours and whether they accept *Darga* (subsidies).
2. **The “First 10” Reviews:** Don’t go to Facebook yet. Reach out to 5–10 parents you know personally in Givatayim. Send them a direct link to their specific gan.
   - **The Script:** *“Hey, I'm launching GanMatch to help Givatayim parents survive registration season. Can you do me a 60-second solid and leave a star rating/review for [Gan Name]? I just need to break the '0 reviews' ice.”*
3. **UI Check:** Ensure the “Add Review” button is the most prominent element when a guest clicks a pin.

---

## Phase 2: The Municipal “Blessing” (Week 1)

You have a “talk” scheduled with the Head of Education. Use it to gain **authority**, not just permission.

1. **The Demo:** Show her the map on your phone. Highlight the **Email Relay**.
   - **Key Phrase:** *“This keeps the 'Gan-talk' off toxic Facebook groups and into a moderated, private environment that protects both parents and the city's reputation.”*
2. **The “Official Pilot” Ask:** Don’t ask for money. Ask for:
   - A link to GanMatch on the **Givatayim Municipality website** under the “Education/0-3” tab.
   - A one-time mention in the **official City WhatsApp/Telegram** channel for parents.
3. **The “Data Exchange”:** Ask her for a list of the *current* licensed gans to ensure your “Licensed” pins are 100% accurate. This makes her feel like a partner in the data’s integrity.

---

## Phase 3: The “Neighborhood Challenge” (Week 2)

Now you go to the “Moms/Dads of Givatayim” Facebook and WhatsApp groups.

1. **The Visual Hook:** Post the screenshot you showed me, but circle a specific neighborhood (e.g., **“Calling all Borochov Parents!”**).
2. **The “Founder” Incentive:** Forget the gift cards. Use **Status**.
   - **The Post:** *“I built this map of Givatayim gans so we can finally see who's licensed and who isn't. I'm looking for 'Founding Reviewers' to help fill the map. Anyone who leaves a review this week gets permanent 'VIP' access (no Give-to-Get gates, ever) and a 'Founding Parent' badge on their profile.”*
3. **The “Missing Pin” Bounty:** Encourage people to “fix” your map. *“If your gan isn't here, it might be missing from the registry—add it so we can get it verified!”*

---

## Phase 4: The “Registration Season” Push (Week 3–4)

In April, parents are at peak anxiety. This is when your **Contact Reviewer** feature becomes a viral loop.

1. **The “Real Talk” Campaign:** Post a “Did you know?” tip.
   - **Example:** *“Wondering if [Popular Gan] actually has a good staff-to-child ratio? Don't ask on a public thread. On GanMatch, you can privately email a parent who actually goes there. Check the map to see who's 'Contactable'.”*
2. **The Physical Bridge:** Print 20–30 stickers with a QR code: *“Is this Gan good? Check the map & talk to parents.”* Place them (legally) on public boards near **Park Givatayim**, **Tipat Halav**, and the **Giv'at HaBanim** playground.

---

## Phase 5: The Pivot to Owners (Month 2)

Once you have ~100 reviews and consistent traffic:

1. **The “Claim Your Gan” email:** Now you contact the *gan* owners.
   - *“Parents are reviewing [Gan Name] on GanMatch. Over 500 local parents used the map this month. Click here to verify your details, upload photos, and respond to parent inquiries.”*
2. **The Store Raffle (Take 2):** Now that you have **User Analytics** (e.g., “I have 400 active Givatayim parents”), go back to the local stores.
   - *“I have the eyes of every toddler-parent in Givatayim. Want to offer a 10% discount to GanMatch users in exchange for a featured spot on our sidebar?”*

---

## Critical success metric

Don’t worry about “Total Users” yet. Focus on **“Review Density per Neighborhood.”** If a parent in Borochov sees that *every* gan in their 3-block radius has a review, they are 10x more likely to contribute their own.

---

## Open product question (Give-to-Get)

**Does your “Give-to-Get” gate currently activate after 1 view, or do you let them see a few reviews before asking them to contribute?** (Recommended: let them see 1 or 2 for free to prove the value.)

For how the gate actually behaves in code and config, see [GIVE_TO_GET_ACCESS_MODEL.md](../GIVE_TO_GET_ACCESS_MODEL.md) and [.env.example](../.env.example) (`FF_SOFT_GATE`, onboarding quota, etc.).
