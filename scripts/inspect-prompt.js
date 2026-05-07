/**
 * Prompt-level debug + inspection.
 *
 * Runs the full blog-prompt assembly pipeline (assessment → strategy
 * pick → spec build → asset enrichment → research → vendor + project
 * links → all the prompt building logic) but STOPS before the LLM call.
 *
 * Outputs the assembled prompt + per-block stats + the structured
 * inputs that fed it. Lets you iterate prompt engineering for $0 per
 * iteration before paying for LLM generations.
 *
 * Usage:
 *   npx tsx scripts/inspect-prompt.js --site epicurious
 *     → summary view: model + token budget + block list
 *
 *   npx tsx scripts/inspect-prompt.js --site epicurious --show-prompt
 *     → full assembled prompt dump
 *
 *   npx tsx scripts/inspect-prompt.js --site epicurious --show-block "Available assets"
 *     → drill into one named block
 *
 *   npx tsx scripts/inspect-prompt.js --site epicurious --type project_story --seed-asset abc
 *     → force a specific content type and seed asset
 *
 *   npx tsx scripts/inspect-prompt.js --site epicurious --json
 *     → machine-readable: full assembled-prompt object as JSON
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    siteName: null,
    seedAssetId: null,
    type: null,
    intent: null,
    showPrompt: false,
    showBlock: null,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--site") out.siteName = args[++i];
    else if (args[i] === "--seed-asset") out.seedAssetId = args[++i];
    else if (args[i] === "--type") out.type = args[++i];
    else if (args[i] === "--intent") out.intent = args[++i];
    else if (args[i] === "--show-prompt") out.showPrompt = true;
    else if (args[i] === "--show-block") out.showBlock = args[++i];
    else if (args[i] === "--json") out.json = true;
  }
  if (!out.siteName) {
    console.error("Usage: --site <name> [--seed-asset <id>] [--type <kind>] [--intent <text>] [--show-prompt | --show-block <name> | --json]");
    process.exit(1);
  }
  return out;
}

async function pickFreshHero(sql, siteId) {
  const usedRows = await sql`
    SELECT DISTINCT id FROM (
      SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId} AND seed_asset_id IS NOT NULL
      UNION
      SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId}
    ) u
  `;
  const usedIds = usedRows.map((r) => r.id);
  const [r] = await sql`
    SELECT id FROM media_assets
    WHERE site_id = ${siteId}
      AND (media_type ILIKE 'image%' OR media_type = 'video')
      AND triage_status NOT IN ('quarantined','shelved')
      AND status NOT IN ('deleted','failed')
      AND context_note IS NOT NULL
      AND id <> ALL(${usedIds}::uuid[])
    ORDER BY
      CASE WHEN media_type = 'video' THEN 0 ELSE 1 END,
      quality_score DESC NULLS LAST,
      created_at DESC
    LIMIT 1
  `;
  return r ? r.id : null;
}

async function main() {
  const args = parseArgs();
  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`
    SELECT id, name FROM sites WHERE LOWER(name) LIKE ${`%${args.siteName.toLowerCase()}%`} LIMIT 1
  `;
  if (!site) { console.error(`No site matching '${args.siteName}'`); process.exit(1); }

  const heroId = args.seedAssetId || await pickFreshHero(sql, site.id);
  if (!heroId) { console.error("No eligible asset found"); process.exit(1); }

  // Resolve body candidates matching pillar
  const [hero] = await sql`SELECT content_pillar FROM media_assets WHERE id = ${heroId}`;
  const pillar = hero.content_pillar;
  const bodyRows = pillar
    ? await sql`
        SELECT id FROM media_assets
        WHERE site_id = ${site.id}
          AND id <> ${heroId}
          AND triage_status NOT IN ('quarantined','shelved')
          AND status NOT IN ('deleted','failed')
          AND (media_type ILIKE 'image%' OR media_type = 'video')
          AND (content_pillar = ${pillar} OR ${pillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 8
      `
    : await sql`
        SELECT id FROM media_assets
        WHERE site_id = ${site.id}
          AND id <> ${heroId}
          AND triage_status NOT IN ('quarantined','shelved')
          AND status NOT IN ('deleted','failed')
          AND (media_type ILIKE 'image%' OR media_type = 'video')
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 8
      `;
  const bodyAssetIds = bodyRows.map((r) => r.id);

  const { assembleBlogPrompt } = await import("../src/lib/v2-generator/blog/assemble.ts");

  const assembled = await assembleBlogPrompt({
    siteId: site.id,
    heroAssetId: heroId,
    bodyAssetIds,
    seedAssetId: heroId,
    intent: args.intent,
    contentTypeOverride: args.type,
    status: "draft",
  });

  // ── Output modes ────────────────────────────────────────────────

  if (args.json) {
    console.log(JSON.stringify(assembled, null, 2));
    return;
  }

  if (args.showPrompt) {
    console.log(assembled.prompt);
    return;
  }

  if (args.showBlock) {
    const target = args.showBlock.toLowerCase();
    const block = assembled.promptStats.blocks.find((b) =>
      b.name.toLowerCase().includes(target),
    );
    if (!block) {
      console.error(`No block matching "${args.showBlock}". Available:`);
      for (const b of assembled.promptStats.blocks) console.error(`  - ${b.name}`);
      process.exit(1);
    }
    // Extract that block from the prompt
    const lines = assembled.prompt.split("\n");
    let inBlock = false;
    let captured = [];
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (inBlock) break;
        if (line.slice(3).trim() === block.name) {
          inBlock = true;
          captured.push(line);
          continue;
        }
      }
      if (inBlock) captured.push(line);
    }
    console.log(captured.join("\n"));
    return;
  }

  // Default: summary view
  console.log("");
  console.log(`Site:           ${site.name} (${site.id})`);
  console.log(`Content type:   ${assembled.contentType}`);
  console.log(`Model:          ${assembled.effectiveModel}`);
  console.log(`max_tokens:     ${assembled.effectiveMaxTokens}`);
  console.log(`Word target:    ${assembled.modelConfig.wordRange}`);
  console.log("");
  console.log("─── Inputs ────────────────────────────────────────");
  console.log(`Hero:           ${heroId}`);
  console.log(`  context:      ${assembled.inputs.assets[0]?.contextNote?.slice(0, 80) || "(none)"}`);
  console.log(`Body assets:    ${assembled.inputs.assets.length - 1}`);
  console.log(`Brand angle:    ${assembled.inputs.brandAngle || "(none)"}`);
  console.log(`Voice tone:     ${assembled.inputs.voiceTone || "(none)"}`);
  console.log(`Hook:           ${assembled.inputs.hookText ? `"${assembled.inputs.hookText.slice(0, 60)}…"` : "(none)"}`);
  console.log(`Research:       ${assembled.inputs.researchChars} chars`);
  console.log(`Vendor links:   ${assembled.inputs.vendorLinks.length}`);
  for (const v of assembled.inputs.vendorLinks.slice(0, 3)) console.log(`  ${v}`);
  console.log(`Project links:  ${assembled.inputs.projectLinks.length}`);
  for (const p of assembled.inputs.projectLinks.slice(0, 3)) console.log(`  ${p}`);
  console.log(`Existing titles: ${assembled.inputs.existingTitleCount}`);
  console.log("");
  console.log("─── Prompt blocks ─────────────────────────────────");
  for (const b of assembled.promptStats.blocks) {
    console.log(`  ${String(b.chars).padStart(5)}c ${String(b.lines).padStart(3)}L  ${b.name}`);
  }
  console.log("");
  console.log(`Total prompt: ${assembled.promptStats.chars} chars / ~${assembled.promptStats.estimatedTokens} tokens / ${assembled.promptStats.lines} lines`);
  console.log("");
  console.log("Run with --show-prompt to dump full prompt, --show-block <name> to drill into one block.");
}

main().catch((e) => {
  console.error("");
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
