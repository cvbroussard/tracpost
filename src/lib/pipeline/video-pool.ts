import { sql } from "@/lib/db";
import { getThresholds, heroAbove } from "./quality-thresholds";

const DEFAULT_WEEKLY_CAP = 3;

interface VideoPoolResult {
  siteId: string;
  generated: number;
  skipped: number;
  atCap: boolean;
  errors: string[];
}

interface PoolStatus {
  totalVideos: number;
  available: number;
  generatedThisWeek: number;
  weeklyCap: number;
}

/**
 * Build a video prompt from the source asset's triage analysis + brand tone.
 * Asset context is the primary driver; playbook is a light touch.
 */
function buildVideoPrompt(
  aiAnalysis: Record<string, unknown>,
  contextNote: string,
  brandPlaybook: Record<string, unknown> | null,
  contentVibe: string,
  corrections?: string,
): string {
  const parts: string[] = [];

  // Primary: what's in the image
  const description = (aiAnalysis?.description as string) || "";
  const analysisContext = (aiAnalysis?.context_note as string) || "";
  const sceneType = (aiAnalysis?.scene_type as string) || "";

  if (description) parts.push(description);
  if (contextNote && contextNote !== description) parts.push(contextNote);

  // Scene direction based on scene type
  const sceneDirections: Record<string, string> = {
    result: "Slow cinematic pan revealing the finished work",
    environment: "Gentle camera drift through the space, natural light shifts",
    product: "Close-up detail shot with subtle rack focus",
    method: "Dynamic movement showing skilled hands at work",
    humans: "Natural movement, candid interaction with the space",
  };
  if (sceneType && sceneDirections[sceneType]) {
    parts.push(sceneDirections[sceneType]);
  }

  // Light brand tone
  const positioning = (brandPlaybook?.brandPositioning || {}) as Record<string, unknown>;
  const angles = (positioning.selectedAngles || []) as Array<Record<string, unknown>>;
  const tone = (angles[0]?.tone as string) || "";
  if (tone) {
    parts.push(`Mood: ${tone}`);
  } else if (contentVibe) {
    parts.push(contentVibe.slice(0, 60));
  }

  // Append corrections as constraints (Kling prompt is short, so keep tight)
  if (corrections) {
    parts.push(corrections.replace(/\n/g, " ").slice(0, 80));
  }

  return parts.join(". ").slice(0, 250);
}

/**
 * Evaluate whether a site needs new videos and generate them.
 * Runs on a 3-hour cadence, separate from the publish cron.
 */
export async function evaluateAndGenerate(siteId: string): Promise<VideoPoolResult> {
  const result: VideoPoolResult = {
    siteId,
    generated: 0,
    skipped: 0,
    atCap: false,
    errors: [],
  };

  // Load site config
  const [site] = await sql`
    SELECT video_pool_config, brand_playbook, content_vibe
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) return result;

  const poolConfig = (site.video_pool_config || {}) as Record<string, number>;
  const weeklyCap = poolConfig.weekly_cap || DEFAULT_WEEKLY_CAP;

  // Check weekly generation count
  const [weekCount] = await sql`
    SELECT COUNT(*)::int AS count
    FROM media_assets
    WHERE site_id = ${siteId}
      AND source = 'ai_generated'
      AND media_type = 'video'
      AND created_at > date_trunc('week', NOW())
  `;
  const generatedThisWeek = weekCount?.count || 0;

  if (generatedThisWeek >= weeklyCap) {
    result.atCap = true;
    return result;
  }

  const remaining = weeklyCap - generatedThisWeek;

  // Get hero threshold for this site
  const thresholds = await getThresholds(siteId);
  const heroThreshold = heroAbove(thresholds);

  // Find hero-class photo assets without a child video
  const candidates = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.content_tags, ma.ai_analysis, ma.context_note
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status IN ('triaged', 'consumed')
      AND ma.quality_score >= ${heroThreshold}
      AND ma.media_type LIKE 'image%'
      AND NOT EXISTS (
        SELECT 1 FROM media_assets child
        WHERE child.source_asset_id = ma.id
          AND child.media_type = 'video'
      )
    ORDER BY ma.quality_score DESC
    LIMIT 5
  `;

  if (candidates.length === 0) {
    return result;
  }

  // Check existing pool scene types for diversity
  const existingScenes = await sql`
    SELECT DISTINCT ai_analysis->>'scene_type' AS scene_type
    FROM media_assets
    WHERE site_id = ${siteId}
      AND source = 'ai_generated'
      AND media_type = 'video'
  `;
  const existingSceneSet = new Set(existingScenes.map((r) => r.scene_type as string));

  // Prefer candidates with scene types not yet in the pool
  const sorted = [...candidates].sort((a, b) => {
    const aAnalysis = (a.ai_analysis || {}) as Record<string, unknown>;
    const bAnalysis = (b.ai_analysis || {}) as Record<string, unknown>;
    const aScene = aAnalysis.scene_type as string;
    const bScene = bAnalysis.scene_type as string;
    const aNew = !existingSceneSet.has(aScene) ? 1 : 0;
    const bNew = !existingSceneSet.has(bScene) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    return (Number(b.quality_score) || 0) - (Number(a.quality_score) || 0);
  });

  // Generate 1 video per cron invocation to stay within maxDuration
  const toGenerate = sorted.slice(0, Math.min(1, remaining));

  for (const candidate of toGenerate) {
    const analysis = (candidate.ai_analysis || {}) as Record<string, unknown>;

    // Load corrections scoped to video
    let videoCorrections = "";
    try {
      const { loadCorrections, formatCorrectionsForPrompt } = await import("@/lib/corrections");
      const corrections = await loadCorrections(siteId, "video");
      videoCorrections = formatCorrectionsForPrompt(corrections);
    } catch { /* non-fatal */ }

    const prompt = buildVideoPrompt(
      analysis,
      (candidate.context_note as string) || "",
      (site.brand_playbook || null) as Record<string, unknown> | null,
      (site.content_vibe as string) || "",
      videoCorrections,
    );

    try {
      const { generateVideoFromImage } = await import("@/lib/video-gen/kling");
      const video = await generateVideoFromImage(
        candidate.storage_url as string,
        prompt,
        siteId,
        { duration: "5", aspectRatio: "9:16" },
      );

      if (!video) {
        result.skipped++;
        result.errors.push(`Kling returned null for asset ${(candidate.id as string).slice(0, 8)}`);
        continue;
      }

      // Get parent's generated_text for caption inheritance
      const parentGenText = ((candidate as Record<string, unknown>).metadata as Record<string, unknown>)?.generated_text;

      // Insert video as child asset
      await sql`
        INSERT INTO media_assets (
          site_id, storage_url, media_type, context_note,
          source, triage_status, quality_score,
          source_asset_id, content_pillar, content_tags,
          ai_analysis, metadata
        ) VALUES (
          ${siteId}, ${video.url}, 'video',
          ${(analysis.description as string) || (candidate.context_note as string) || ''},
          'ai_generated', 'triaged', 0.85,
          ${candidate.id},
          ${candidate.content_pillar},
          ${candidate.content_tags || []},
          ${JSON.stringify({
            engine: "kling-v2-6",
            scene_type: analysis.scene_type || null,
            description: analysis.description || null,
          })}::jsonb,
          ${JSON.stringify({
            ai_generated: true,
            duration: video.duration,
            generation_prompt: prompt,
            generation_model: "kling-v2-6",
            source_asset_id: candidate.id,
            ...(parentGenText ? { generated_text: parentGenText } : {}),
          })}::jsonb
        )
      `;

      // Copy project associations from parent
      await sql`
        INSERT INTO asset_projects (asset_id, project_id)
        SELECT ${candidate.id}, project_id
        FROM asset_projects
        WHERE asset_id = ${candidate.id}
        ON CONFLICT DO NOTHING
      `;

      result.generated++;
    } catch (err) {
      result.errors.push(`Video gen failed for ${(candidate.id as string).slice(0, 8)}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}

/**
 * Get pool status for a site.
 */
export async function getPoolStatus(siteId: string): Promise<PoolStatus> {
  const [site] = await sql`
    SELECT video_pool_config FROM sites WHERE id = ${siteId}
  `;
  const poolConfig = ((site?.video_pool_config || {}) as Record<string, number>);
  const weeklyCap = poolConfig.weekly_cap || DEFAULT_WEEKLY_CAP;

  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM social_posts sp
          WHERE sp.source_asset_id = ma.id AND sp.status = 'published'
        )
      )::int AS available
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.source = 'ai_generated'
      AND ma.media_type = 'video'
      AND ma.triage_status IN ('triaged', 'consumed')
  `;

  const [weekCount] = await sql`
    SELECT COUNT(*)::int AS count
    FROM media_assets
    WHERE site_id = ${siteId}
      AND source = 'ai_generated'
      AND media_type = 'video'
      AND created_at > date_trunc('week', NOW())
  `;

  return {
    totalVideos: stats?.total || 0,
    available: stats?.available || 0,
    generatedThisWeek: weekCount?.count || 0,
    weeklyCap,
  };
}
