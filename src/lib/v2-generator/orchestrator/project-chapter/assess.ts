import { sql } from "@/lib/db";
import type { ChapterSiteAssessment } from "./types";

/**
 * Inspect a site's chapter readiness state.
 *
 * Returns the list of chapters in 'ready' status across all v2 projects
 * for the site, ordered by project + sequence index. Strategies pick
 * from this list per their own logic.
 */
export async function assessChapters(siteId: string): Promise<ChapterSiteAssessment> {
  const rows = await sql`
    SELECT pc.id AS chapter_id, pc.project_id, pv.name AS project_name,
           pc.slug AS chapter_slug, pc.title AS chapter_title,
           pc.sequence_index, pc.trigger_kind, pc.status
    FROM project_chapters pc
    JOIN projects_v2 pv ON pv.id = pc.project_id
    WHERE pv.business_id = ${siteId}
      AND pc.status = 'ready'
    ORDER BY pc.project_id, pc.sequence_index
  `;

  const [count] = await sql`
    SELECT COUNT(*)::int AS n FROM projects_v2 WHERE business_id = ${siteId}
  `;

  return {
    siteId,
    readyChapters: rows.map((r) => ({
      chapterId: r.chapter_id as string,
      projectId: r.project_id as string,
      projectName: r.project_name as string,
      chapterSlug: r.chapter_slug as string,
      chapterTitle: r.chapter_title as string,
      sequenceIndex: r.sequence_index as number,
      triggerKind: r.trigger_kind as "milestone_date" | "manual" | "asset_threshold",
      status: r.status as "pending" | "ready" | "generated" | "skipped",
    })),
    projectCount: (count?.n as number) || 0,
  };
}
