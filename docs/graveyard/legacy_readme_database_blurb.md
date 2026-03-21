# Legacy README database blurb (pre–canonical v2 cleanup)

**Archived from root `README.md` on 2026-03-21.** The app’s canonical daycare table is `public.ganim_v2`; submissions and moderation use `public.user_inputs`; published reviews use `public.confirmed_reviews`.

Previously, after listing migrations, README said migrations “create”:

- **ganim** – Daycares with PostGIS `location`, licensing data, metadata (JSONB)
- **reviews** – Give-to-Get community reviews
- **visit_notes** – Short contributions that unlock review visibility
- **waitlist_reports** – Community-reported availability (Available / Limited / Full)

**What changed (conceptually)**

- Map reads and RPCs use **`ganim_v2`**.
- **`reviews`**, **`visit_notes`**, **`waitlist_reports`**, **`gan_suggestions`**, **`gan_edit_requests`** were folded or replaced by **`user_inputs`** processing and, for public review text, **`confirmed_reviews`** (see migrations around `20260307100001`, `20260307100004`, `20260307100005`).
- Legacy **`public.ganim`** may be dropped in favor of **`ganim_v2`** only; ingestion then uses **`upsert_ganim_v2`** (e.g. `scripts/gov_import/`) or a replaced `insert_gan` if you add one.
