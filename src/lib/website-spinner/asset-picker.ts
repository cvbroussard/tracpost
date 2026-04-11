/**
 * Select assets for website sections based on quality and context.
 */
import { sql } from "@/lib/db";

export interface SelectedAssets {
  hero: string;           // Best overall image
  aboutHero: string | null;
  gallery: Array<{ url: string; alt: string }>;
  serviceImages: string[];
}

export async function selectAssets(siteId: string): Promise<SelectedAssets> {
  // Fetch top assets by quality
  const assets = await sql`
    SELECT storage_url, context_note, quality_score, ai_analysis->>'scene_type' AS scene
    FROM media_assets
    WHERE site_id = ${siteId}
      AND triage_status = 'triaged'
      AND media_type LIKE 'image%'
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 20
  `;

  const urls = assets.map((a) => String(a.storage_url));
  const withCaptions = assets.filter((a) => a.context_note);

  return {
    hero: urls[0] || "",
    aboutHero: urls[1] || null,
    gallery: assets.slice(0, 9).map((a) => ({
      url: String(a.storage_url),
      alt: a.context_note ? String(a.context_note).slice(0, 100) : "",
    })),
    serviceImages: urls.slice(2, 5),
  };
}
