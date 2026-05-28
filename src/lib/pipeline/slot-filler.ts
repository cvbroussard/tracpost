import { sql } from "@/lib/db";
import type { AutopilotConfig } from "./types";
import { primaryPillarFromTags, type PillarConfig } from "@/lib/pillars";

/**
 * Fill open publishing slots with the best available analyzed assets.
 *
 * For each open slot:
 * 1. Find the highest-quality analyzed asset matching the slot's
 *    content_pillar and platform_fit
 * 2. Create a social_post linked to the asset and slot
 * 3. Mark the slot "filled" (asset processing stage is unchanged)
 */
export async function fillSlots(siteId: string): Promise<number> {
  // Fetch site config + pillar_config (LOCKED 2026-05-09 — pillar
  // membership is derived at read time from content_tags, so we need the
  // tag-to-pillar map for both the pillar filter and the post-write
  // derivation).
  const [site] = await sql`
    SELECT autopilot_config, pillar_config
    FROM businesses
    WHERE id = ${siteId} AND autopilot_enabled = true
  `;

  if (!site) return 0;

  const config = (site.autopilot_config || {}) as AutopilotConfig;
  const pillarConfig = (site.pillar_config || []) as PillarConfig;

  // Get all open slots ordered by scheduled_at (fill nearest first)
  const openSlots = await sql`
    SELECT id, account_id, platform, content_pillar, scheduled_at
    FROM publishing_slots
    WHERE business_id = ${siteId}
      AND status = 'open'
      AND scheduled_at > NOW()
    ORDER BY scheduled_at ASC
  `;

  let filled = 0;

  for (const slot of openSlots) {
    // Find best matching asset: analyzed assets are the consumable pool.
    const statusFilter = ["analyzed"];

    let asset = null;

    // Pillar filter: instead of matching the legacy ma.content_pillar
    // column (LOCKED 2026-05-09 — gone), filter by tag-overlap. Resolve
    // the slot's required pillar to its tag IDs via pillarConfig, then
    // require asset.content_tags to overlap with that set.
    const slotPillarTagIds = slot.content_pillar
      ? (pillarConfig.find((p) => p.id === slot.content_pillar)?.tags.map((t) => t.id) || [])
      : null;

    for (const status of statusFilter) {
      const pillarClause = slotPillarTagIds && slotPillarTagIds.length > 0
        ? sql`AND content_tags && ${slotPillarTagIds}::text[]`
        : sql``;

      const candidates = await sql`
        SELECT id, storage_url, media_type, quality_score, content_tags, ai_analysis, variants
        FROM media_assets
        WHERE business_id = ${siteId}
          AND processing_stage = ${status}
          AND quality_score >= ${config.min_quality || 0.4}
          AND ${slot.platform} = ANY(platform_fit)
          ${pillarClause}
        ORDER BY quality_score DESC, created_at DESC
        LIMIT 1
      `;

      if (candidates.length > 0) {
        asset = candidates[0];
        break;
      }
    }

    if (!asset) {
      // No inventory — skip this slot
      await sql`
        UPDATE publishing_slots
        SET status = 'skipped'
        WHERE id = ${slot.id}
      `;
      continue;
    }

    // Use rendered variant URL if available, else fall back to source
    const variants = (asset.variants as Record<string, { url: string }>) || {};
    const platformKey = String(slot.platform).toLowerCase();
    const mediaUrl = variants[platformKey]?.url || String(asset.storage_url);

    // Create the social post. social_posts.content_pillar (different
    // table — kept) gets the asset's derived primary pillar at the moment
    // of slotting. Subscriber tag edits after this are reflected in fresh
    // queries; this captured value is a snapshot.
    const derivedPillar = primaryPillarFromTags(
      (asset.content_tags as string[] | null) || null,
      pillarConfig,
    );
    const [post] = await sql`
      INSERT INTO social_posts (
        account_id, source_asset_id, status, authority,
        content_pillar, media_urls, media_type,
        scheduled_at, ai_generated, slot_id
      )
      VALUES (
        ${slot.account_id}, ${asset.id}, 'scheduled', 'pipeline',
        ${derivedPillar}, ARRAY[${mediaUrl}], ${asset.media_type},
        ${slot.scheduled_at}, true, ${slot.id}
      )
      RETURNING id
    `;

    // Update slot → filled
    await sql`
      UPDATE publishing_slots
      SET status = 'filled', post_id = ${post.id}, asset_id = ${asset.id}
      WHERE id = ${slot.id}
    `;

    // Asset utilization is no longer a processing_stage — slotting an asset
    // does not mutate its processing stage.

    // Log in post history
    await sql`
      INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
      VALUES (${post.id}, 'slot_fill', NULL, 'scheduled', ${'Pipeline auto-fill from slot ' + slot.id})
    `;

    filled++;
  }

  return filled;
}
