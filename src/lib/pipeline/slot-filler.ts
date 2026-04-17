import { sql } from "@/lib/db";
import type { AutopilotConfig } from "./types";

/**
 * Fill open publishing slots with the best available triaged assets.
 *
 * For each open slot:
 * 1. Find the highest-quality triaged asset matching the slot's
 *    content_pillar and platform_fit
 * 2. Create a social_post linked to the asset and slot
 * 3. Update the asset to "scheduled" and the slot to "filled"
 *
 * Falls back to shelf inventory when no triaged assets available
 * (if backfill_from_shelf is enabled).
 */
export async function fillSlots(siteId: string): Promise<number> {
  // Fetch site config
  const [site] = await sql`
    SELECT autopilot_config
    FROM sites
    WHERE id = ${siteId} AND autopilot_enabled = true
  `;

  if (!site) return 0;

  const config = (site.autopilot_config || {}) as AutopilotConfig;

  // Get all open slots ordered by scheduled_at (fill nearest first)
  const openSlots = await sql`
    SELECT id, account_id, platform, content_pillar, scheduled_at
    FROM publishing_slots
    WHERE site_id = ${siteId}
      AND status = 'open'
      AND scheduled_at > NOW()
    ORDER BY scheduled_at ASC
  `;

  let filled = 0;

  for (const slot of openSlots) {
    // Find best matching asset: triaged first, then shelved if backfill enabled
    const statusFilter = config.backfill_from_shelf
      ? ["triaged", "shelved"]
      : ["triaged"];

    let asset = null;

    for (const status of statusFilter) {
      // Match on pillar if slot has one, otherwise any pillar
      const pillarClause = slot.content_pillar
        ? sql`AND content_pillar = ${slot.content_pillar}`
        : sql``;

      const candidates = await sql`
        SELECT id, storage_url, media_type, quality_score, content_pillar, ai_analysis, variants
        FROM media_assets
        WHERE site_id = ${siteId}
          AND triage_status = ${status}
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

    // Create the social post (caption will be generated in a separate step)
    const [post] = await sql`
      INSERT INTO social_posts (
        account_id, source_asset_id, status, authority,
        content_pillar, media_urls, media_type,
        scheduled_at, ai_generated, slot_id
      )
      VALUES (
        ${slot.account_id}, ${asset.id}, 'scheduled', 'pipeline',
        ${asset.content_pillar}, ARRAY[${mediaUrl}], ${asset.media_type},
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

    // Update asset → scheduled
    await sql`
      UPDATE media_assets
      SET triage_status = 'scheduled'
      WHERE id = ${asset.id}
    `;

    // Log in post history
    await sql`
      INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
      VALUES (${post.id}, 'slot_fill', NULL, 'scheduled', ${'Pipeline auto-fill from slot ' + slot.id})
    `;

    filled++;
  }

  return filled;
}
