import { sql } from "@/lib/db";

/**
 * Seed chapter rows for a project from an industry template.
 *
 * Called when a project is created (or migrated into v2) to instantiate
 * the project's lifecycle chapters. Operator can edit the chapter list
 * after seeding.
 *
 * Default template: 'renovation_remodel' (covers construction, kitchen,
 * bath, whole-house remodel — the bulk of TracPost's current subscriber
 * base). Future: more templates per industry.
 *
 * Idempotent — uses ON CONFLICT (project_id, slug) DO NOTHING. Safe to
 * call multiple times; will only add chapters that don't already exist.
 */
export async function seedChaptersForProject(
  projectId: string,
  industryKey: string = "renovation_remodel",
): Promise<number> {
  const templates = await sql`
    SELECT slug, title, intent, sequence_index, trigger_kind, asset_filter, structure_template
    FROM chapter_templates
    WHERE industry_key = ${industryKey}
    ORDER BY sequence_index
  `;

  let inserted = 0;
  for (const t of templates) {
    const [row] = await sql`
      INSERT INTO project_chapters (
        project_id, slug, title, intent, sequence_index,
        trigger_kind, asset_filter, structure_template, status
      ) VALUES (
        ${projectId}, ${t.slug}, ${t.title}, ${t.intent}, ${t.sequence_index},
        ${t.trigger_kind}, ${JSON.stringify(t.asset_filter)}::jsonb, ${t.structure_template}, 'pending'
      )
      ON CONFLICT (project_id, slug) DO NOTHING
      RETURNING id
    `;
    if (row) inserted++;
  }
  return inserted;
}

/**
 * Mark a chapter ready when its trigger condition is met.
 * Caller (orchestrator or operator UI) decides when to flip 'pending' → 'ready'.
 */
export async function markChapterReady(chapterId: string): Promise<void> {
  await sql`UPDATE project_chapters SET status = 'ready' WHERE id = ${chapterId} AND status = 'pending'`;
}

/**
 * Get all chapters for a project, in sequence order.
 */
export async function getProjectChapters(projectId: string): Promise<Array<{
  id: string;
  slug: string;
  title: string;
  status: string;
  sequenceIndex: number;
}>> {
  const rows = await sql`
    SELECT id, slug, title, status, sequence_index
    FROM project_chapters
    WHERE project_id = ${projectId}
    ORDER BY sequence_index
  `;
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    status: r.status as string,
    sequenceIndex: r.sequence_index as number,
  }));
}
