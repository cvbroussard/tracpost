# Schema Audit for v3 (migrate-137) — Ground-Truth Inventory & Blast Radius

Read-only audit (2026-05-28). Sources: `scripts/migrate.js` (base "001") + `scripts/migrate-*.js`
(incremental — current shape = the accumulation); `src/**/*.ts|tsx` for readers/writers.

## 0. Corrections to the planning assumptions
1. **`team_members` was DROPPED** in migrate-030c (consolidated into `users` in 029/030). ZERO src refs.
   The "three identity mechanisms" is really **two** live ones: the `users` table + the `tp_admin` env cookie.
2. `subscriptions` is itself a rename survivor: base was `subscribers` (migrate.js), split in 030 into
   `subscriptions` + `users`; `subscribers` DROPPED (030c).
3. `subscriptions` already has `plan_id` FK→`plans` (092/093) coexisting with a legacy `plan` TEXT column.
4. **`users.site_id`** (FK→sites, migrate-030) was omitted from the plan; it must be renamed to `business_id`.
   `users` also carries email, password_hash, phone, session_token_hash, device_token, magic_token_*,
   last_active_at, is_active, notify_via — these are what `memberships` (and a slimmed `users`) must carry.
5. `tp_session` cookie encodes `subscriptionId`/`subscriptionName`/`sites[]`/`activeSiteId` as signed JSON,
   NOT DB columns. Old cookies survive a DB rename; the TS field renames are a separate code-level concern
   (force a session refresh to avoid shape drift).

## 1. Inventory (status: LIVE / LEGACY / DEAD / DROPPED)

### Core / base (migrate.js)
- `subscribers` [DROPPED 030c]
- `sites` [LIVE → **businesses**]
- `social_accounts` [LIVE, subscription_id]
- `social_posts` [LIVE, account_id + source_asset_id + site_id]
- `social_post_analytics` [LIVE]; `social_account_analytics` [LEGACY]
- `social_triggers` [LEGACY, site_id]; `social_post_history` [LEGACY]
- `seo_audits` [LIVE, site_id]; `seo_content` [LEGACY, site_id]
- `gbp_locations` [LIVE → **gbp_profiles**; site_id; HAS its own `gbp_location_id` col — see risk #1]
- `gbp_credentials` [LIVE, site_id UNIQUE]
- `usage_log` [LEGACY, subscription_id + site_id]
- `media_assets` [LIVE — 105 files; site_id; `triage_status` renamed `processing_stage` in 135]
- `publishing_slots` [LEGACY, site_id + account_id]; `subscriber_actions` [DEAD, site_id]

### `sites` columns (→ businesses)
id, subscription_id (→account_id), name, url, external_id, blog_slug, place_id, place_lat, place_lon,
place_name, place_set_at, reach_default_radius_miles, service_area_radius_miles, service_area_label,
timezone, location, business_phone, mobile_settings, brand_dna, brand_playbook, autopilot_config,
autopilot_pool_weights, autopilot_enabled, cadence_config, content_pillars, pillar_config, tag_group_config,
page_config, gbp_profile (JSONB, mig-045), website_copy, work_content, active_brand_source,
brand_label, project_label, client_label, branch_label (was location_label),
entity_label_1..4 / entity_flags_1..4 (orphan, mig-031), face_policy, face_waiver_*, identity_policy,
identity_waiver_*, minor_face_policy, minor_face_waiver_*.
Named CHECK constraints: sites_face_policy_check, sites_identity_policy_check, sites_minor_face_policy_check.

### Identity / billing
- `subscriptions` [030, LIVE → **accounts**; plan, plan_id→plans, api_key_hash, is_active]
- `users` [030, LIVE → slim + **memberships**; subscription_id, site_id, role, email, password_hash,
  session_token_hash, ...]
- `team_members` [021, DROPPED 030c]
- `plans` [049→093, LIVE — 12 readers]

### Entities (031/032 lineage)
- `entities` [was `vendors`, LIVE — drives /api/vendors; carries BOTH subscription_id AND site_id — risk #3]
- `asset_entities` [DEAD]
- `brands` [032, LIVE — 31 readers, site_id]
- `projects` [032, LIVE — 37 readers, site_id]
- `clients` [032, DEAD — 0 readers]  ← note: a `clients` table already existed and is dead
- `locations` [032, DROPPED → branches in 110]
- `branches` [LIVE → **locations**; site_id, gbp_location_id→gbp_profile_id, phone, hours, is_primary]
- `asset_brands` [LIVE 25]; `asset_projects` [LIVE 32]; `asset_clients` [DEAD 0]; `asset_branches` [LIVE 3, branch_id]

### Service areas
- `service_areas_canonical` [109, LIVE → **service_areas**; self-FK parent_region_id, kind CHECK, place_id, viewport]
- `site_service_areas` [109, DROPPED 120 — orphan trigger `trg_site_service_areas_updated_at` + function linger]
- `asset_service_areas` [112, DROPPED 120]
- `services` [035, LIVE 16, site_id]; `services_v2` [095, LIVE 11, site_id]
- `service_gbp_categories` [037, LEGACY 1]

### GBP
- `gbp_categories` [036, LIVE 4]; `site_gbp_categories` [036, LIVE 23, site_id]; `gbp_photo_sync` [041, LIVE 10, site_id]

### Content / blog / v2
- `blog_settings` [005, LIVE 29, site_id PK]; `blog_posts` [005, LIVE 62, site_id]; `blog_imports` [008, LIVE]
- `blog_posts_v2` [095, LIVE 21]; `projects_v2` [095, LIVE 11]; v2 join tables [095]
- `project_chapters` / `chapter_templates` [097, LIVE]
- `post_templates` [090, LEGACY 3]; `historical_posts` [056, LEGACY 4, subscription_id + site_id]
- `content_topics` / `hook_bank` [010, LIVE 4/9, site_id]; `rss_feeds` [016, LEGACY 3, site_id]

### Render / production
- `render_templates` / `render_history` / `carousel_compositions` [038, LEGACY]
- `asset_templates` / `asset_variants` [100, LEGACY]
- `media_components` / `media_collateral` / `collateral_layers` / `collateral_embeds` / `production_events`
  [136, LIVE — **site_id is a BARE UUID, no FK** — risk #4]
- `image_corrections` [025, LIVE 2, site_id]; `content_corrections` [044, LIVE 4, site_id]

### Inbox / engage / spotlight
- `inbox_comments` / `inbox_reviews` / `inbox_messages` [014, LIVE, site_id + subscription_id]; `inbox_sync_cursors` [014]
- `engaged_persons` / `handles` / `events` / `capture_runs` [054, LEGACY, subscription_id + site_id]
- `spotlight_sessions` / `kiosks` / `analytics` [015, LIVE]

### Other
push_tokens [007, subscription_id], notifications [059, subscription_id], onboarding_submissions [058,
subscription_id], comms_consent [062, subscription_id], coaching_progress [063, subscription_id],
coaching_walkthroughs/nodes [064, LIVE], category_coaching_runs [122, site_id], competitive_market_analyses
[121, site_id], subscriber_pickers [128, site_id], asset_categories [124], data_exports [009, LEGACY,
subscription_id], departure_redirects [009, LEGACY, site_id], page_scores [046, site_id], search_performance
[047, site_id], post_analytics [013, LEGACY/DEAD], recordings [107, site_id], wipe_log [061, subscription_id],
site_social_links [003, LEGACY, site_id], platform_assets / site_platform_assets [051, LIVE, site_id],
personas / asset_personas [011, DROPPED 129], vendors / asset_vendors [024, DROPPED → renamed `entities` 031].

## 2. Status totals
~90 tables ever created; ~75 currently live in DB. **~70 LIVE, ~20 LEGACY, ~5 DEAD**
(asset_entities, clients, asset_clients, subscriber_actions, post_analytics), ~10 DROPPED
(subscribers, team_members, vendors, locations, personas, site_service_areas, asset_service_areas, products).

## 3. Blast radius
- **`sites`**: 373 SQL refs / 238 files (71 writers). Routes: /api/sites/route.ts, sites/[id]/toggle,
  sites/delete-request, /api/dashboard/sites, /api/admin/sites/**, /api/manage/site, /api/site/privacy.
- **`subscription_id`**: 530 refs / 211 files; `subscriptionId` 372/169; `.subscriptionId` 228.
  19 tables: sites, users, social_accounts, usage_log, data_exports, entities, push_tokens,
  spotlight_sessions, inbox_*, engaged_persons, engagement_events, historical_posts, onboarding_submissions,
  notifications, comms_consent, coaching_progress, wipe_log. Legacy `subscriber_id` 15/4 files
  (auth.ts Path-3 fallback + provisioning).
- **`site_id`**: 1391 refs / 344 files; ~40 tables (incl `users.site_id` and the FK-less migrate-136 tables).
- **`branches` → locations**: geo-match.ts:71,134 (+ dynamic asset_branches @156), render/platform-specific.ts:99,
  api/branches/route.ts:27,73, api/branches/[id]/route.ts:19,35-66,83, manage/asset-analysis/[assetId]:54,
  auto-tag-suggest:185, admin/sites/[siteId]/page.tsx:50, tenant projects/[projectSlug]:80,
  dashboard/media/page.tsx:211, dashboard/project-preview/[slug]:56, dashboard/tagging/page.tsx:36.
  Rename API dir /api/branches → /api/locations.
- **`gbp_locations` → gbp_profiles**: blog/schema.ts:74, google/link-locations:142, manage/gbp:38.
- **`service_areas_canonical` → service_areas**: competitive-intel/query-derivation:97, gbp/enrich-place:46,51,62,
  gbp/profile:384, categorization/service-area-match:91.
- **`team_members`**: NONE. Already gone.
- **Admin path**: lib/auth.ts (Path 3 JOIN subscriptions+users), lib/admin-session.ts, middleware.ts,
  lib/cookie-sign.ts, lib/cookie-sign-edge.ts, api/auth/admin/route.ts (ADMIN_PASSWORD). `actingAsAdmin`
  in ~60 routes (all api/admin/**, api/manage/**, + assets/[id]/categories, blog/domain, google/categories,
  google/link-locations, hooks/use-asset-analysis.ts, lib/asset-analysis-api.ts). ~67 files total.
- **AuthContext / Session**: `.subscriptionId` 228x, `.role` ~14x; cookie built in api/auth/login:73-84,
  refresh-session:39-51, OAuth callbacks; session/route.ts:20-67.
- **API dirs to rename**: /api/sites → /api/businesses, /api/branches → /api/locations.
  NOTE: **/api/accounts and /api/account already exist** (unrelated to subscriptions) — namespace-collision
  risk on the accounts rename.

## 4. Surprises & risks (ranked)
1. **GBP triad collision**: `sites.gbp_profile` (JSONB) + new `gbp_profiles` table + new `branches.gbp_profile_id`;
   and `gbp_location_id` exists on BOTH `branches` (rename → gbp_profile_id) and `gbp_locations` (its own
   Google ID — must NOT rename). Per-table scoping required; a blind find-replace corrupts the gbp_locations col.
2. **`team_members` & `subscribers` already dropped** — don't migrate data from them.
3. **`entities`** (renamed `vendors`) is live via /api/vendors, carries subscription_id + site_id — include in sweeps.
4. **migrate-136 production tables have bare `site_id`, no FK** — missed by an FK-driven rename; code still reads it.
5. **`subscriptions` plan/plan_id duality** + named constraints; follow the migrate-093 RENAME CONSTRAINT precedent.
6. **Dynamic SQL** geo-match.ts:156-168 (`sql.query` with string table/col names) — find-replace misses it.
7. **`tp_session` cookie** carries subscriptionId/sites[] as signed JSON; old cookies survive rename; decide
   TS field renames independently; force refresh to avoid shape drift.
8. **Orphan trigger/function** from dropped `site_service_areas`; drop in 137 for hygiene.
9. **`users.site_id`** (FK→sites) omitted from the plan — handle when both sites→businesses and users→memberships land.
10. **Named CHECK constraints** (sites_*_check, service_areas kind) keep the old prefix unless explicitly renamed.
11. **Scale**: 238 files (sites), 344 (site_id), 211 (subscription_id) — the migrate-093 pattern at ~10x.
    The code sweep, not the DDL, is the risk.
