import { sql } from "@/lib/db";

/**
 * Pull project page URLs for a site, formatted for prompt injection.
 *
 * Mirrors the vendor-link mechanism in vendor-enrichment.ts. Articles
 * frequently reference real projects ("our Point Breeze colonial",
 * "the Squirrel Hill Avenue remodel"); without project URLs in the
 * prompt the LLM can't link to them, so reference goes unlinked.
 *
 * Returns "Name: https://site/projects/slug" strings.
 *
 * Optional `excludeProjectId` lets the caller skip a project they
 * don't want self-referenced (e.g., if the article IS that project's
 * chapter, the chapter wouldn't link to its own project page).
 */
export async function getProjectLinks(
  siteId: string,
  siteUrl: string,
  opts?: { excludeProjectId?: string },
): Promise<string[]> {
  const base = (siteUrl || "").replace(/\/+$/, "");
  if (!base) return [];

  // Prefer display_name (short operator-friendly form) over name (which
  // is often the LLM-generated article-style title and reads awkwardly
  // when cited inline). display_name was added in migration 098 and
  // backfilled from legacy projects.name; falls back to name when null.
  const rows = await sql`
    SELECT id, slug, COALESCE(display_name, name) AS display_label
    FROM projects_v2
    WHERE business_id = ${siteId} AND status = 'active'
    ORDER BY created_at DESC
  `;

  return rows
    .filter((r) => r.id !== opts?.excludeProjectId)
    .map((r) => `${r.display_label}: ${base}/projects/${r.slug}`);
}
