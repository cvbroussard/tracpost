/**
 * Ad-hoc: pull B2 Construction's current readiness_findings substrate +
 * resolutions for triage. NOT a migration — intentionally underscore-prefixed
 * so it won't show in migration glob.
 *
 * Run: node scripts/_pull-b2-findings.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id, name, url FROM businesses
      WHERE url ILIKE '%b2construct%' OR name ILIKE '%b2 construction%' OR name ILIKE '%b squared%'
      ORDER BY created_at DESC LIMIT 1
    `)).rows;
    if (!biz) {
      console.log("No B2 business found.");
      return;
    }
    console.log("=== Business ===");
    console.log(`id: ${biz.id}`);
    console.log(`name: ${biz.name}`);
    console.log(`url: ${biz.url}`);

    const subs = (await c.query(`
      SELECT id, kind, payload, updated_at FROM business_substrate
      WHERE business_id = $1 AND kind = 'readiness_findings'
      ORDER BY updated_at DESC LIMIT 1
    `, [biz.id])).rows;
    if (!subs.length) {
      console.log("\nNo readiness_findings substrate row.");
      return;
    }
    const row = subs[0];
    console.log(`\n=== Readiness Findings substrate ===`);
    console.log(`substrate_id: ${row.id}`);
    console.log(`updated_at: ${row.updated_at.toISOString()}`);

    const findings = row.payload?.findings ?? row.payload ?? [];
    console.log(`finding_count: ${Array.isArray(findings) ? findings.length : "non-array"}`);

    // Resolutions (separate table)
    let resolutionsByFinding = {};
    try {
      const res = (await c.query(`
        SELECT finding_id, status, response, resolved_at
        FROM readiness_finding_resolutions
        WHERE business_id = $1
      `, [biz.id])).rows;
      for (const r of res) resolutionsByFinding[r.finding_id] = r;
      console.log(`resolved_count: ${res.length}`);
    } catch (e) {
      console.log(`(no readiness_finding_resolutions table or different schema: ${e.message})`);
    }

    if (Array.isArray(findings)) {
      console.log(`\n=== Findings ===`);
      for (const f of findings) {
        const r = resolutionsByFinding[f.finding_id || f.id];
        console.log(JSON.stringify({
          id: f.finding_id || f.id,
          severity: f.severity,
          attribution: f.attribution,
          source_pipeline: f.source_pipeline,
          surface: f.surface,
          field: f.field,
          title: f.title,
          observed: f.observed,
          declared: f.declared,
          prompt_text: f.prompt_text,
          resolved: r ? { status: r.status, response: r.response, at: r.resolved_at } : null,
        }, null, 2));
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
})();
