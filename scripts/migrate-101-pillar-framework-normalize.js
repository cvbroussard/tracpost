/**
 * Pillar framework normalization (per design lock 2026-05-08).
 *
 * The pillar framework IDs (what/how/who/proof/why) are the read-only
 * structural truth. Sites that have customized IDs (e.g., B Squared
 * Construction's "diagnostic_craft") get their pillar_config rewritten
 * so id = framework slot, label = the previous custom id rendered as
 * a human label.
 *
 * Asset references (media_assets.content_pillar + content_pillars) are
 * also remapped so they keep pointing at the right slot post-rewrite.
 *
 * Site-by-site mapping is HARDCODED below — the strategic call about
 * which custom ID maps to which framework slot is not automatable.
 *
 * Run: node scripts/migrate-101-pillar-framework-normalize.js
 *
 * Idempotent: re-running on a site that's already normalized is a no-op.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const FRAMEWORK_IDS = ["what", "how", "who", "proof", "why"];

const FRAMEWORK_LABELS = {
  what: "What We Do",
  how: "How We Do It",
  who: "Who We Work With",
  proof: "Proof It Works",
  why: "Why It Matters",
};

/**
 * Per-site mapping: { siteName: { oldId: frameworkId } }
 *
 * Update this when new sites need normalization. The audit step will
 * print every site with non-framework IDs — copy each one's mapping
 * here based on which framework slot fits the pillar's intent.
 */
const SITE_MAPPINGS = {
  "B Squared Construction": {
    diagnostic_craft: "what",       // Complex Project Diagnosis = the actual service
    execution_process: "how",       // Renovation Execution Standards = the methodology
    crew_materials: "who",          // In-House Crew & Materials = the people/partners
    project_outcomes: "proof",      // Completed Complex Projects = case studies
    pittsburgh_expertise: "why",    // Pittsburgh Housing Stock Knowledge = perspective
  },
  // Add other sites here as the audit reveals them
};

async function audit(sql) {
  const sites = await sql`SELECT id, name, pillar_config FROM sites WHERE pillar_config IS NOT NULL`;
  const violations = [];
  for (const site of sites) {
    const config = site.pillar_config;
    if (!Array.isArray(config)) continue;
    const badIds = config
      .map((p) => p && p.id)
      .filter((id) => id && !FRAMEWORK_IDS.includes(id));
    if (badIds.length > 0) {
      violations.push({
        siteId: site.id,
        siteName: site.name,
        badIds,
        configCount: config.length,
      });
    }
  }
  return violations;
}

async function migrateSite(sql, siteId, siteName, mapping) {
  console.log(`\n→ Migrating site: ${siteName} (${siteId})`);

  const [site] = await sql`SELECT pillar_config FROM sites WHERE id = ${siteId}`;
  const config = site?.pillar_config;
  if (!Array.isArray(config)) {
    console.log(`  ✗ pillar_config is not an array, skipping`);
    return;
  }

  // Validate mapping covers all custom IDs in the config
  const customIds = config.map((p) => p.id).filter((id) => !FRAMEWORK_IDS.includes(id));
  const uncovered = customIds.filter((id) => !(id in mapping));
  if (uncovered.length > 0) {
    console.log(`  ✗ Mapping is incomplete. Missing entries for: ${uncovered.join(", ")}`);
    console.log(`     Add these to SITE_MAPPINGS["${siteName}"] and re-run`);
    return;
  }

  // Rewrite pillar_config: id = framework slot, label preserved (or set if missing)
  const newConfig = config.map((p) => {
    const oldId = p.id;
    const newId = FRAMEWORK_IDS.includes(oldId) ? oldId : mapping[oldId];
    if (!newId) {
      throw new Error(`No mapping for id="${oldId}"`);
    }
    return {
      ...p,
      id: newId,
      framework: FRAMEWORK_LABELS[newId],
      // Preserve the label as-is. If label was missing, use the readable old id.
      label: p.label || oldId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    };
  });

  // Verify we still have 5 pillars and they're all framework IDs
  const newIds = newConfig.map((p) => p.id);
  const allFramework = newIds.every((id) => FRAMEWORK_IDS.includes(id));
  if (!allFramework) {
    console.log(`  ✗ Post-mapping config still has non-framework IDs: ${newIds.join(", ")}`);
    return;
  }

  await sql`
    UPDATE sites
    SET pillar_config = ${JSON.stringify(newConfig)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;
  console.log(`  ✓ pillar_config updated (${config.length} → ${newConfig.length} pillars)`);

  // Remap media_assets.content_pillar (singular) for this site
  let assetsUpdated = 0;
  for (const [oldId, newId] of Object.entries(mapping)) {
    const result = await sql`
      UPDATE media_assets
      SET content_pillar = ${newId}
      WHERE site_id = ${siteId} AND content_pillar = ${oldId}
      RETURNING id
    `;
    if (result.length > 0) {
      console.log(`     content_pillar: "${oldId}" → "${newId}" on ${result.length} assets`);
      assetsUpdated += result.length;
    }
  }

  // Remap media_assets.content_pillars (array) for this site
  let arrayAssetsUpdated = 0;
  const assetsWithPillarArrays = await sql`
    SELECT id, content_pillars
    FROM media_assets
    WHERE site_id = ${siteId}
      AND content_pillars IS NOT NULL
      AND array_length(content_pillars, 1) > 0
  `;
  for (const asset of assetsWithPillarArrays) {
    const oldArr = asset.content_pillars;
    const newArr = oldArr.map((id) => mapping[id] || (FRAMEWORK_IDS.includes(id) ? id : null)).filter(Boolean);
    if (JSON.stringify(oldArr) !== JSON.stringify(newArr)) {
      await sql`
        UPDATE media_assets
        SET content_pillars = ${newArr}::text[]
        WHERE id = ${asset.id}
      `;
      arrayAssetsUpdated++;
    }
  }
  if (arrayAssetsUpdated > 0) {
    console.log(`     content_pillars (array): updated on ${arrayAssetsUpdated} assets`);
  }

  console.log(`  ✓ ${assetsUpdated} content_pillar + ${arrayAssetsUpdated} content_pillars[] migrations complete`);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("=".repeat(70));
  console.log("Pillar framework normalization — migration 101");
  console.log("=".repeat(70));

  // Step 1: Audit all sites for non-framework IDs
  console.log("\nAuditing all sites for non-framework pillar IDs...");
  const violations = await audit(sql);
  if (violations.length === 0) {
    console.log("  ✓ No sites have non-framework IDs. Nothing to migrate.");
    return;
  }
  console.log(`\n  Found ${violations.length} site(s) with non-framework IDs:\n`);
  for (const v of violations) {
    console.log(`  - ${v.siteName} (${v.siteId})`);
    console.log(`    Non-framework IDs: ${v.badIds.join(", ")}`);
    console.log(`    Mapping defined: ${v.siteName in SITE_MAPPINGS ? "YES" : "NO (will be skipped)"}`);
  }

  // Step 2: Migrate each site that has a mapping
  console.log("\nMigrating sites with defined mappings...");
  for (const v of violations) {
    if (v.siteName in SITE_MAPPINGS) {
      await migrateSite(sql, v.siteId, v.siteName, SITE_MAPPINGS[v.siteName]);
    } else {
      console.log(`\n→ Skipping ${v.siteName} — no mapping defined`);
    }
  }

  // Step 3: Re-audit to confirm
  console.log("\nRe-auditing after migration...");
  const postViolations = await audit(sql);
  if (postViolations.length === 0) {
    console.log("  ✓ All sites now use framework IDs");
  } else {
    console.log(`  ! ${postViolations.length} site(s) still have non-framework IDs (no mapping):`);
    for (const v of postViolations) {
      console.log(`    - ${v.siteName}: ${v.badIds.join(", ")}`);
    }
  }

  console.log("\nMigration complete.");
}

main().catch((e) => {
  console.error("\nERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
