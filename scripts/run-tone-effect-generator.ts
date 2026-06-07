/**
 * One-off: trigger tone_effect_recommendation generation for a business + dump.
 * Run: npx tsx -r dotenv/config --conditions=react-server scripts/run-tone-effect-generator.ts <business-id> dotenv_config_path=.env.local
 */
import "dotenv/config";
import { sql } from "@/lib/db";
import {
  generateToneEffectRecommendation,
  readToneEffectRecommendation,
} from "@/lib/brand-identity/tone-effect-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-tone-effect-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running tone-effect generator…");
  const t0 = Date.now();
  const result = await generateToneEffectRecommendation({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readToneEffectRecommendation(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== SUGGESTIONS ===\n");
  for (const s of payload.suggestions) {
    const confPct = (s.confidence * 100).toFixed(0);
    console.log(`-- ${s.id} (confidence ${confPct}%) --`);
    console.log(`   "${s.prose}"`);
    console.log(`   Why: ${s.reasoning}`);
    console.log("");
  }
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
