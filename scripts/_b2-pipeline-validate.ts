/**
 * Validate the cluster-driven Infrastructure pipeline against B Squared.
 *
 * Runs the orchestrator (plan-only, no DB mutation), prints:
 *   - Clusters produced (with intent labels + member queries + top observed categories)
 *   - Coached categories with cluster_id tags
 *   - Derived services with source cluster_id
 *   - Diagnostic: which services would M:N-bind to which categories
 *
 * Usage: npx tsx scripts/_b2-pipeline-validate.ts
 */
// Note: "server-only" must be stubbed via the loader hook. Run with:
//   node --import ./scripts/_server-only-stub.mjs --import tsx ./scripts/_b2-pipeline-validate.ts
import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { runInfrastructurePipeline } from "../src/lib/competitive-intel/pipeline-orchestrator";
// @ts-expect-error — no @types/ws installed; runtime import works
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  let businessId: string;
  try {
    const [biz] = (
      await c.query(`SELECT id FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1`)
    ).rows;
    if (!biz) throw new Error("B2 not found");
    businessId = biz.id as string;
  } finally {
    c.release();
    await pool.end();
  }

  console.log(`Running infrastructure pipeline for B2 (${businessId})...\n`);
  const t0 = Date.now();
  const result = await runInfrastructurePipeline(businessId);
  const elapsed = Math.round((Date.now() - t0) / 1000);

  console.log(`✓ Pipeline completed in ${elapsed}s\n`);
  console.log(`Source CMA: ${result.analysisId}`);
  console.log(`Generated: ${result.generatedAt}\n`);

  console.log("═".repeat(80));
  console.log(`INTENT CLUSTERS (${result.clusters.length}):`);
  console.log("═".repeat(80));
  for (const cluster of result.clusters) {
    console.log(`\n[${cluster.cluster_id}] ${cluster.intent_label}`);
    console.log(`  member queries (${cluster.member_queries.length}):`);
    for (const q of cluster.member_queries.slice(0, 4)) {
      console.log(`    - ${q}`);
    }
    if (cluster.member_queries.length > 4) {
      console.log(`    ... +${cluster.member_queries.length - 4} more`);
    }
    console.log(`  top observed categories:`);
    for (const f of cluster.observed_category_frequencies.slice(0, 5)) {
      console.log(`    - ${f.name} (${f.count} competitors)`);
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(`COACHED CATEGORIES (${result.coachedCategories.length}):`);
  console.log("═".repeat(80));
  for (const cat of result.coachedCategories) {
    const primary = cat.proposedPrimary ? " ★ PRIMARY" : "";
    const tags =
      cat.cluster_ids && cat.cluster_ids.length > 0
        ? ` [${cat.cluster_ids.join(", ")}]`
        : " [no cluster tags]";
    console.log(`  ${cat.action.toUpperCase().padEnd(10)} ${cat.name}${primary}${tags}`);
  }

  console.log("\n" + "═".repeat(80));
  console.log(`DERIVED SERVICES (${result.derivedServices.length}):`);
  console.log("═".repeat(80));
  for (const s of result.derivedServices) {
    console.log(`\n[${s.cluster_id}] ${s.name}`);
    console.log(`  source intent: ${s.cluster_intent_label}`);
    console.log(`  description: ${s.description}`);
    if (s.priceRange) console.log(`  price: ${s.priceRange}`);
    if (s.duration) console.log(`  duration: ${s.duration}`);
  }

  console.log("\n" + "═".repeat(80));
  console.log(`PROJECTED N:1 CATEGORY ANCHORS (semantic-alignment preview):`);
  console.log("═".repeat(80));
  const coachedGcids = new Set(result.coachedCategories.map((c) => c.gcid));
  const coachedNames = new Map(result.coachedCategories.map((c) => [c.gcid, c.name]));
  const stop = new Set(["and", "the", "for", "with", "from", "into", "your", "you", "are", "our", "all"]);
  function stem(t: string): string {
    if (t.length <= 4) return t;
    for (const suf of ["ing", "er", "or", "ers", "ors", "ion"]) {
      if (t.endsWith(suf) && t.length - suf.length >= 3) return t.slice(0, t.length - suf.length);
    }
    return t;
  }
  function toks(s: string): Set<string> {
    return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !stop.has(t)).map(stem));
  }
  function semanticMatch(catName: string, intent: string): number {
    const ct = toks(catName); const it = toks(intent);
    let n = 0; for (const t of ct) if (it.has(t)) n++;
    return n;
  }
  let boundCount = 0;
  for (const svc of result.derivedServices) {
    const cluster = result.clusters.find((c) => c.cluster_id === svc.cluster_id);
    if (!cluster) {
      console.log(`\n"${svc.name}" → UNBOUND (cluster vanished)`);
      continue;
    }
    const candidates = cluster.observed_category_frequencies
      .filter((f) => coachedGcids.has(f.gcid))
      .map((f) => ({ ...f, semantic: semanticMatch(f.name, cluster.intent_label) }))
      .sort((a, b) => b.semantic !== a.semantic ? b.semantic - a.semantic : b.count - a.count);
    const winner = candidates[0];
    if (winner) {
      boundCount++;
      console.log(`\n"${svc.name}" → ${coachedNames.get(winner.gcid)}`);
      console.log(`  (cluster: ${cluster.intent_label}; semantic=${winner.semantic} freq=${winner.count})`);
    } else {
      console.log(`\n"${svc.name}" → UNBOUND (cluster ${svc.cluster_id} has no coached category match)`);
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(`SUMMARY`);
  console.log("═".repeat(80));
  console.log(`Clusters: ${result.clusters.length}`);
  console.log(`Categories (10-best): ${result.coachedCategories.length}`);
  console.log(`Services derived: ${result.derivedServices.length}`);
  console.log(`Bound services (N:1): ${boundCount}/${result.derivedServices.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
