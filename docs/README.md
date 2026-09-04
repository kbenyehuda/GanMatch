# Documentation index

## Current (maintain these)

| Doc | Use |
|-----|-----|
| [README.md](../README.md) | Quick start: install, env, dev server. |
| [database.md](./database.md) | Migrations, schema, **API/RPC flow** (reviews, triage, suggest_gan), ingestion, `process_user_inputs`, optional seed. |
| [GIVE_TO_GET_ACCESS_MODEL.md](../GIVE_TO_GET_ACCESS_MODEL.md) | How review access works today (entitlements, onboarding, bounty, admin). |
| [SPEC_ENTITLEMENTS_AND_MODERATION.md](../SPEC_ENTITLEMENTS_AND_MODERATION.md) | **Non-normative** target/backlog spec (moderation, future tables, events). **Do not treat as production contract**—use **GIVE_TO_GET_ACCESS_MODEL.md** + **database.md**; read the warning box at the top of the spec. |
| [PRODUCT_AUDIT.md](../PRODUCT_AUDIT.md) | Product backlog and risk register (living document). |
| [GAN_TYPES.md](./GAN_TYPES.md) | Gan `category` enum, icons, colors, gov import mapping, type table for parents. |
| [V3_PLAN.md](./V3_PLAN.md) | v3 product and engineering plan (north star, features, work order). |
| [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | Plain-language pre-launch punch list — what's blocking, what's just embarrassing, what can wait. |

## Scripts

| Doc | Use |
|-----|-----|
| [scripts/gov_import/README.md](../scripts/gov_import/README.md) | **`ganim_v2`** import from data.gov.il (recommended ingestion path). |
| [scripts/scraper/README.md](../scripts/scraper/README.md) | Municipal scraper; historically used `insert_gan` / legacy `ganim`—see README warning if you dropped `ganim`. |

## Archived (do not treat as current)

| Location | Use |
|----------|-----|
| [graveyard/README.md](./graveyard/README.md) | Explains the archive and lists tombstones. |
| [graveyard/](./graveyard/) | Old roadmaps, legacy README snippets, retired table map. |
