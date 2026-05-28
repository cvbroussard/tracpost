# v3 Code Sweep Plan (migrate-137 companion)

The DDL is the easy part (`scripts/migrate-137-v3-entity-hierarchy.js`). This doc covers the
~344-file code sweep that has to land in lockstep. Source of truth for scope: `docs/schema-audit-v3.md`.

## Deploy sequence (the order that keeps prod alive)

1. **Ship auth.ts dual-read FIRST** (before the migration runs). New code reads `memberships` but
   falls back to the legacy `subscription_id + role` path if no membership rows exist. This makes the
   app tolerant of *both* schemas, so the migration can land without a flag-day.
2. **Run migrate-137** (atomic; all-or-nothing). Backfills memberships; renames tables/columns; keeps
   old columns (`users.account_id`/`role`/`business_id`) for the fallback.
3. **Deploy the codemod'd code** (all the renamed identifiers/routes). Now reading the new schema.
4. **Verify** in prod (see Verification). Confirm memberships resolve, every surface loads, no 500s
   referencing missing columns/tables.
5. **migrate-138 (later)** drops the retained legacy columns + removes the auth.ts fallback once
   verified. Also retires the `ADMIN_PASSWORD` env cookie after real Operator users are seeded.

> Migrate-137 is atomic at the DB layer, but **code deploys are not atomic with it** — steps 1 and 3
> are why the dual-read exists. Don't collapse them.

## The auth.ts rewrite (the single most load-bearing edit)

`src/lib/auth.ts` Path 3 (admin) + the session/API-key/device paths currently JOIN `subscriptions`+`users`
and return `{ subscriptionId, role }`. Rewrite to resolve `AuthContext` from `memberships`:

- Replace `subscriptionId` with the resolved scope(s). Keep a back-compat `accountId` getter.
- Derive the **principal type / home surface** from memberships (platform > operator > account > business;
  none = Guest). Each subdomain's middleware re-validates a matching membership.
- **Dual-read window:** if a user has zero membership rows, fall back to the legacy `account_id`(was
  `subscription_id`)+`role` columns. Remove this branch in migrate-138.
- `tp_session` cookie currently encodes `subscriptionId`/`sites[]` as **signed JSON, not DB columns** —
  old cookies survive the rename. Decide TS field renames independently; **force a session refresh** on
  deploy to avoid shape drift (bump the cookie version or expire sessions).
- Operators still arrive via the `tp_admin`/`ADMIN_PASSWORD` cookie until migrate-138 + the Operator-user
  seed; treat that cookie as `(operator, admin)` for now.

## The codemod (mechanical bulk — ~344 files)

Use **ts-morph** (AST-accurate; preferred) or `sed` with an explicit allowlist. Reviewed as ONE large diff.

Identifier renames:
- `subscriptionId` → `accountId` (372 refs/169 files), `.subscriptionId` (228) on AuthContext/Session
- `subscription_id` → `account_id` in raw SQL strings (530 refs/211 files)
- `site_id` → `business_id` in raw SQL strings (1391 refs/344 files)
- `siteId` → `businessId` in TS
- Type names: `Site` → `Business`, `SiteId` → `BusinessId`, `Branch` → `Location`
- Table-name string literals in SQL: `FROM sites`→`FROM businesses`, `branches`→`locations`,
  `gbp_locations`→`gbp_profiles`, `service_areas_canonical`→`service_areas`, `site_gbp_categories`→
  `business_gbp_categories`, `site_social_links`→`business_social_links`, `site_platform_assets`→
  `business_platform_assets`, `asset_branches`→`asset_locations`

Route directory moves (with internal `fetch()` call-site updates):
- `src/app/api/sites/**` → `src/app/api/businesses/**`
- `src/app/api/branches/**` → `src/app/api/locations/**`
- `src/app/api/accounts/**` (the misnamed platform-connection trio) → `src/app/api/integrations/**`
  (folds into existing task #90 Connections→Integrations). **Leave `src/app/api/account/**` SINGULAR
  alone** — it's already the correct Account self-service surface.

## Manual punch-list (codemod CANNOT do these — will miss or corrupt)

1. **GBP triad — do NOT global-replace `gbp_location`.** Three distinct things must stay distinct:
   `businesses.gbp_profile` (JSONB, keep), `gbp_profiles` table (renamed), `locations.gbp_profile_id`
   (renamed from gbp_location_id), and `gbp_profiles.gbp_location_id` (Google's ID — UNCHANGED). Hand-edit
   the ~3 reader files (blog/schema.ts:74, google/link-locations:142, manage/gbp:38) with eyes open.
2. **Dynamic SQL** in `src/lib/geo-match.ts:156-168` — builds table/column names as runtime strings via
   `sql.query()`. The codemod's literal matching misses it. Hand-edit.
3. **migrate-136 production tables** (`media_collateral`, `production_events`, etc.) had bare `site_id`;
   the migration renames the columns, but confirm their src readers got `business_id` (they may use
   string SQL the codemod catches — verify, don't assume).
4. **users.business_id** (was site_id) — `users` now has both `account_id` and `business_id`; make sure
   auth + team-member code references the right one.
5. **`tp_session` cookie shape** + the builders (api/auth/login:73-84, refresh-session:39-51, OAuth
   callbacks, session/route.ts:20-67) — rename TS fields deliberately + version/expire the cookie.
6. **Lingering `site_service_areas` trigger function** — confirm whether it's a SHARED `set_updated_at()`
   (do NOT drop) or table-specific (safe to drop) before any cleanup. NOT in migrate-137 on purpose.
7. **FK constraint + index names** (e.g., `users_subscription_id_fkey`, `idx_collateral_site`) keep old
   names — cosmetic debt. Rename only if you want the hygiene; not behavior-affecting.

## Verification (prod, after step 4)

- `SELECT count(*) FROM memberships` matches expected (owners + team members).
- Log in as: owner (→ app.tracpost.com, business-admin), a team member, and an operator (legacy cookie).
- Hit each renamed surface: businesses list, locations, integrations status, GBP, compose, manage console.
- Grep prod logs for errors mentioning `site_id`/`subscription_id`/`column ... does not exist`/`relation
  ... does not exist`.
- Confirm no orphaned `FROM sites`/`FROM branches` in shipped bundle (`grep` the build output).

## Rollback

- **Before step 3 (code deploy):** migrate-137 rolled back automatically on failure (atomic). If it
  committed but issues surface, the dual-read code (step 1) still works against the new schema — no rush.
- **After step 3:** rolling back the rename is expensive (reverse migration). Prefer fix-forward. This is
  why steps 1-2 bake in a safe pause point: you can sit on the new schema with old+new columns
  indefinitely before deploying the codemod'd code.
