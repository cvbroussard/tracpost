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
  console.log(`PROJECTED M:N JUNCTION BINDINGS (deterministic preview):`);
  console.log("═".repeat(80));
  for (const svc of result.derivedServices) {
    const matchingCats = result.coachedCategories.filter(
      (cat) => cat.cluster_ids?.includes(svc.cluster_id),
    );
    console.log(`\n"${svc.name}" → ${matchingCats.length} categor${matchingCats.length === 1 ? "y" : "ies"}:`);
    if (matchingCats.length === 0) {
      console.log(`  (no coached category shares cluster ${svc.cluster_id} — service would be UNBOUND)`);
    } else {
      for (const cat of matchingCats) {
        console.log(`  - ${cat.name}`);
      }
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(`SUMMARY`);
  console.log("═".repeat(80));
  console.log(`Clusters: ${result.clusters.length}`);
  console.log(`Categories (10-best): ${result.coachedCategories.length}`);
  console.log(`Services derived: ${result.derivedServices.length}`);
  const unbound = result.derivedServices.filter(
    (s) => !result.coachedCategories.some((c) => c.cluster_ids?.includes(s.cluster_id)),
  );
  if (unbound.length > 0) {
    console.log(`⚠ Unbound services: ${unbound.length} (no matching coached category)`);
  } else {
    console.log(`✓ All services bind to at least one coached category`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
