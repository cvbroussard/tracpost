import { sql } from "@/lib/db";

/**
 * Pull the most recent N titles for a given pool so the LLM can avoid
 * reusing them (or near-duplicates).
 *
 * Per-pool because:
 *   - Blog dedup should look at recent blog articles (often 20+ exist)
 *   - Project dedup looks at recent project pages (handful)
 *   - Service dedup looks at recent service pages (handful)
 *
 * The prompt-side rule: "ALREADY PUBLISHED — do NOT reuse these titles
 * or similar phrasing". Caller injects the returned list.
 */
export type Pool = "blog" | "project" | "service";

const DEFAULT_LIMIT = 20;

export async function getExistingTitles(
  siteId: string,
  pool: Pool,
  limit: number = DEFAULT_LIMIT,
): Promise<string[]> {
  if (pool === "blog") {
    const rows = await sql`
      SELECT title FROM blog_posts_v2
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.title as string);
  }
  if (pool === "project") {
    const rows = await sql`
      SELECT name AS title FROM projects_v2
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.title as string);
  }
  if (pool === "service") {
    const rows = await sql`
      SELECT name AS title FROM services_v2
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.title as string);
  }
  return [];
}
