#!/usr/bin/env node
/**
 * Operator script: run a competitive market analysis for a site.
 *
 * Mirrors src/lib/competitive-intel/analysis-assembly.ts orchestration
 * in plain JS so it can run locally without TS build/tsx setup.
 *
 * Usage:
 *   node scripts/run-competitive-analysis.js <site_id>
 *
 * Cost: ~$0.0075/SerpAPI query × 15-20 queries ≈ $0.15 per run.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const SITE_ID = process.argv[2];
if (!SITE_ID) {
  console.error("Usage: node scripts/run-competitive-analysis.js <site_id>");
  process.exit(1);
}

const SERP_KEY = process.env.SERPAPI_KEY;
if (!SERP_KEY) {
  console.error("SERPAPI_KEY not set in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// ============ Helpers (mirror analysis-assembly.ts) ============

const SPECIFICITY_RANK = { neighborhood: 1, city: 2, metro: 3, zip: 4, county: 5, state: 6, region: 7 };
const STATE_FULL = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};
const QUERY_WEIGHTS = { primary: 1.0, additional: 0.6, geo_expansion: 0.4 };

function shortPlaceName(fullName) {
  return fullName.replace(/,?\s*USA\s*$/i, "").trim();
}

function serpLocationFromPlaceName(placeName) {
  const parts = placeName.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts[parts.length - 1] === "USA") parts.pop();
  if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
    const abbrev = parts[parts.length - 1].toUpperCase();
    if (STATE_FULL[abbrev]) parts[parts.length - 1] = STATE_FULL[abbrev];
  }
  if (parts.length >= 3) parts.shift();
  parts.push("United States");
  return parts.join(", ");
}

async function deriveQueries() {
  const categories = await sql`
    SELECT gc.gcid, gc.name, sgc.is_primary
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${SITE_ID}
    ORDER BY sgc.is_primary DESC, gc.name
  `;
  const [site] = await sql`
    SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
    FROM sites WHERE id = ${SITE_ID}
  `;
  const places = site?.place_infos || [];
  if (categories.length === 0 || places.length === 0) {
    return { queries: [], primaryPlaceName: "", categories, places };
  }
  const placeIds = places.map((p) => p.placeId).filter(Boolean);
  const kindRows = await sql`SELECT place_id, kind FROM service_areas_canonical WHERE place_id = ANY(${placeIds}::text[])`;
  const kindMap = new Map(kindRows.map((r) => [r.place_id, r.kind]));
  const ranked = places
    .map((p) => ({ ...p, kind: kindMap.get(p.placeId) || "city", rank: SPECIFICITY_RANK[kindMap.get(p.placeId) || "city"] ?? 99 }))
    .sort((a, b) => a.rank - b.rank);

  const primaryPlace = ranked[0];
  const additionalPlaces = ranked.slice(1);
  const primaryCategory = categories.find((c) => c.is_primary);
  const additionalCategories = categories.filter((c) => !c.is_primary);

  const queries = [];
  if (primaryCategory) {
    queries.push({ query: `${primaryCategory.name} ${shortPlaceName(primaryPlace.placeName)}`, weight: "primary", gcid: primaryCategory.gcid, placeName: primaryPlace.placeName });
    for (const p of additionalPlaces) {
      queries.push({ query: `${primaryCategory.name} ${shortPlaceName(p.placeName)}`, weight: "geo_expansion", gcid: primaryCategory.gcid, placeName: p.placeName });
    }
  }
  for (const c of additionalCategories) {
    queries.push({ query: `${c.name} ${shortPlaceName(primaryPlace.placeName)}`, weight: "additional", gcid: c.gcid, placeName: primaryPlace.placeName });
  }
  return { queries: queries.slice(0, 20), primaryPlaceName: primaryPlace.placeName, categories, places };
}

async function fetchSerp(query, location) {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("location", location);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", SERP_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const places = data.local_results?.places || [];
  const localPack = places.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title || "",
    placeId: String(r.place_id || ""),
    knowledgeGraphId: r.provider_id,
    rating: r.rating,
    reviewsCount: r.reviews,
    type: r.type,
    address: r.address,
    phone: r.phone,
    website: r.links?.website,
    yearsInBusiness: r.years_in_business,
    description: r.description,
    coordinates: r.gps_coordinates,
  })).filter((r) => r.placeId);
  return { query, searchLocation: location, fetchedAt: new Date().toISOString(), localPack };
}

function extractCompetitors(serps, queries) {
  const queryWeightMap = new Map(queries.map((q) => [q.query, q.weight]));
  const byPlaceId = new Map();
  for (const serp of serps) {
    const weight = queryWeightMap.get(serp.query) || "additional";
    for (const r of serp.localPack) {
      const existing = byPlaceId.get(r.placeId);
      if (existing) {
        existing.appearedInQueries.push({ query: serp.query, position: r.position, weight });
        if (r.reviewsCount && (!existing.reviewsCount || r.reviewsCount > existing.reviewsCount)) existing.reviewsCount = r.reviewsCount;
        if (r.rating && (!existing.rating || r.rating > existing.rating)) existing.rating = r.rating;
        if (r.website && !existing.website) existing.website = r.website;
      } else {
        byPlaceId.set(r.placeId, { ...r, appearedInQueries: [{ query: serp.query, position: r.position, weight }] });
      }
    }
  }
  for (const c of byPlaceId.values()) {
    c.appearanceCount = c.appearedInQueries.length;
    c.averagePosition = c.appearedInQueries.reduce((s, q) => s + q.position, 0) / c.appearanceCount;
    const weightedAppearances = c.appearedInQueries.reduce((s, q) => s + (QUERY_WEIGHTS[q.weight] ?? 0.5), 0);
    const positionFactor = Math.max(0, 4 - c.averagePosition);
    c.score = (weightedAppearances * positionFactor) / Math.max(1, serps.length);
  }
  return Array.from(byPlaceId.values()).sort((a, b) => b.score - a.score);
}

// ============ Main pipeline ============

async function run() {
  const startedAt = Date.now();
  console.log(`Running competitive analysis for site ${SITE_ID}...`);

  // 1) Create row at 'running'
  const [row] = await sql`
    INSERT INTO competitive_market_analyses (site_id, status)
    VALUES (${SITE_ID}, 'running')
    RETURNING id
  `;
  const analysisId = row.id;
  console.log(`  Analysis id: ${analysisId}`);

  try {
    // 2) Derive queries
    const { queries, primaryPlaceName, categories, places } = await deriveQueries();
    if (queries.length === 0) {
      throw new Error("No queries derived — site needs both GBP categories AND service areas");
    }
    console.log(`  ${queries.length} queries derived | primary place: ${primaryPlaceName}`);

    // 3) Fetch SERPs
    const location = serpLocationFromPlaceName(primaryPlaceName);
    console.log(`  SerpAPI location: ${location}`);
    const serps = [];
    let serpQueriesRun = 0;
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      process.stdout.write(`    [${i + 1}/${queries.length}] "${q.query}" ... `);
      try {
        const serp = await fetchSerp(q.query, location);
        serps.push(serp);
        serpQueriesRun++;
        console.log(`${serp.localPack.length} results`);
      } catch (err) {
        console.log(`SKIP (${err.message.slice(0, 80)})`);
      }
    }

    // 4) Extract competitors
    const allCompetitors = extractCompetitors(serps, queries);
    const topCompetitors = allCompetitors.slice(0, 10);
    console.log(`  ${allCompetitors.length} unique competitors observed | top 10 captured`);

    // 5) Build payload + persist
    const payload = {
      generatedAt: new Date().toISOString(),
      subscriberCategories: categories.map((c) => ({ gcid: c.gcid, name: c.name, isPrimary: !!c.is_primary })),
      subscriberServiceAreas: places,
      targetQueries: queries,
      topCompetitors,
      totalCompetitorsObserved: allCompetitors.length,
      serpQueriesRun,
      competitorProfilesFetched: 0,
    };

    await sql`
      UPDATE competitive_market_analyses
      SET status = 'complete', analysis_data = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
      WHERE id = ${analysisId}
    `;

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n✓ Analysis complete in ${elapsedSec}s`);
    console.log(`  Cost: ~$${(serpQueriesRun * 0.0075).toFixed(3)} (${serpQueriesRun} SerpAPI credits)`);
    console.log(`\n=== TOP 10 RANKING COMPETITORS ===`);
    topCompetitors.forEach((c, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${c.title}`);
      console.log(`      type: ${c.type || "?"} | ⭐ ${c.rating || "-"} (${c.reviewsCount || 0} reviews) | appearances: ${c.appearanceCount} | avg pos: ${c.averagePosition.toFixed(1)} | score: ${c.score.toFixed(2)}`);
      if (c.website) console.log(`      ${c.website}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE competitive_market_analyses
      SET status = 'failed', error_message = ${msg}, updated_at = NOW()
      WHERE id = ${analysisId}
    `;
    console.error(`\n✗ Analysis failed: ${msg}`);
    process.exit(1);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
