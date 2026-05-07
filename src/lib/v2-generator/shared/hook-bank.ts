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
export async function pullHook(siteId: string): Promise<string | null> {
  const [hook] = await sql`
    SELECT text FROM hook_bank
    WHERE site_id = ${siteId}
    ORDER BY
      CASE rating WHEN 'loved' THEN 0 ELSE 1 END,
      used_count ASC,
      RANDOM()
    LIMIT 1
  `;

  if (!hook) return null;

  const text = hook.text as string;
  await sql`
    UPDATE hook_bank
    SET used_count = used_count + 1, last_used_at = NOW()
    WHERE site_id = ${siteId} AND text = ${text}
  `;
  return text;
}
