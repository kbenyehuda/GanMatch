# Markdown graveyard

**Purpose:** Preserve older planning text and deprecated descriptions **without** deleting ideas or historical process. Nothing here is treated as the current source of truth.

**When to add a file**

- A roadmap or spec is superseded but you still want the original milestones visible.
- You remove or rewrite a section of `README.md` (or similar) and want the old wording kept for comparison.
- A DB flow or table was retired; document what it was and what replaced it.

**Current truth**

- Start at the [documentation index](../README.md) (parent `docs/` folder).
- Product access model: [GIVE_TO_GET_ACCESS_MODEL.md](../../GIVE_TO_GET_ACCESS_MODEL.md) (repo root).
- Migrations: `supabase/migrations/` (timestamp order).

## Index

| Archive | What it is |
|--------|------------|
| [ROADMAP_Q2.md](./ROADMAP_Q2.md) | Original Q2 execution roadmap (milestones 1–4). Much of it has since been implemented or reprioritized—kept for retrospective and leftover ideas (e.g. referral flywheel, dashboard). |
| [legacy_readme_database_blurb.md](./legacy_readme_database_blurb.md) | Old README “This creates: ganim, reviews, visit_notes…” block from the initial-schema era. |
| [retired_tables_and_ledgers.md](./retired_tables_and_ledgers.md) | Tables and ledgers removed or folded into `user_inputs` / `ganim_v2` / `confirmed_reviews`, with migration pointers. |
