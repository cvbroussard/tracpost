/**
 * One-off: trigger voice_source_character_recommendation generation + dump.
 * Run: npx tsx -r dotenv/config --conditions=react-server scripts/run-voice-source-character-generator.ts <business-id> dotenv_config_path=.env.local
 */
import "dotenv/config";
import { sql } from "@/lib/db";
import {
  generateVoiceSourceCharacterRecommendation,
  readVoiceSourceCharacterRecommendation,
} from "@/lib/brand-identity/voice-source-character-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-voice-source-character-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running voice-source-character generator…");
  const t0 = Date.now();
  const result = await generateVoiceSourceCharacterRecommendation({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readVoiceSourceCharacterRecommendation(biz.id as string);
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
