import { sql } from "@/lib/db";

/**
 * Hook bank — pull a curated opening hook for a generated article.
 *
 * Ported from v1 (blog-generator.ts hook selection). Selects with bias
 * toward 'loved' rating and least-recently-used (rotation), updates the
 * usage counter on the chosen hook so the next article picks a different
 * one until everything's been cycled through.
 *
 * Returns null when the site has no hooks. Caller decides whether to
 * include the hook in the prompt.
 */
export async function pullHook(
  siteId: string,
  opts?: { dryRun?: boolean },
): Promise<string | null> {
  const [hook] = await sql`
    SELECT text FROM hook_bank
    WHERE business_id = ${siteId}
    ORDER BY
      CASE rating WHEN 'loved' THEN 0 ELSE 1 END,
      used_count ASC,
      RANDOM()
    LIMIT 1
  `;

  if (!hook) return null;

  const text = hook.text as string;
  // Inspector dry-runs preview the same hook the next real generation would
  // get without consuming it. Without this, repeated inspector calls would
  // rotate through the bank and inflate used_count for unpublished previews.
  if (!opts?.dryRun) {
    await sql`
      UPDATE hook_bank
      SET used_count = used_count + 1, last_used_at = NOW()
      WHERE business_id = ${siteId} AND text = ${text}
    `;
  }
  return text;
}

/** Total hook count for a site — feeds the readiness panel. */
export async function getHookBankDepth(siteId: string): Promise<number> {
  const [r] = await sql`SELECT COUNT(*)::int AS n FROM hook_bank WHERE business_id = ${siteId}`;
  return (r?.n as number) || 0;
}
