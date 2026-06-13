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

// Platform sub_keys for the integrations task. ALL_SUBS is the full list
// for per-platform sub_task tracking (drawer shows all 8 with connection
// status — operator observability). REQUIRED_SUBS is just GBP, which is
// the only integration that feeds brand identity (brand_categorization via
// business_gbp_categories). The other 7 platforms gate downstream
// publishing/orchestration, not brand identity, so they don't gate the
// parent task. Same REQUIRED/ALL split pattern as business_info /
// gbp_location (LOCKED 2026-06-11 audit).
const INTEGRATION_REQUIRED_SUBS = ["gbp"] as const;
const INTEGRATION_ALL_SUBS = [
  "gbp",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "twitter",
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

// Note: website provisioning has been fully retired from this pipeline.
// Migration 147 collapsed early-stage tasks (website_tracpost_provision +
// website_external_registered) into a single downstream website_provisioning
// gate; migration 151 then retired that gate as a phantom step per
// [[phantom-step-rule]] (its completion criterion was just "the generator's
// outputs exist" — a status echo, not canonical work). The website
// generator lives at /ops/website with its own observability surface;
// provisioning ends at brand_identity_complete (step 12) per
// [[provisioning-scope]].

// gbp_location reshape per the 2026-06-13 GBP-field-categorization
// doctrine: Branding pipeline tracks ONLY Category 1 fields (those that
// shape brand identity). Service areas is the sole survivor — geographic
// scope of the brand feeds CMA + positioning. Hours / address /
// description / social_profile_urls retired (migration 157); hours +
// address + description now live on the Infrastructure GBP card (Cat 2);
// social_profile_urls dropped from operator UI entirely (Cat 3).
// Categories themselves are tracked separately via the brand_categorization
// task (step 3) — they're Cat 1 but have their own dedicated step.
const GBP_REQUIRED_SUBS = ["service_areas"] as const;
const GBP_ALL_SUBS = ["service_areas"] as const;

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
  /** Per-task_key freshness signals. true = the task's output is stale
   *  (its consumed upstream substrate is no longer the latest). The UI
   *  surfaces this as an amber ⚠ corner badge on the card. Currently
   *  computed for brand_readiness_findings only; generalizable to any
   *  task that consumes upstream substrate (see staleTasks comment). */
  staleTasks: Record<string, boolean>;
}> {
  const [biz] = await sql`
    SELECT id, billing_account_id,
           (SELECT id FROM brand_identity WHERE business_id = businesses.id AND is_primary = true LIMIT 1) AS brand_identity_id
    FROM businesses WHERE id = ${businessId}
  `;
  if (!biz) return { taskChanges: 0, subTaskChanges: 0, staleTasks: {} };
  const billingAccountId = biz.billing_account_id as string;
  const brandIdentityId = biz.brand_identity_id as string | null;

  // ── Read state ──
  // Order DESC by run_number so the FIRST row per kind in iteration is the
  // latest (Phase 1 quality gate append-pattern means PPA + findings may
  // have multiple runs; we want the most recent per kind).
  const substrate = await sql`
    SELECT id, kind, run_number, payload, generation_metadata
    FROM business_substrate
    WHERE business_id = ${businessId}
    ORDER BY kind ASC, run_number DESC
  `;
  const substrateMap = new Map<string, Record<string, unknown> | null>();
  // Track latest substrate ID + source-linkage per kind for staleness
  // detection on tasks that consume upstream substrate (e.g.,
  // brand_readiness_findings consumes PPA's substrate id).
  const latestSubstrateIdByKind = new Map<string, string>();
  const sourceLinkageByKind = new Map<string, string | null>();
  for (const r of substrate) {
    const kind = r.kind as string;
    // Only keep the first occurrence per kind (= highest run_number due to DESC).
    if (!substrateMap.has(kind)) {
      substrateMap.set(kind, r.payload as Record<string, unknown> | null);
      latestSubstrateIdByKind.set(kind, r.id as string);
      const meta = r.generation_metadata as Record<string, unknown> | null;
      const inputs = (meta?.inputs as Record<string, unknown> | undefined) ?? {};
      sourceLinkageByKind.set(kind, (inputs.source_substrate_id as string | null | undefined) ?? null);
    }
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
        SELECT key, declared, updated_at FROM brand_descriptor
        WHERE brand_identity_id = ${brandIdentityId}
      `
    : [];
  const descMap = new Map<string, unknown>();
  let latestDescriptorChangeAt: number = 0;
  for (const d of descriptors) {
    descMap.set(d.key as string, d.declared);
    const t = d.updated_at instanceof Date ? d.updated_at.getTime() : 0;
    if (t > latestDescriptorChangeAt) latestDescriptorChangeAt = t;
  }

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
  // GBP profile signals (step 14 sub_tasks) come from businesses.gbp_profile.
  // page_config / work_content / website_copy intentionally NOT read here —
  // they're website-generator outputs, not provisioning inputs. Retired
  // 2026-06-11 along with the website_provisioning phantom step.
  const [bizRow] = await sql`
    SELECT name, business_type, location, commercial_tier_id, hosting_model,
           business_phone, business_email,
           business_logo, business_favicon,
           url, blog_slug,
           gbp_profile,
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

  // gbp_location sub_task signals (5 sub_tasks from migration 148).
  // All read from businesses.gbp_profile JSONB. Per the doctrine:
  // owner-declared at /dashboard/google/profile; operator-side drawer
  // is read-only observability. Hours sub_task is lenient (≥1 day
  // declared with open hours signals owner engagement; days not in
  // regularHours array are implicitly closed per GBP convention).
  const gbpProfile = (bizData.gbp_profile as Record<string, unknown> | null) ?? {};
  const serviceArea = (gbpProfile.serviceArea as Record<string, unknown> | undefined) ?? {};
  const serviceAreaPlaces =
    ((serviceArea.places as Record<string, unknown> | undefined)?.placeInfos as Array<unknown> | undefined) ?? [];

  // gbp_location sub_task — Cat 1 (brand identity) only per the 2026-06-13
  // doctrine. Hours, address, description, social_profile_urls retired
  // from this step (migration 157); they belong on the Infrastructure GBP
  // card (Cat 2) or are disregarded entirely (Cat 3).
  const gbpSubStatus: Record<string, boolean> = {
    // At least one service area declared (≤20 per Google cap).
    service_areas: serviceAreaPlaces.length >= 1,
  };

  // website_provisioning retired 2026-06-11 per [[phantom-step-rule]] +
  // [[provisioning-scope]]. Its completion criterion was just "the
  // generator's outputs exist" (page_config + website_copy + work_content
  // populated) — a status echo of the downstream website generator, not
  // canonical work of its own. The generator lives at /ops/website with
  // its own observability surface; provisioning ends at brand_identity_
  // _complete (step 12).

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

    // gbp_location sub_tasks (see gbpSubStatus above)
    ...gbpSubStatus,
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
            AND task_key IN ('brand_strategic', 'brand_verbal', 'brand_visual', 'brand_sonic', 'integrations', 'business_info', 'gbp_location')
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
    // brand_triage retired 2026-06-11 per [[phantom-step-rule]] — the
    // verdict tag lives in PPA's payload.meta.verdict and is computed
    // there. No standalone work happened in this step; it just gated on
    // "PPA done AND CMA done" which was already encoded in the
    // dependency graph. brand_readiness_findings now depends directly
    // on brand_public_presence + brand_cma.
    brand_readiness_findings: substrateMap.has("readiness_findings") ? "complete" : "pending",
    brand_findings_resolved: findingsResolved ? "complete" : "pending",
    brand_strategic: rollupDomain(STRATEGIC_SUBS),
    brand_verbal: rollupDomain(VERBAL_SUBS),
    brand_visual: rollupDomain(VISUAL_SUBS),
    brand_sonic: rollupDomain(SONIC_SUBS),
    integrations: rollupDomain(INTEGRATION_REQUIRED_SUBS),
    // business_info: parent completes only when all REQUIRED sub_tasks
    // complete. Optional sub_tasks (contact, branding, web_identity) show
    // progress but don't block.
    business_info: rollupDomain(BUSINESS_INFO_REQUIRED_SUBS),
    // gbp_location: parent completes only when 3 required sub_tasks
    // (service_areas, hours, address) all complete. The 2 optional
    // sub_tasks (description, social_profile_urls) show progress but
    // don't block. Per the doctrine: tenant-owned declarations;
    // operator-side drawer is read-only observability.
    gbp_location: rollupDomain(GBP_REQUIRED_SUBS),
  };
  // search_console retired from branding pipeline 2026-06-12 — moved to
  // /ops/seo as part of the Infrastructure milestone scope.

  // ── brand_identity_complete: snapshot-gated, not domain-gated ──
  //
  // Per [[phantom-step-rule]] this step does its own canonical work — sealing
  // the catalog into an immutable brand_identity_snapshot substrate that
  // surfaces translate from ([[brand-identity-layer-stack]]). Completion =
  // "snapshot exists". 4-domain completion is a PRECONDITION (operator can't
  // seal until all 4 are complete), not the completion criterion itself.
  const allDomainsComplete =
    upstreamStatus.brand_strategic === "complete" &&
    upstreamStatus.brand_verbal === "complete" &&
    upstreamStatus.brand_visual === "complete" &&
    upstreamStatus.brand_sonic === "complete";
  const snapshotExists = substrateMap.has("brand_identity_snapshot");
  upstreamStatus.brand_identity_complete = snapshotExists ? "complete" : "pending";

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

  // ── Staleness signals ──
  //
  // A task's staleness = "the consumed upstream substrate is no longer
  // the latest." For tasks that consume substrate (find their
  // source_substrate_id pointing back), compare to the latest substrate
  // id for that source kind.
  //
  // Currently computed for brand_readiness_findings only — its
  // consolidator stamps the consumed PPA observation id in
  // generation_metadata.inputs.source_substrate_id. If a fresher PPA
  // run exists, findings are stale and should be re-consolidated.
  //
  // Generalizable to: brand_findings_resolved (consumed findings substrate),
  // any future task that records a source_substrate_id linkage, etc.
  const staleTasks: Record<string, boolean> = {};

  const latestPpaSubstrateId = latestSubstrateIdByKind.get("public_presence_observation");
  const findingsSourceSubstrateId = sourceLinkageByKind.get("readiness_findings");
  if (
    substrateMap.has("readiness_findings") &&
    latestPpaSubstrateId &&
    findingsSourceSubstrateId &&
    findingsSourceSubstrateId !== latestPpaSubstrateId
  ) {
    staleTasks.brand_readiness_findings = true;
  }

  // brand_identity_complete: stale if a descriptor was edited after the
  // snapshot's sealed_at — the canonical catalog diverged from what
  // surfaces are translating from. Operator should re-seal.
  if (snapshotExists) {
    const snapshotPayload = substrateMap.get("brand_identity_snapshot") as {
      meta?: { sealed_at?: string };
    } | null;
    const sealedAtIso = snapshotPayload?.meta?.sealed_at ?? null;
    const sealedAtMs = sealedAtIso ? new Date(sealedAtIso).getTime() : 0;
    if (sealedAtMs > 0 && latestDescriptorChangeAt > sealedAtMs) {
      staleTasks.brand_identity_complete = true;
    }
  }

  return { taskChanges, subTaskChanges, staleTasks };
}
