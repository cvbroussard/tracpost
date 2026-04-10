import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/blog/cron — Daily blog article generation for all sites.
 *
 * For each site with autopilot + blog enabled + blog_cadence > 0:
 * 1. Check if an article is due based on cadence and last generation date
 * 2. Decide editorial vs project based on article_mix ratio
 * 3. Generate article and save as draft
 *
 * Runs daily. Processes sites until time limit (~4 min safety margin).
 */
export async function GET(req: NextRequest) {
  // Auth: cron secret or skip if not configured
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 240_000; // 4 minutes, leave 1 min buffer

  // Fetch all eligible sites
  const sites = await sql`
    SELECT s.id, s.name, s.blog_cadence, s.article_mix,
           s.brand_playbook IS NOT NULL AS has_playbook,
           s.metadata
    FROM sites s
    WHERE s.is_active = true
      AND s.autopilot_enabled = true
      AND s.blog_cadence > 0
    ORDER BY s.created_at ASC
  `;

  const results: Array<{ siteId: string; siteName: string; action: string }> = [];

  for (const site of sites) {
    // Time check
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      results.push({ siteId: site.id as string, siteName: site.name as string, action: "skipped — time limit" });
      break;
    }

    const siteId = site.id as string;
    const cadence = (site.blog_cadence as number) || 0;
    const mix = (site.article_mix as string) || "3:1";
    const hasPlaybook = site.has_playbook as boolean;

    if (cadence === 0) continue;

    try {
      // Check last generated article date
      const [lastArticle] = await sql`
        SELECT created_at FROM blog_posts
        WHERE site_id = ${siteId}
        ORDER BY created_at DESC LIMIT 1
      `;

      // Calculate if article is due
      // cadence = articles per week → interval = 7 / cadence days
      const intervalDays = 7 / cadence;
      const lastDate = lastArticle?.created_at ? new Date(lastArticle.created_at as string) : new Date(0);
      const daysSinceLast = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLast < intervalDays) {
        results.push({ siteId, siteName: site.name as string, action: `not due (${daysSinceLast.toFixed(1)}d since last, interval ${intervalDays.toFixed(1)}d)` });
        continue;
      }

      // Decide: editorial or project?
      const articleType = pickArticleType(siteId, mix);

      if (articleType === "project") {
        // Find a project with prompts
        const [project] = await sql`
          SELECT id FROM projects
          WHERE site_id = ${siteId}
            AND metadata->'article_prompts' IS NOT NULL
            AND jsonb_array_length(metadata->'article_prompts') > 0
          ORDER BY RANDOM() LIMIT 1
        `;

        if (project) {
          const res = await generateProjectArticle(project.id as string, siteId);
          results.push({ siteId, siteName: site.name as string, action: res ? `project article: "${res}"` : "project article failed" });
          continue;
        }
        // Fall through to editorial if no qualifying project
      }

      // Editorial article
      if (hasPlaybook) {
        const metadata = (site.metadata || {}) as Record<string, unknown>;
        const rewardPrompts = (metadata.reward_prompts as unknown[]) || [];
        if (rewardPrompts.length > 0) {
          const res = await generateEditorialArticle(siteId);
          results.push({ siteId, siteName: site.name as string, action: res ? `editorial article: "${res}"` : "editorial article failed" });
          continue;
        }
      }

      results.push({ siteId, siteName: site.name as string, action: "skipped — no playbook or prompts" });
    } catch (err) {
      results.push({ siteId, siteName: site.name as string, action: `error: ${err instanceof Error ? err.message : err}` });
    }
  }

  return NextResponse.json({
    processed: results.length,
    runtime_ms: Date.now() - startTime,
    results,
  });
}

/**
 * Decide editorial vs project based on mix ratio and recent history.
 */
function pickArticleType(siteId: string, mix: string): "editorial" | "project" {
  const [editorialPart, projectPart] = mix.split(":").map(Number);
  if (!projectPart || projectPart === 0) return "editorial";
  if (!editorialPart || editorialPart === 0) return "project";

  // Simple ratio: random weighted by the mix
  const total = editorialPart + projectPart;
  const roll = Math.random() * total;
  return roll < editorialPart ? "editorial" : "project";
}

/**
 * Generate a project article using the angle rotation system.
 */
async function generateProjectArticle(projectId: string, siteId: string): Promise<string | null> {
  try {
    const [project] = await sql`SELECT metadata FROM projects WHERE id = ${projectId}`;
    const meta = (project?.metadata || {}) as Record<string, unknown>;
    const prompts = (meta.article_prompts as Array<{ title: string; angle: string; assetHint: string }>) || [];
    const usedIndices = (meta.used_prompt_indices as number[]) || [];

    const unusedIndices = prompts.map((_, i) => i).filter((i) => !usedIndices.includes(i));
    if (unusedIndices.length === 0) return null;

    const selectedIndex = unusedIndices[Math.floor(Math.random() * unusedIndices.length)];
    const articlePrompt = prompts[selectedIndex];

    const { generateProjectArticleFromPrompt } = await import("@/lib/pipeline/project-blog-generator");
    const article = await generateProjectArticleFromPrompt(projectId, siteId, articlePrompt);
    if (!article) return null;

    // Save as draft
    const slug = article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    await sql`
      INSERT INTO blog_posts (site_id, title, slug, body, excerpt, status, source_asset_id, metadata)
      VALUES (${siteId}, ${article.title}, ${slug}, ${article.body}, ${article.excerpt}, 'draft',
              ${article.featuredAssetId || null},
              ${JSON.stringify({ type: "project", project_id: projectId, prompt_index: selectedIndex })}
      )
    `;

    // Mark prompt as used
    const updatedUsed = [...usedIndices, selectedIndex];
    await sql`
      UPDATE projects SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ used_prompt_indices: updatedUsed })}::jsonb
      WHERE id = ${projectId}
    `;

    return article.title;
  } catch (err) {
    console.error("Blog cron project article error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate an editorial article using the reward prompt system.
 */
async function generateEditorialArticle(siteId: string): Promise<string | null> {
  try {
    // Use the existing blog generation pipeline
    const { generateFromPairing } = await import("@/lib/pipeline/blog-generator");
    const { pickNextContent } = await import("@/lib/pipeline/content-matcher");

    const pairing = await pickNextContent(siteId);
    if (!pairing) return null;

    const postId = await generateFromPairing(pairing);
    if (!postId) return null;

    // Fetch the title for logging
    const [post] = await sql`SELECT title FROM blog_posts WHERE id = ${postId}`;
    return (post?.title as string) || "New article";
  } catch (err) {
    console.error("Blog cron editorial article error:", err instanceof Error ? err.message : err);
    return null;
  }
}
