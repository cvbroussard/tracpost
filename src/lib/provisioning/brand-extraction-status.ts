/**
 * Brand Extraction status recompute.
 *
 * Reads the actual state of substrate / brand_descriptor / CMA / readiness
 * findings + resolutions and updates the corresponding provisioning_tasks
 * and provisioning_sub_tasks rows for a given business.
 *
 * Architecture: status is DERIVED from current catalog state, not pushed
 * via event hooks. The recompute is called from /api/ops/provisioning GET
 * so the pipeline always reflects truth on every load. If the sub_task
 * table is wrong, the next page render corrects it.
 *
 * Design per the 2026-06-07 status-plumbing lock: descriptor declarations,
 * substrate writes, finding resolutions are all observed AT-READ-TIME,
 * not coupled to write-side callbacks. Single-source-of-truth principle
 * keeps Brand Extraction state honest without scattering plumbing across
 * every write site.
 */
import "server-only";
import { sql } from "@/lib/db";

// Sub_keys per domain, kept in sync with migrate-brand-extraction-provisioning-tasks.js
const STRATEGIC_SUBS = ["positioning", "audience", "offer", "proof", "cta"] as const;
const VERBAL_SUBS = [
  "voice_source",
  "voice_source.character",
  "tone.attributes",
  "tone.example",
  "tone.effect",
  "mechanical_style",
  "lexicon",
  "avoid",
  "tagline",
] as const;
const VISUAL_SUBS = [
  "aesthetic",
  "environmental_look",
  "subject_style",
  "palette",
  "logo",
  "do_not_show",
] as const;
const SONIC_SUBS = ["composite_specimen", "pronunciation"] as const;

// Platform sub_keys for the integrations task (consolidated 2026-06-07).
// integrations.{platform} = OAuth-connected to TracPost.
const INTEGRATION_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "twitter",
  "gbp",
] as const;

// Sub_keys for business_info — REQUIRED set (must complete for parent task
// to flip to complete). Optional sub_keys also exist (contact, branding,
// web_identity) but don't gate the parent.
const BUSINESS_INFO_REQUIRED_SUBS = [
  "basics",
  "commercial_tier",
  "hosting_model",
  "safeguard_faces",
  "safeguard_minors",
  "safeguard_identity",
] as const;

// Full list (required + optional) — used for sub_task UPDATE scope.
const BUSINESS_INFO_ALL_SUBS = [
  "basics",
  "commercial_tier",
  "hosting_model",
  "contact",
  "branding",
  "web_identity",
  "safeguard_faces",
  "safeguard_minors",
  "safeguard_identity",
] as const;

// Note: the early-stage website task (website_tracpost_provision +
// website_external_registered, both at sort 15) was retired by migration
// 147. Replaced with a single downstream `website_provisioning` task
// gated on brand_identity_complete. That task's drawer is a click-out
// to /ops/website (or its successor) — no inline sub_tasks per the
// strategic decision (LOCKED 2026-06-08, [[hosting-positioning]]).

// Helpers ────────────────────────────────────────────────────────────────────

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function fieldPresent(declared: unknown, field: string): boolean {
  if (!isNonEmptyObject(declared)) return false;
  const v = declared[field];
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  return true;
}

function declaredAny(declared: unknown): boolean {
  if (declared === null || declared === undefined) return false;
  if (typeof declared === "string") return declared.trim().length > 0;
  if (Array.isArray(declared)) return declared.length > 0;
  if (typeof declared === "object") return Object.keys(declared as Record<string, unknown>).length > 0;
  return true;
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Recompute Brand Extraction statuses for one business. Idempotent.
 * Returns the count of status changes applied (0 if already up to date).
 */
export async function recomputeBrandExtractionStatus(businessId: string): Promise<{
  taskChanges: number;
  subTaskChanges: number;
}> {
  const [biz] = await sql`
    SELECT id, billing_account_id,
           (SELECT id FROM brand_identity WHERE business_id = businesses.id AND is_primary = true LIMIT 1) AS brand_identity_id
    FROM businesses WHERE id = ${businessId}
  `;
  if (!biz) return { taskChanges: 0, subTaskChanges: 0 };
  const billingAccountId = biz.billing_account_id as string;
  const brandIdentityId = biz.brand_identity_id as string | null;

  // ── Read state ──
  const substrate = await sql`
    SELECT kind, payload FROM business_substrate WHERE business_id = ${businessId}
  `;
  const substrateMap = new Map<string, Record<string, unknown> | null>();
  for (const r of substrate) {
    substrateMap.set(r.kind as string, r.payload as Record<string, unknown> | null);
  }

  const [cma] = await sql`
    SELECT status FROM competitive_market_analyses
    WHERE business_id = ${businessId}
    ORDER BY created_at DESC LIMIT 1
  `;
  const cmaComplete =
    cma && typeof cma.status === "string" && ["complete", "completed"].includes(cma.status);

  const descriptors = brandIdentityId
    ? await sql`
        SELECT key, declared FROM brand_descriptor
        WHERE brand_identity_id = ${brandIdentityId}
      `
    : [];
  const descMap = new Map<string, unknown>();
  for (const d of descriptors) descMap.set(d.key as string, d.declared);

  // Readiness findings + resolutions
  const findingsSubstrate = substrateMap.get("readiness_findings");
  const findingsList = Array.isArray(findingsSubstrate?.findings)
    ? (findingsSubstrate!.findings as Array<Record<string, unknown>>)
    : [];
  const findingsRequiringAction = findingsList.filter(
    (f) => f.severity === "blocking" || f.severity === "refinement",
  );

  let findingsResolved = false;
  if (findingsSubstrate !== undefined) {
    if (findingsRequiringAction.length === 0) {
      findingsResolved = true;
    } else {
      const [resCount] = await sql`
        SELECT COUNT(*)::int AS n FROM readiness_finding_resolutions
        WHERE business_id = ${businessId} AND status IN ('resolved', 'waived', 'deferred')
      `;
      findingsResolved = (resCount?.n as number) >= findingsRequiringAction.length;
    }
  }

  // Integration platforms — read business_platform_assets joined to
  // platform_assets to determine which platforms have a primary asset
  // assigned for this business. The data model:
  //   - social_accounts is per-billing_account (the OAuth grant)
  //   - platform_assets is each Page/Profile/Property visible under that grant
  //     (per-platform .platform values: instagram, facebook, gbp, tiktok, etc.)
  //   - business_platform_assets binds a specific platform_asset to a business
  //     with is_primary=true marking the active assignment
  // A platform is "connected" for this business if it has an is_primary
  // business_platform_assets row.
  const platformRows = await sql`
    SELECT DISTINCT pa.platform
    FROM business_platform_assets bpa
    JOIN platform_assets pa ON pa.id = bpa.platform_asset_id
    WHERE bpa.business_id = ${businessId}
      AND bpa.is_primary = true
  `;
  const connectedPlatforms = new Set<string>();
  for (const r of platformRows) connectedPlatforms.add(r.platform as string);

  // brand_categorization signal — task complete iff business_gbp_categories
  // has at least one is_primary=true row. Per the theoretical model:
  // platform-owned, recurring measurement pass, upstream of CMA. Phase 1
  // gate is binary; the recurring-quality-gate doctrine handles re-runs
  // (manual via /ops/categories-coaching coaching ceremony, or auto via
  // the legacy categorizeForSite() bridge call from onPlaybookSharpened).
  const [catRow] = await sql`
    SELECT COUNT(*) FILTER (WHERE is_primary = true)::int AS primary_count,
           COUNT(*)::int AS total_count
    FROM business_gbp_categories
    WHERE business_id = ${businessId}
  `.catch(() => [{ primary_count: 0, total_count: 0 }]);
  const categorizationComplete = (catRow?.primary_count ?? 0) > 0;

  // business_info sub_task data — read all relevant columns in one query.
  // OG metadata lives separately in seo_content; pulled in parallel.
  // Website provisioning signals come from businesses + blog_settings.
  const [bizRow] = await sql`
    SELECT name, business_type, location, commercial_tier_id, hosting_model,
           business_phone, business_email,
           business_logo, business_favicon,
           url, blog_slug, page_config, work_content, website_copy,
           face_waiver_signed_at, minor_face_waiver_signed_at, identity_waiver_signed_at
    FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  const [seoRow] = await sql`
    SELECT og_title, og_description
    FROM seo_content WHERE business_id = ${businessId} LIMIT 1
  `.catch(() => [null]);
  const [blogSettingsRow] = await sql`
    SELECT custom_domain, subdomain
    FROM blog_settings WHERE business_id = ${businessId} LIMIT 1
  `.catch(() => [null]);

  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const presentValue = (v: unknown) => v !== null && v !== undefined;

  const bizData = bizRow ?? {};
  const seo = seoRow ?? {};
  const blogSettings = blogSettingsRow ?? {};

  const businessInfoSubStatus: Record<string, boolean> = {
    // Required — basics: all three must be present
    basics:
      nonEmpty(bizData.name) &&
      nonEmpty(bizData.business_type) &&
      nonEmpty(bizData.location),
    // Required — commercial tier picked
    commercial_tier: presentValue(bizData.commercial_tier_id),
    // Required — hosting model declared. Forks the pipeline at step 15
    // between Website (TracPost-hosted) Provisioning and Website
    // (externally hosted) Registered per [[ppa-business-health-checkup]].
    hosting_model: presentValue(bizData.hosting_model),
    // Optional — at least one contact channel
    contact: nonEmpty(bizData.business_phone) || nonEmpty(bizData.business_email),
    // Optional — at least logo (favicon is auto-derivable from logo)
    branding: nonEmpty(bizData.business_logo),
    // Optional — URL + at least one OG field
    web_identity: nonEmpty(bizData.url) && (nonEmpty(seo.og_title) || nonEmpty(seo.og_description)),
    // Required — content safeguard waivers signed
    safeguard_faces: presentValue(bizData.face_waiver_signed_at),
    safeguard_minors: presentValue(bizData.minor_face_waiver_signed_at),
    safeguard_identity: presentValue(bizData.identity_waiver_signed_at),
  };

  // website_provisioning task — sub_task-less per the strategic decision.
  // Completion criterion: TracPost-hosted brands need page_config +
  // website_copy + work_content all populated (the actual generation
  // pipeline has run). External-hosted brands: marked not_applicable
  // below in the hosting-model fork.
  const pageConfigArray = bizData.page_config;
  const workContentObj = bizData.work_content;
  const tracpostHostingProvisioned =
    nonEmpty(blogSettings.custom_domain) &&
    Array.isArray(pageConfigArray) && pageConfigArray.length > 0 &&
    (typeof bizData.website_copy === "object" && bizData.website_copy !== null) &&
    typeof workContentObj === "object" && workContentObj !== null &&
    Object.keys(workContentObj as Record<string, unknown>).length > 0;

  // ── Compute desired sub_task completion ──

  const env_look = descMap.get("environmental_look");
  const subject_style = descMap.get("subject_style");

  const subStatus: Record<string, boolean> = {
    // Strategic
    positioning: declaredAny(descMap.get("positioning")),
    audience: declaredAny(descMap.get("audience")),
    offer: declaredAny(descMap.get("offer")),
    proof: declaredAny(descMap.get("proof")),
    cta: declaredAny(descMap.get("cta")),

    // Verbal
    voice_source: declaredAny(descMap.get("voice_source")),
    "voice_source.character": fieldPresent(descMap.get("voice_source"), "character"),
    "tone.attributes": fieldPresent(descMap.get("tone"), "attributes"),
    "tone.example": fieldPresent(descMap.get("tone"), "example"),
    "tone.effect": fieldPresent(descMap.get("tone"), "effect"),
    mechanical_style: fieldPresent(descMap.get("mechanical_style"), "selected_example"),
    lexicon: fieldPresent(descMap.get("lexicon"), "vocabulary_axes"),
    avoid: declaredAny(descMap.get("avoid")),
    tagline: fieldPresent(descMap.get("tagline"), "selected_example"),

    // Visual — aesthetic is observation-derived (the Public Presence Analysis IS the aesthetic source).
    // env_look / subject_style accept BOTH new picker shape AND legacy free-text string for migration tolerance.
    aesthetic: substrateMap.has("public_presence_observation"),
    environmental_look:
      fieldPresent(env_look, "selected_example") ||
      (typeof env_look === "string" && env_look.trim().length > 0),
    subject_style:
      fieldPresent(subject_style, "selected_example") ||
      (typeof subject_style === "string" && subject_style.trim().length > 0),
    palette: declaredAny(descMap.get("palette")),
    logo: declaredAny(descMap.get("logo")),
    do_not_show: declaredAny(descMap.get("do_not_show")),

    // Sonic — composite_specimen is Path B deferred; pronunciation owner-declared
    composite_specimen: declaredAny(descMap.get("composite_specimen")),
    pronunciation: declaredAny(descMap.get("pronunciation")),

    // Integrations — OAuth-connected platforms per the integrations task.
    instagram: connectedPlatforms.has("instagram"),
    facebook: connectedPlatforms.has("facebook"),
    tiktok: connectedPlatforms.has("tiktok"),
    youtube: connectedPlatforms.has("youtube"),
    pinterest: connectedPlatforms.has("pinterest"),
    linkedin: connectedPlatforms.has("linkedin"),
    twitter: connectedPlatforms.has("twitter"),
    gbp: connectedPlatforms.has("gbp"),

    // business_info sub_tasks (see businessInfoSubStatus above)
    ...businessInfoSubStatus,
  };

  // ── Apply sub_task updates ──
  let subTaskChanges = 0;
  for (const [subKey, isComplete] of Object.entries(subStatus)) {
    const newStatus = isComplete ? "complete" : "pending";
    const result = await sql`
      UPDATE provisioning_sub_tasks
      SET status = ${newStatus},
          completed_at = ${isComplete ? sql`COALESCE(completed_at, NOW())` : null}
      WHERE sub_key = ${subKey}
        AND task_id IN (
          SELECT id FROM provisioning_tasks
          WHERE billing_account_id = ${billingAccountId}
            AND task_key IN ('brand_strategic', 'brand_verbal', 'brand_visual', 'brand_sonic', 'integrations', 'business_info')
        )
        AND status IS DISTINCT FROM ${newStatus}
      RETURNING id
    `;
    subTaskChanges += Array.isArray(result) ? result.length : 0;
  }

  // ── Compute desired task statuses ──

  const rollupDomain = (subs: readonly string[]): "complete" | "in_progress" | "pending" => {
    const completeCount = subs.filter((s) => subStatus[s]).length;
    if (completeCount === subs.length) return "complete";
    if (completeCount > 0) return "in_progress";
    return "pending";
  };

  const upstreamStatus: Record<string, "complete" | "in_progress" | "pending" | "not_applicable"> = {
    brand_categorization: categorizationComplete ? "complete" : "pending",
    brand_public_presence: substrateMap.has("public_presence_observation") ? "complete" : "pending",
    brand_cma: cmaComplete ? "complete" : "pending",
    brand_triage:
      substrateMap.has("public_presence_observation") && cmaComplete ? "complete" : "pending",
    brand_readiness_findings: substrateMap.has("readiness_findings") ? "complete" : "pending",
    brand_findings_resolved: findingsResolved ? "complete" : "pending",
    brand_strategic: rollupDomain(STRATEGIC_SUBS),
    brand_verbal: rollupDomain(VERBAL_SUBS),
    brand_visual: rollupDomain(VISUAL_SUBS),
    brand_sonic: rollupDomain(SONIC_SUBS),
    integrations: rollupDomain(INTEGRATION_PLATFORMS),
    // business_info: parent completes only when all REQUIRED sub_tasks
    // complete. Optional sub_tasks (contact, branding, web_identity) show
    // progress but don't block.
    business_info: rollupDomain(BUSINESS_INFO_REQUIRED_SUBS),
    // website_provisioning: downstream task gated on brand_identity_complete.
    // Completion criterion is "the catalog-driven render pipeline has run"
    // — page_config + website_copy + work_content all populated. The
    // hosting-model fork below overrides this to 'not_applicable' for
    // externally-hosted brands per [[hosting-positioning]].
    website_provisioning: tracpostHostingProvisioned ? "complete" : "pending",
  };

  // ── Hosting-model fork (Step 15: website_provisioning) ──
  //
  // Per [[hosting-positioning]]: TracPost offers root-domain hosting OR
  // a content feed (external_hosted). The website_provisioning task only
  // applies to TracPost-hosted brands. For external-hosted brands it's
  // marked 'not_applicable' — they don't need a TracPost-served site.
  // Downstream tasks (search_console) that depended on the old website
  // tasks now treat 'not_applicable' as satisfying their dependency
  // (handled in the UI's isBlocked check).
  const hostingModel = bizData.hosting_model as string | null | undefined;
  if (hostingModel === "external_hosted") {
    upstreamStatus.website_provisioning = "not_applicable";
  }
  // hostingModel === 'tracpost_hosted' → status from tracpostHostingProvisioned above
  // hostingModel === null              → pending; subscriber must declare hosting model first
  const allDomainsComplete =
    upstreamStatus.brand_strategic === "complete" &&
    upstreamStatus.brand_verbal === "complete" &&
    upstreamStatus.brand_visual === "complete" &&
    upstreamStatus.brand_sonic === "complete";
  upstreamStatus.brand_identity_complete = allDomainsComplete ? "complete" : "pending";

  // ── Apply task updates ──
  let taskChanges = 0;
  for (const [taskKey, newStatus] of Object.entries(upstreamStatus)) {
    const completedAt = newStatus === "complete" ? sql`COALESCE(completed_at, NOW())` : null;
    const startedAt = newStatus === "in_progress" ? sql`COALESCE(started_at, NOW())` : sql`started_at`;
    const result = await sql`
      UPDATE provisioning_tasks
      SET status = ${newStatus},
          completed_at = ${completedAt},
          started_at = ${startedAt}
      WHERE billing_account_id = ${billingAccountId}
        AND task_key = ${taskKey}
        AND status IS DISTINCT FROM ${newStatus}
      RETURNING id
    `;
    taskChanges += Array.isArray(result) ? result.length : 0;
  }

  return { taskChanges, subTaskChanges };
}
