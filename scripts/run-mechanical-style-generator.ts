/**
 * One-off: trigger mechanical_style_examples generation for a business + dump.
 * Mirrors the aesthetic-observation runner pattern.
 *
 * Run: npx tsx --conditions=react-server scripts/run-mechanical-style-generator.ts <business-id>
 */
import { sql } from "@/lib/db";
import {
  generateMechanicalStyleExamples,
  readMechanicalStyleExamples,
} from "@/lib/brand-identity/mechanical-style-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-mechanical-style-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running mechanical_style_examples generator…");
  const t0 = Date.now();
  const result = await generateMechanicalStyleExamples({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readMechanicalStyleExamples(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== EXAMPLES ===\n");
  for (const ex of payload.examples) {
    console.log(`-- ${ex.id} — ${ex.style_label} --`);
    console.log(ex.paragraph);
    console.log("");
  }
  console.log("=== META ===");
  console.log(JSON.stringify(payload.meta, null, 2));
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
