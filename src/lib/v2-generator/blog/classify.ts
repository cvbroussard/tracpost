import { sql } from "@/lib/db";
import type { BlogContentType } from "./types";

/**
 * Pick the right blog content type for this generation.
 *
 * Ported from v1's classifyContentType. Logic:
 *   1. Prioritize authority_overview if the site doesn't have one yet
 *      (every site needs one flagship "why us" article)
 *   2. If research found significant entities, do a vendor_spotlight
 *   3. If the context_note has project signals (before/after/reveal/
 *      completed/installed/client/customer/homeowner), do a project_story
 *   4. Default to deep_dive
 *
 * Caller can override via spec.contentTypeOverride if the orchestrator
 * has a strategic reason (e.g., reward-prompt strategy maps reward
 * categories to specific types).
 */

export async function classifyBlogContentType(
  siteId: string,
  contextNote: string,
  research: string,
): Promise<BlogContentType> {
  // 1. Prioritize authority_overview when site lacks one
  const existing = await sql`
    SELECT DISTINCT metadata->>'content_type' AS content_type
    FROM blog_posts_v2
    WHERE site_id = ${siteId}
      AND status IN ('published', 'draft')
      AND metadata->>'content_type' IS NOT NULL
  `;
  const existingTypes = existing.map((r) => r.content_type as string).filter(Boolean);
  if (!existingTypes.includes("authority_overview")) return "authority_overview";

  // 2. Research-driven signal — if Wikipedia returned meaningful content,
  //    treat this as a vendor_spotlight opportunity
  if (research.length > 200) return "vendor_spotlight";

  // 3. Project signals in the context note
  const projectSignals = /\b(before|after|reveal|completed|finished|installed|client|customer|homeowner)\b/i;
  if (projectSignals.test(contextNote)) return "project_story";

  // 4. Default
  return "deep_dive";
}
