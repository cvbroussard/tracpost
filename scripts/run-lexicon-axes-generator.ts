/**
 * One-off: trigger lexicon_axes generation for a business + dump.
 * Mirrors the mechanical-style-generator runner.
 *
 * Run: npx tsx --conditions=react-server scripts/run-lexicon-axes-generator.ts <business-id>
 */
import { sql } from "@/lib/db";
import {
  generateLexiconAxes,
  readLexiconAxes,
} from "@/lib/brand-identity/lexicon-axes-generator";

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-lexicon-axes-generator.ts <business-id>");
    process.exit(1);
  }
  const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${arg} LIMIT 1`;
  if (!biz) {
    console.error(`no business ${arg}`);
    process.exit(1);
  }
  console.log(`\nBusiness: ${biz.name} (${biz.id})\n`);
  console.log("Running lexicon_axes generator…");
  const t0 = Date.now();
  const result = await generateLexiconAxes({ businessId: biz.id as string });
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  if (!result.persisted) return;
  const payload = await readLexiconAxes(biz.id as string);
  if (!payload) {
    console.log("no payload");
    return;
  }
  console.log("=== AXES ===\n");
  for (const ax of payload.axes) {
    console.log(`-- ${ax.axis_key} — ${ax.label} --`);
    if (ax.hint) console.log(`   hint: ${ax.hint}`);
    console.log(`   terms: ${ax.terms.join(" | ")}`);
    console.log("");
  }
  console.log("=== META ===");
  console.log(JSON.stringify(payload.meta, null, 2));
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
