/**
 * One-off: recompute Brand Extraction status for a business and dump the
 * resulting task graph.
 *
 * Run: npx tsx -r dotenv/config --conditions=react-server scripts/run-brand-extraction-recompute.ts <business-id> dotenv_config_path=.env.local
 */
import "dotenv/config";
import { sql } from "@/lib/db";
import { recomputeBrandExtractionStatus } from "@/lib/provisioning/brand-extraction-status";

(async () => {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: npx tsx scripts/run-brand-extraction-recompute.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name, billing_account_id FROM businesses WHERE id = ${businessId} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${businessId}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);

  const t0 = Date.now();
  const result = await recomputeBrandExtractionStatus(biz.id as string);
  console.log(`Recompute applied in ${Date.now() - t0}ms`);
  console.log(`  task changes:     ${result.taskChanges}`);
  console.log(`  sub_task changes: ${result.subTaskChanges}\n`);

  const tasks = await sql`
    SELECT pt.sort_order, pt.task_key, pt.owner, pt.status,
           (SELECT COUNT(*) FROM provisioning_sub_tasks WHERE task_id = pt.id) AS sub_total,
           (SELECT COUNT(*) FROM provisioning_sub_tasks WHERE task_id = pt.id AND status = 'complete') AS sub_done
    FROM provisioning_tasks pt
    WHERE pt.billing_account_id = ${biz.billing_account_id as string}
    ORDER BY pt.sort_order
  `;
  console.log("=== current task graph ===");
  for (const r of tasks) {
    const subs = (r.sub_total as number) > 0 ? ` (${r.sub_done}/${r.sub_total})` : "";
    const stat = String(r.status).padEnd(12);
    console.log(`  ${String(r.sort_order).padStart(2)}. ${(r.task_key as string).padEnd(28)} ${(r.owner as string).padEnd(8)} ${stat}${subs}`);
  }

  // Dump Brand Extraction sub_task detail
  const subs = await sql`
    SELECT pt.task_key AS parent, pst.sub_key, pst.status
    FROM provisioning_sub_tasks pst
    JOIN provisioning_tasks pt ON pt.id = pst.task_id
    WHERE pt.billing_account_id = ${biz.billing_account_id as string}
      AND pt.task_key IN ('brand_strategic','brand_verbal','brand_visual','brand_sonic')
    ORDER BY pt.sort_order, pst.sort_order
  `;
  console.log("\n=== Brand Extraction sub_tasks ===");
  let lastParent = "";
  for (const r of subs) {
    if (r.parent !== lastParent) {
      console.log(`  [${r.parent}]`);
      lastParent = r.parent as string;
    }
    const marker = r.status === "complete" ? "✓" : "·";
    console.log(`    ${marker} ${(r.sub_key as string).padEnd(28)} ${r.status}`);
  }
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
