/**
 * One-off: trigger tagline_examples generation for a business + dump.
 * Run: npx tsx --conditions=react-server scripts/run-tagline-generator.ts <business-id>
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { sql } from "@/lib/db";
import {
  generateTaglineExamples,
  readTaglineExamples,
} from "@/lib/brand-identity/tagline-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-tagline-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running tagline generator…");
  const t0 = Date.now();
  const result = await generateTaglineExamples({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readTaglineExamples(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== CANDIDATES ===\n");
  for (const ex of payload.examples) {
    console.log(`-- ${ex.id} — ${ex.style_label} (${ex.length_words} words) --`);
    console.log(`   "${ex.tagline}"`);
    console.log(`   ${ex.rationale}`);
    console.log("");
  }
  console.log("=== META ===");
  console.log(JSON.stringify(payload.meta, null, 2));
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
