/**
 * One-off: trigger the readiness-findings consolidator for a brand + dump the
 * resulting findings grouped by severity and attribution. Mirrors the
 * aesthetic-observation runner script.
 *
 * Run: npx tsx --conditions=react-server scripts/run-readiness-findings.ts <business-id-or-domain>
 */
import { sql } from "@/lib/db";
import {
  consolidateReadinessFindings,
  getReadinessFindings,
} from "@/lib/brand-identity/readiness-findings-consolidator";

async function resolveBusinessId(arg: string): Promise<{ id: string; name: string | null }> {
  if (/^[0-9a-f-]{32,36}$/i.test(arg)) {
    const [row] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
    if (row) return { id: row.id as string, name: row.name as string | null };
  }
  const rows = await sql`
    SELECT id, name FROM businesses
    WHERE url ILIKE ${"%" + arg + "%"} OR name ILIKE ${"%" + arg + "%"}
    LIMIT 5
  `;
  if (!rows.length) throw new Error(`no business matched '${arg}'`);
  if (rows.length > 1) {
    console.error(`ambiguous match for '${arg}':`);
    for (const r of rows) console.error(`  ${r.id}  ${r.name ?? "(no name)"}`);
    throw new Error("ambiguous; pass a UUID");
  }
  return { id: rows[0].id as string, name: rows[0].name as string | null };
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-readiness-findings.ts <business-id-or-domain>");
    process.exit(1);
  }

  const biz = await resolveBusinessId(arg);
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);

  console.log("Running consolidator…");
  const t0 = Date.now();
  const result = await consolidateReadinessFindings({ businessId: biz.id });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);

  if (!result.persisted) return;

  const findings = await getReadinessFindings(biz.id);
  if (!findings) {
    console.log("No findings persisted.");
    return;
  }

  console.log(`\n=== COUNTS ===`);
  console.log(JSON.stringify(findings.meta.counts, null, 2));

  console.log(`\n=== FINDINGS BY SEVERITY × ATTRIBUTION ===\n`);
  for (const sev of ["blocking", "refinement", "informational"] as const) {
    const items = findings.findings.filter((f) => f.severity === sev);
    if (items.length === 0) continue;
    console.log(`-- ${sev.toUpperCase()} (${items.length}) --`);
    for (const f of items) {
      console.log(`  [${f.attribution}${f.descriptor_key ? " · " + f.descriptor_key : ""}]`);
      console.log(`    ${f.prompt_text}`);
      console.log("");
    }
  }
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
