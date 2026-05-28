import { sql } from "@/lib/db";
import { getVendorLinks } from "./vendor-enrichment";
import { pillarsFromTags, type PillarConfig } from "@/lib/pillars";

/**
 * Build a rich per-asset context block for the v2 prompts.
 *
 * Pulls every available metadata field for an asset:
 *   - context_note (creator's caption)
 *   - ai_analysis.description (visual)
 *   - ai_analysis.scene_type
 *   - ai_analysis.detected_vendors (vision-detected)
 *   - ai_analysis.detected_personas
 *   - transcription (videos)
 *   - content_pillars + content_tags (taxonomy)
 *   - asset_brands JOIN (operator-tagged vendors with URLs)
 *
 * Per the v1 audit, vendor info lives in TWO places — ai_analysis and
 * asset_brands. v2 was missing the second source; this builder reads
 * both and merges them.
 *
 * Returns:
 *   - A formatted text block ready for prompt injection
 *   - A structured object with all the parsed fields (for downstream
 *     uses like Zone A/B enforcement)
 */

export interface AssetContext {
  id: string;
  kind: "image" | "video" | "audio";
  mediaType: string;
  isHero: boolean;
  contextNote: string | null;
  description: string | null;
  sceneType: string | null;
  detectedVendors: string[];
  detectedPersonas: string[];
  transcription: string | null;
  contentPillars: string[];
  contentTags: string[];
  /** Vendors with URLs from asset_brands join. */
  taggedVendors: Array<{ name: string; url: string | null }>;
}

export async function buildAssetContexts(
  assetIds: string[],
  heroAssetId: string,
  siteId: string,
): Promise<AssetContext[]> {
  if (assetIds.length === 0) return [];

  const rows = await sql`
    SELECT id, media_type, context_note,
           content_tags, ai_analysis, transcription
    FROM media_assets
    WHERE id = ANY(${assetIds}::uuid[])
  `;

  // Pillars are not stored on assets (LOCKED 2026-05-09) — they derive
  // from content_tags + the site's pillar_config at read time.
  const [pcRow] = await sql`SELECT pillar_config FROM businesses WHERE id = ${siteId}`;
  const pillarConfig = (pcRow?.pillar_config || []) as PillarConfig;

  // Pull asset_brands for all in one batch
  const brandRows = await sql`
    SELECT ab.asset_id, b.name, b.url
    FROM asset_brands ab
    JOIN brands b ON b.id = ab.brand_id
    WHERE ab.asset_id = ANY(${assetIds}::uuid[])
  `;
  const brandsByAsset = new Map<string, Array<{ name: string; url: string | null }>>();
  for (const br of brandRows) {
    const aid = br.asset_id as string;
    if (!brandsByAsset.has(aid)) brandsByAsset.set(aid, []);
    brandsByAsset.get(aid)!.push({
      name: br.name as string,
      url: (br.url as string | null) || null,
    });
  }

  // Preserve input order so hero comes first, body candidates follow.
  return assetIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map((r) => {
      const ai = (r.ai_analysis as Record<string, unknown> | null) || {};
      const tags = Array.isArray(r.content_tags) ? (r.content_tags as string[]) : [];
      const mediaType = String(r.media_type || "image");
      const kind: "image" | "video" | "audio" = mediaType.startsWith("video")
        ? "video"
        : mediaType.startsWith("audio")
        ? "audio"
        : "image";

      return {
        id: r.id as string,
        kind,
        mediaType,
        isHero: r.id === heroAssetId,
        contextNote: (r.context_note as string | null) || null,
        description: (ai.description as string | null) || null,
        sceneType: (ai.scene_type as string | null) || null,
        detectedVendors: Array.isArray(ai.detected_vendors)
          ? (ai.detected_vendors as string[])
          : [],
        detectedPersonas: Array.isArray(ai.detected_personas)
          ? (ai.detected_personas as string[])
          : [],
        transcription: (r.transcription as string | null) || null,
        contentPillars: pillarsFromTags(tags, pillarConfig),
        contentTags: tags,
        taggedVendors: brandsByAsset.get(r.id as string) || [],
      };
    });
}

/**
 * Format a single asset's context as a prompt block. Caller composes
 * these into the prompt's "## Available assets" section.
 */
export function formatAssetBlock(a: AssetContext): string[] {
  const parts: string[] = [];
  parts.push(`### {{asset:${a.id}}}  (${a.kind}${a.isHero ? " — HERO" : ""})`);

  if (a.contextNote) parts.push(`  Caption from creator: "${a.contextNote}"`);
  if (a.description) parts.push(`  Visual: ${a.description}`);
  if (a.sceneType) parts.push(`  Scene type: ${a.sceneType}`);

  // Merge vendor sources — normalize to one canonical display per vendor.
  // ai_analysis.detected_vendors comes back snake_case ("crystal_cabinet_works")
  // while asset_brands.name is operator-tagged PascalCase ("Crystal Cabinet Works").
  // Without normalization the prompt sees both and treats them as distinct.
  // Strategy: tagged names win as the display form (operator authority);
  // detected-only names get title-cased from snake_case.
  const canonicalToDisplay = new Map<string, string>();
  const normalize = (n: string) => n.toLowerCase().replace(/[_\s-]+/g, " ").trim();
  for (const v of a.taggedVendors) {
    canonicalToDisplay.set(normalize(v.name), v.name);
  }
  for (const v of a.detectedVendors) {
    const key = normalize(v);
    if (canonicalToDisplay.has(key)) continue;
    // Title-case from snake_case ("crystal_cabinet_works" → "Crystal Cabinet Works")
    const titled = v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    canonicalToDisplay.set(key, titled);
  }
  if (canonicalToDisplay.size > 0) {
    parts.push(`  Vendors associated: ${Array.from(canonicalToDisplay.values()).join(", ")}`);
  }
  // Surface URLs separately when present so the LLM can naturally link
  const taggedWithUrls = a.taggedVendors.filter((v) => v.url);
  if (taggedWithUrls.length > 0) {
    parts.push(`  Vendor URLs: ${taggedWithUrls.map((v) => `${v.name} → ${v.url}`).join(" | ")}`);
  }

  if (a.detectedPersonas.length > 0) {
    parts.push(`  People visible: ${a.detectedPersonas.join(", ")}`);
  }
  if (a.transcription) parts.push(`  Transcription: ${a.transcription}`);
  if (a.contentTags.length > 0) parts.push(`  Tags: ${a.contentTags.join(", ")}`);
  if (a.contentPillars.length > 0) parts.push(`  Pillars: ${a.contentPillars.join(", ")}`);

  return parts;
}
