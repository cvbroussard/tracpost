#!/usr/bin/env node
/**
 * Operator script: backfill Tier 2 competitor categories on an existing
 * CMA payload. Skips the SERP query phase entirely — just fires the
 * SerpAPI google_maps `place` engine for each top competitor's CID and
 * patches `analysis_data.competitorCategories` + seeds new gcids into
 * the local catalog.
 *
 * Usage:
 *   node scripts/enrich-cma-tier2.js <site_id>
 *
 * Cost: ~$0.0075 × topCompetitors.length (~$0.075 for the default top 10).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const SITE_ID = process.argv[2];
if (!SITE_ID) {
  console.error("Usage: node scripts/enrich-cma-tier2.js <site_id>");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const apiKey = process.env.SERPAPI_KEY;
if (!apiKey) {
  console.error("SERPAPI_KEY not set");
  process.exit(1);
}

async function fetchCompetitorCategories(cid, primaryTypeDisplay) {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "place");
  url.searchParams.set("data_cid", cid);
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`  ! SerpAPI fail for CID ${cid} (${res.status})`);
    return null;
  }
  const data = await res.json();
  const place = data.place_results || {};
  const types = Array.isArray(place.type) ? place.type : [];
  const typeIds = Array.isArray(place.type_ids) ? place.type_ids : [];
  if (types.length === 0 || typeIds.length !== types.length) {
    console.warn(`  ! No usable type data for CID ${cid}`);
    return null;
  }
  const gcids = typeIds.map((id) => `gcid:${id}`);
  let primaryGcid = null;
  if (primaryTypeDisplay) {
    const idx = types.findIndex((t) => t.toLowerCase() === primaryTypeDisplay.toLowerCase());
    if (idx >= 0) primaryGcid = gcids[idx];
  }
  return {
    cid,
    title: place.title || "",
    gcids,
    displayNames: types,
    primaryGcid,
  };
}

async function run() {
  const [row] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE site_id = ${SITE_ID} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!row) {
    console.error("No completed analysis found for this site");
    process.exit(1);
  }
  const payload = row.analysis_data;
  const topCompetitors = payload.topCompetitors || [];
  console.log(`Tier 2 enriching analysis ${row.id}`);
  console.log(`  ${topCompetitors.length} top competitors to fetch`);

  const results = await Promise.all(
    topCompetitors.map((c) => fetchCompetitorCategories(c.placeId, c.type || null)),
  );
  const competitorCategories = results.filter((c) => c !== null);
  console.log(`  ✓ ${competitorCategories.length}/${topCompetitors.length} succeeded`);

  // Seed any new gcids
  let seeded = 0;
  for (const cc of competitorCategories) {
    for (let i = 0; i < cc.gcids.length; i++) {
      const r = await sql`
        INSERT INTO gbp_categories (gcid, name)
        VALUES (${cc.gcids[i]}, ${cc.displayNames[i]})
        ON CONFLICT (gcid) DO NOTHING
        RETURNING gcid
      `;
      if (r.length > 0) seeded++;
    }
  }
  console.log(`  ✓ Seeded ${seeded} new gcids into local catalog`);

  payload.competitorCategories = competitorCategories;
  payload.competitorCategoriesFetched = competitorCategories.length;
  await sql`
    UPDATE competitive_market_analyses
    SET analysis_data = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
    WHERE id = ${row.id}
  `;
  console.log(`\n✓ Patched analysis ${row.id}`);

  console.log(`\n=== Competitor category snapshot ===`);
  for (const cc of competitorCategories) {
    const pStr = cc.primaryGcid ? ` [primary: ${cc.primaryGcid}]` : "";
    console.log(`\n${cc.title}${pStr}`);
    for (let i = 0; i < cc.gcids.length; i++) {
      const mark = cc.gcids[i] === cc.primaryGcid ? "★" : " ";
      console.log(`  ${mark} ${cc.gcids[i]}  →  ${cc.displayNames[i]}`);
    }
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
