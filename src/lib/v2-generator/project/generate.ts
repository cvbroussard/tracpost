import { sql } from "@/lib/db";
import { generateBlogArticle } from "../blog";
import type { GenerateChapterSpec, GenerateChapterResult } from "./types";

/**
 * Generate a project chapter article.
 *
 * Each chapter is its own focused article (1 article per chapter, not
 * 1 article per project). Lives in blog_posts_v2 with project_id FK
 * back to its parent project.
 *
 * Asset selection rule (STRICT):
 *   1. Pool starts as `asset_projects WHERE project_id = ?` — never
 *      cross-project.
 *   2. Filtered by chapter.asset_filter (e.g. content_tags overlap with
 *      ["demo","before","reveal_walls"] for a demolition chapter).
 *   3. Hero is the highest-quality matching asset; body candidates are
 *      the remainder.
 *
 * Calls generateBlogArticle with the constrained asset pool + chapter's
 * intent + structure_template injected as topicHint/intent.
 *
 * On success, marks the chapter generated and links to the new article.
 */
export async function generateProjectChapter(
  spec: GenerateChapterSpec,
): Promise<GenerateChapterResult> {
  // 1. Load chapter + project
  const [chapter] = await sql`
    SELECT pc.id, pc.project_id, pc.slug, pc.title, pc.intent,
           pc.asset_filter, pc.structure_template, pc.status,
           pv.business_id
    FROM project_chapters pc
    JOIN projects_v2 pv ON pv.id = pc.project_id
    WHERE pc.id = ${spec.chapterId}
  `;
  if (!chapter) throw new Error(`Chapter ${spec.chapterId} not found`);
  if (chapter.status === "generated") {
    throw new Error(`Chapter ${spec.chapterId} already generated`);
  }

  // 2. Resolve eligible asset pool — STRICT to project
  const filter = (chapter.asset_filter as Record<string, unknown>) || {};
  const filterTags = Array.isArray(filter.content_tags)
    ? (filter.content_tags as string[])
    : [];

  // Step A: all assets joined to this project
  const projectAssets = await sql`
    SELECT ma.id, ma.media_type, ma.content_tags, ma.quality_score, ma.created_at
    FROM asset_projects ap
    JOIN media_assets ma ON ma.id = ap.asset_id
    WHERE ap.project_id = ${chapter.project_id}
      AND ma.processing_stage = 'analyzed'
      AND ma.archived_at IS NULL
      AND (ma.media_type ILIKE 'image%' OR ma.media_type = 'video')
    ORDER BY
      CASE WHEN ma.media_type = 'video' THEN 0 ELSE 1 END,
      ma.quality_score DESC NULLS LAST,
      ma.created_at DESC
  `;

  if (projectAssets.length === 0) {
    throw new Error(
      `Chapter ${spec.chapterId}: project ${chapter.project_id} has no eligible assets`,
    );
  }

  // Step B: filter by chapter's asset_filter (content_tags overlap)
  let matchingAssets = projectAssets;
  if (filterTags.length > 0) {
    matchingAssets = projectAssets.filter((a) => {
      const tags = Array.isArray(a.content_tags) ? (a.content_tags as string[]) : [];
      return tags.some((t) => filterTags.includes(t));
    });
    // Fall back to project-wide if no filter matches (chapter still gets generated)
    if (matchingAssets.length === 0) {
      console.warn(
        `Chapter ${spec.chapterId}: no assets match filter ${JSON.stringify(filterTags)} ` +
        `— falling back to project-wide pool`,
      );
      matchingAssets = projectAssets;
    }
  }

  // Step C: hero = top of filtered pool; body = next N
  const heroAsset = matchingAssets[0];
  const bodyAssets = matchingAssets.slice(1, 9); // up to 8 body candidates

  // 3. Compose intent — chapter intent + structure_template (if present)
  let intent = chapter.intent as string;
  if (chapter.structure_template) {
    intent = `${intent}\n\nStructure to follow:\n${chapter.structure_template}`;
  }

  // 4. Generate via blog pipeline (chapters are blog articles tied to a project)
  const result = await generateBlogArticle({
    siteId: chapter.business_id as string,
    heroAssetId: heroAsset.id as string,
    bodyAssetIds: bodyAssets.map((a) => a.id as string),
    seedAssetId: heroAsset.id as string,
    intent,
    topicHint: chapter.title as string,
    contentTypeOverride: "project_story",
    projectId: chapter.project_id as string,
    status: spec.status || "draft",
  });

  // 5. Mark chapter generated + link to article
  await sql`
    UPDATE project_chapters
    SET status = 'generated', blog_post_id = ${result.id}, generated_at = NOW()
    WHERE id = ${spec.chapterId}
  `;

  return {
    chapterId: spec.chapterId,
    blogPostId: result.id,
    slug: result.slug,
    title: result.title,
    assetsCount: result.assetsCount,
    status: result.status,
  };
}
