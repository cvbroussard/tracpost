/**
 * Server-side runner: trigger the aesthetic Phase 2 observation for a given
 * business and dump the resulting substrate row. Bypasses the HTTP route (no
 * admin session needed locally). Same wiring the API route uses.
 *
 * Run: npx tsx scripts/run-aesthetic-observation.ts <business-id-or-domain>
 *   - business-id: pass a UUID
 *   - domain:      pass a substring of businesses.url (e.g. "bsquared")
 */
import { sql } from "@/lib/db";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { runExtraction, stubExtractor, type ExtractorChooser } from "@/lib/brand-identity/extract";
import { aestheticObservationExtractor } from "@/lib/brand-identity/aesthetic-observation";
import { getSubstrate } from "@/lib/substrate/store";

const chooseExtractor: ExtractorChooser = (spec) => {
  if (spec.key === "aesthetic") return aestheticObservationExtractor;
  return stubExtractor;
};

async function resolveBusinessId(arg: string): Promise<{ id: string; name: string | null; url: string | null }> {
  // Try UUID-ish path first.
  if (/^[0-9a-f-]{32,36}$/i.test(arg)) {
    const [row] = await sql`SELECT id, name, url FROM businesses WHERE id = ${arg} LIMIT 1`;
    if (row) return { id: row.id as string, name: row.name as string | null, url: row.url as string | null };
  }
  // Fall back to URL substring match.
  const rows = await sql`
    SELECT id, name, url FROM businesses
    WHERE url ILIKE ${"%" + arg + "%"}
       OR name ILIKE ${"%" + arg + "%"}
    LIMIT 5
  `;
  if (!rows.length) throw new Error(`no business matched '${arg}'`);
  if (rows.length > 1) {
    console.error(`multiple matches for '${arg}':`);
    for (const r of rows) console.error(`  ${r.id}  ${r.name ?? "(no name)"}  ${r.url ?? "(no url)"}`);
    throw new Error("ambiguous match; pass a UUID");
  }
  return { id: rows[0].id as string, name: rows[0].name as string | null, url: rows[0].url as string | null };
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/run-aesthetic-observation.ts <business-id-or-domain>");
    process.exit(1);
  }

  const biz = await resolveBusinessId(arg);
  console.log(`\nBusiness: ${biz.name} (${biz.id})`);
  console.log(`URL: ${biz.url ?? "(none)"}\n`);

  const [photoCount] = await sql`
    SELECT count(*)::int AS n FROM gbp_photo_sync
    WHERE business_id = ${biz.id}
      AND category = ANY(${["COVER","PROFILE","LOGO","EXTERIOR","INTERIOR","TEAM"]})
  `;
  console.log(`Priority-category GBP photos available: ${photoCount.n}`);

  const { brandIdentityId } = await ensureBrandIdentity(biz.id);
  console.log(`Brand identity: ${brandIdentityId}\n`);

  console.log("Running aesthetic Phase 2 observation… (Sonnet 4.6 multimodal)");
  const t0 = Date.now();
  const result = await runExtraction(brandIdentityId, {
    keys: ["aesthetic"],
    chooseExtractor,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);

  const substrate = await getSubstrate(biz.id, "public_presence_observation");
  if (!substrate) {
    console.log("No substrate row written.");
    return;
  }
  console.log(`\n=== business_substrate row ${substrate.id} ===`);
  console.log(`Updated: ${substrate.updatedAt}`);
  console.log(`Generation metadata:`);
  console.log(JSON.stringify(substrate.generationMetadata, null, 2));
  console.log(`\nPayload:`);
  console.log(JSON.stringify(substrate.payload, null, 2));
})().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
