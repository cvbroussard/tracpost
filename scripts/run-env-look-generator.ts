/**
 * One-off: trigger env_look_examples generation for a business + dump.
 * Run: npx tsx --conditions=react-server scripts/run-env-look-generator.ts <business-id>
 */
import { sql } from "@/lib/db";
import {
  generateEnvLookExamples,
  readEnvLookExamples,
} from "@/lib/brand-identity/env-look-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-env-look-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running env_look generator…");
  const t0 = Date.now();
  const result = await generateEnvLookExamples({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readEnvLookExamples(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== SOURCE IMAGES ===");
  payload.source_images.forEach((img, i) => console.log(`  ${i}. ${img.label} — ${img.url}`));
  console.log("\n=== EXAMPLES ===\n");
  for (const ex of payload.examples) {
    console.log(`-- ${ex.id} — ${ex.caption} --`);
    console.log(`   frames: [${ex.reference_frame_indexes.join(", ")}]`);
    console.log(`   ${ex.disposition_summary}`);
    console.log("");
  }
  console.log("=== META ===");
  console.log(JSON.stringify(payload.meta, null, 2));
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
