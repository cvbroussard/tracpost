/**
 * One-off: re-run the junction binder against B Squared's existing
 * services with the tightened combined-evidence threshold. Avoids
 * a full pipeline re-run (which would also regenerate service names
 * and break the work the operator just did).
 *
 * Reads the most recent CMA + runs clustering against it + coaches
 * categories + applies the binder with the new threshold. Only
 * UPDATEs services.primary_gcid + associated_gcids — name,
 * description, slug, hero all preserved per [[stable-service-identity]].
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-stub.cjs' \
 *      npx tsx ./scripts/_b2-rebind-associated.js
 */
import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { runInfrastructurePipeline } from "../src/lib/competitive-intel/pipeline-orchestrator";
import { bindServicesToCategories } from "../src/lib/services/junction-bind";
// @ts-expect-error no @types/ws
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  let businessId: string;
  let existing: Array<{
    id: string;
    name: string;
    cluster_id: string;
    cluster_intent_label: string;
    display_order: number;
    slug: string;
    description: string | null;
    priceRange: string | null;
    duration: string | null;
  }>;
  try {
    const [biz] = (
      await c.query(
        `SELECT id FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1`,
      )
    ).rows;
    if (!biz) throw new Error("B2 not found");
    businessId = biz.id as string;

    // Load existing services + their cluster metadata
    const rows = (
      await c.query(
        `SELECT id, name, slug, description, price_range, duration,
                display_order,
                metadata->>'cluster_id' AS cluster_id,
                metadata->>'cluster_intent_label' AS cluster_intent_label
         FROM services
         WHERE business_id = $1 AND source = 'auto'
         ORDER BY display_order`,
        [businessId],
      )
    ).rows;
    existing = rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      description: r.description ? String(r.description) : null,
      priceRange: r.price_range ? String(r.price_range) : null,
      duration: r.duration ? String(r.duration) : null,
      cluster_id: (r.cluster_id as string) ?? "",
      cluster_intent_label: (r.cluster_intent_label as string) ?? "",
      display_order: r.display_order as number,
    }));
  } finally {
    c.release();
    await pool.end();
  }

  console.log(`Running CMA → clustering → coaching for B2...`);
  const plan = await runInfrastructurePipeline(businessId);
  console.log(`  ✓ ${plan.clusters.length} clusters, ${plan.coachedCategories.length} coached cats\n`);

  // The fresh pipeline gives us NEW clusters with their own cluster_ids
  // (cluster_1..cluster_N). Existing services have OLD cluster_ids stored
  // in metadata. Match by cluster_intent_label so the binder operates on
  // existing service rows against fresh cluster data.
  const clusterByLabel = new Map(
    plan.clusters.map((c) => [c.intent_label.toLowerCase().trim(), c]),
  );
  const matched: typeof existing = [];
  const unmatched: typeof existing = [];
  for (const svc of existing) {
    if (clusterByLabel.has(svc.cluster_intent_label.toLowerCase().trim())) {
      matched.push(svc);
    } else {
      unmatched.push(svc);
    }
  }
  console.log(`Matched ${matched.length} services to fresh clusters; ${unmatched.length} unmatched\n`);

  // Reshape matched services into PersistedService shape the binder expects.
  const persistedShape = matched.map((svc) => {
    const cluster = clusterByLabel.get(svc.cluster_intent_label.toLowerCase().trim())!;
    return {
      id: svc.id,
      name: svc.name,
      slug: svc.slug,
      description: svc.description ?? "",
      priceRange: svc.priceRange ?? undefined,
      duration: svc.duration ?? undefined,
      cluster_id: cluster.cluster_id,
      cluster_intent_label: cluster.intent_label,
      display_order: svc.display_order,
    };
  });

  console.log(`\nCategory families computed:`);
  for (const f of plan.categoryFamilies) {
    console.log(`  ${f.family_label}: [${f.gcids.map((g) => plan.coachedCategories.find((c) => c.gcid === g)?.name ?? g).join(", ")}]`);
  }
  console.log();

  const result = await bindServicesToCategories({
    siteId: businessId,
    persistedServices: persistedShape,
    coachedCategories: plan.coachedCategories,
    clusters: plan.clusters,
    categoryFamilies: plan.categoryFamilies,
  });
  console.log(`Re-bound ${result.bound.length} services; ${result.unbound.length} unbound\n`);
  for (const b of result.bound) {
    console.log(`  ${b.service_name}`);
    console.log(`    ⚓ ${b.category_name}`);
    for (const g of b.associated_gcids.slice(1)) {
      const cat = plan.coachedCategories.find((c) => c.gcid === g);
      console.log(`    + ${cat?.name ?? g}`);
    }
  }
  if (unmatched.length > 0) {
    console.log(`\nUNMATCHED services (their cluster labels didn't appear in the fresh pipeline):`);
    for (const s of unmatched) console.log(`  - ${s.name} (was: "${s.cluster_intent_label}")`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
