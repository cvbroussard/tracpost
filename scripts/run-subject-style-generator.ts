/**
 * One-off: trigger subject_style_examples generation + dump.
 * Run: npx tsx --conditions=react-server scripts/run-subject-style-generator.ts <business-id>
 */
import { sql } from "@/lib/db";
import {
  generateSubjectStyleExamples,
  readSubjectStyleExamples,
} from "@/lib/brand-identity/subject-style-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-subject-style-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running subject_style generator…");
  const t0 = Date.now();
  const result = await generateSubjectStyleExamples({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readSubjectStyleExamples(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== EXAMPLES ===\n");
  for (const ex of payload.examples) {
    console.log(`-- ${ex.id} — ${ex.caption} --`);
    console.log(`   frames: [${ex.reference_frame_indexes.join(", ")}]`);
    console.log(`   ${ex.disposition_summary}`);
    console.log("");
  }
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
