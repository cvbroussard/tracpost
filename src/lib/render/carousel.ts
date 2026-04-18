/**
 * Carousel composition — auto-builds carousel posts from project
 * photo series. Selects best photos, orders chronologically,
 * applies per-slide rendering (BEFORE/AFTER labels, SWIPE prompt,
 * hero treatment on final slide).
 *
 * Trigger conditions:
 * - Project has 5+ triaged photos spanning 7+ days
 * - OR project end_date is set (marked complete)
 * - OR no new photos for 14 days (inferred completion)
 */
import "server-only";
import { sql } from "@/lib/db";
import { cropForPlatform } from "./crops";
import { applyGrade } from "./grade";
import { applyTextOverlays } from "./overlay";
import { uploadBufferToR2 } from "@/lib/r2";
import type { PlatformKey, AspectRatio, TextOverlay, GradePreset } from "./types";
import { PLATFORM_ASPECTS } from "./types";

interface CarouselSlide {
  assetId: string;
  url: string;
  qualityScore: number;
  dateTaken: string | null;
  sceneType: string | null;
}

interface CarouselConfig {
  platform: PlatformKey;
  maxSlides: number;
  grade: GradePreset;
  firstSlideOverlay?: string;
  lastSlideOverlay?: string;
}

const PLATFORM_MAX_SLIDES: Partial<Record<PlatformKey, number>> = {
  instagram: 20,
  facebook: 10,
  linkedin: 10,
};

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Select the best photos for a carousel. Picks photos that:
 * - Have high quality scores
 * - Are visually diverse (no consecutive same scene_type)
 * - Are chronologically ordered
 */
function selectSlides(candidates: CarouselSlide[], maxSlides: number): CarouselSlide[] {
  if (candidates.length <= maxSlides) return candidates;

  // Always include first (before) and last (after)
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const middle = candidates.slice(1, -1);

  // Sort middle by quality, then pick diverse ones
  const byQuality = [...middle].sort((a, b) => b.qualityScore - a.qualityScore);
  const selected: CarouselSlide[] = [first];
  let lastScene: string | null = first.sceneType;

  for (const slide of byQuality) {
    if (selected.length >= maxSlides - 1) break;
    // Prefer different scene types for visual diversity
    if (slide.sceneType && slide.sceneType === lastScene && byQuality.length > maxSlides) {
      continue;
    }
    selected.push(slide);
    lastScene = slide.sceneType;
  }

  selected.push(last);

  // Re-sort chronologically
  return selected.sort((a, b) => {
    const dateA = a.dateTaken ? new Date(a.dateTaken).getTime() : 0;
    const dateB = b.dateTaken ? new Date(b.dateTaken).getTime() : 0;
    return dateA - dateB;
  });
}

/**
 * Compose a carousel for a project on a specific platform.
 * Returns the carousel composition ID and slide URLs.
 */
export async function composeCarousel(
  projectId: string,
  siteId: string,
  config: CarouselConfig,
): Promise<{ compositionId: string; slideUrls: string[] } | null> {
  const maxSlides = config.maxSlides || PLATFORM_MAX_SLIDES[config.platform] || 5;
  const aspect = PLATFORM_ASPECTS[config.platform];

  // Use site-relative threshold (shelve boundary = lowest acceptable)
  const { getThresholds, shelveBelow } = await import("@/lib/pipeline/quality-thresholds");
  const qt = await getThresholds(siteId);

  // Fetch project photos
  const photos = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.date_taken,
           ma.ai_analysis->>'scene_type' AS scene_type
    FROM asset_projects ap
    JOIN media_assets ma ON ma.id = ap.asset_id
    WHERE ap.project_id = ${projectId}
      AND ma.triage_status IN ('triaged', 'scheduled', 'consumed')
      AND ma.media_type LIKE 'image%'
      AND ma.quality_score >= ${shelveBelow(qt)}
    ORDER BY ma.date_taken ASC NULLS LAST, ma.created_at ASC
  `;

  if (photos.length < 2) return null;

  const candidates: CarouselSlide[] = photos.map((p) => ({
    assetId: String(p.id),
    url: String(p.storage_url),
    qualityScore: Number(p.quality_score) || 0,
    dateTaken: p.date_taken ? String(p.date_taken) : null,
    sceneType: p.scene_type ? String(p.scene_type) : null,
  }));

  const slides = selectSlides(candidates, maxSlides);
  const slideUrls: string[] = [];
  const slideConfigs: Array<{ overlays: TextOverlay[] }> = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const isFirst = i === 0;
    const isLast = i === slides.length - 1;

    let buffer = await fetchBuffer(slide.url);

    // Crop for platform
    buffer = await cropForPlatform(buffer, aspect);

    // Grade
    buffer = await applyGrade(buffer, config.grade);

    // Slide-specific overlays
    const overlays: TextOverlay[] = [];
    if (isFirst && config.firstSlideOverlay) {
      overlays.push({
        text: config.firstSlideOverlay,
        position: "bottom-center",
        fontSize: 28,
        fontWeight: "bold",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.6)",
      });
    }
    if (isLast && config.lastSlideOverlay) {
      overlays.push({
        text: config.lastSlideOverlay,
        position: "bottom-center",
        fontSize: 28,
        fontWeight: "bold",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.6)",
      });
    }
    if (isFirst && !config.firstSlideOverlay && slides.length > 2) {
      overlays.push({
        text: "SWIPE →",
        position: "bottom-right",
        fontSize: 20,
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.5)",
      });
    }

    if (overlays.length > 0) {
      buffer = await applyTextOverlays(buffer, overlays);
    }

    slideConfigs.push({ overlays });

    // Upload slide variant
    const date = new Date().toISOString().slice(0, 10);
    const key = `sites/${siteId}/carousel/${projectId}/${config.platform}-slide-${i + 1}.jpg`;
    const url = await uploadBufferToR2(key, buffer, "image/jpeg");
    slideUrls.push(url);
  }

  // Store composition
  const assetIds = slides.map((s) => s.assetId);
  const [comp] = await sql`
    INSERT INTO carousel_compositions (site_id, project_id, platform, slide_asset_ids, slide_configs, status)
    VALUES (${siteId}, ${projectId}, ${config.platform}, ${assetIds}, ${JSON.stringify(slideConfigs)}::jsonb, 'rendered')
    RETURNING id
  `;

  return {
    compositionId: String(comp.id),
    slideUrls,
  };
}

/**
 * Check if a project qualifies for auto-carousel composition.
 */
export async function shouldComposeCarousel(projectId: string): Promise<boolean> {
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS photo_count,
      MIN(ma.date_taken) AS earliest,
      MAX(ma.date_taken) AS latest,
      p.end_date,
      MAX(ma.created_at) AS last_upload
    FROM asset_projects ap
    JOIN media_assets ma ON ma.id = ap.asset_id
    JOIN projects p ON p.id = ap.project_id
    WHERE ap.project_id = ${projectId}
      AND ma.triage_status IN ('triaged', 'scheduled', 'consumed')
      AND ma.media_type LIKE 'image%'
    GROUP BY p.end_date
  `;

  if (!stats || (stats.photo_count as number) < 3) return false;

  // Project marked complete
  if (stats.end_date) return true;

  // 5+ photos spanning 7+ days
  if ((stats.photo_count as number) >= 5 && stats.earliest && stats.latest) {
    const span = new Date(String(stats.latest)).getTime() - new Date(String(stats.earliest)).getTime();
    if (span >= 7 * 24 * 60 * 60 * 1000) return true;
  }

  // No new photos for 14 days (inferred completion)
  if (stats.last_upload) {
    const daysSinceUpload = (Date.now() - new Date(String(stats.last_upload)).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUpload >= 14 && (stats.photo_count as number) >= 3) return true;
  }

  return false;
}
