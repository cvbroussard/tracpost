/**
 * Instant Import — orchestrator.
 *
 * One-time pull of platform-side reference data into TracPost when a
 * platform_asset is first assigned to a site. Runs as part of the
 * pipeline cron alongside engagement capture. Per-asset gate via
 * platform_assets.imported_at IS NULL.
 *
 * Phase 1a: GBP profile only.
 * Phase 1b (future): IG/FB historical media → historical_posts table.
 */
import "server-only";
import { sql } from "@/lib/db";
import { importGbpProfile } from "./gbp-profile";
import { importInstagramMedia, importFacebookPosts, importGbpPhotos } from "./historical-media";

interface PendingImport {
  asset_id: string;
  platform: string;
  asset_name: string;
  platform_native_id: string;
  asset_metadata: Record<string, unknown>;
  access_token_encrypted: string;
  primary_site_id: string | null;
  subscription_id: string;
}

async function getPendingImports(): Promise<PendingImport[]> {
  const rows = await sql`
    SELECT pa.id AS asset_id, pa.platform, pa.asset_name,
           pa.asset_id AS platform_native_id, pa.metadata AS asset_metadata,
           sa.access_token_encrypted, sa.billing_account_id,
           (SELECT spa.business_id FROM business_platform_assets spa
            WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
            LIMIT 1) AS primary_site_id
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.imported_at IS NULL
      AND pa.health_status IN ('healthy', 'unknown')
      AND sa.status = 'active'
  `;
  return rows.map((r) => ({
    asset_id: r.asset_id as string,
    platform: r.platform as string,
    asset_name: r.asset_name as string,
    platform_native_id: r.platform_native_id as string,
    asset_metadata: (r.asset_metadata || {}) as Record<string, unknown>,
    access_token_encrypted: r.access_token_encrypted as string,
    primary_site_id: r.primary_site_id as string | null,
    subscription_id: r.subscription_id as string,
  }));
}

export async function runInstantImports(): Promise<{
  candidates: number;
  imported: number;
  skipped: number;
  errored: number;
  details: Array<{ asset_id: string; platform: string; outcome: string }>;
}> {
  const pending = await getPendingImports();
  let imported = 0, skipped = 0, errored = 0;
  const details: Array<{ asset_id: string; platform: string; outcome: string }> = [];

  for (const asset of pending) {
    const outcomes: string[] = [];
    let anyImported = false;

    // GBP: profile config + photos
    if (asset.platform === "gbp") {
      try {
        const profileResult = await importGbpProfile(asset);
        if (profileResult.imported) { anyImported = true; outcomes.push(`profile: ${(profileResult.fieldsWritten || []).join("+")}`); }
        else outcomes.push(`profile: ${profileResult.reason || "skipped"}`);
      } catch (err) {
        outcomes.push(`profile error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`GBP profile import failed for ${asset.asset_id}:`, err);
      }
      try {
        const photosResult = await importGbpPhotos(asset);
        if (photosResult.imported) { anyImported = true; outcomes.push(`photos: ${photosResult.count}`); }
        else outcomes.push(`photos: ${photosResult.reason || `0 (skipped ${photosResult.skipped || 0})`}`);
      } catch (err) {
        outcomes.push(`photos error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`GBP photos import failed for ${asset.asset_id}:`, err);
      }
    }

    // Instagram: historical media
    else if (asset.platform === "instagram") {
      try {
        const r = await importInstagramMedia(asset);
        if (r.imported) { anyImported = true; outcomes.push(`media: ${r.count}`); }
        else outcomes.push(`media: ${r.reason || `0 (skipped ${r.skipped || 0})`}`);
      } catch (err) {
        outcomes.push(`media error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`IG media import failed for ${asset.asset_id}:`, err);
      }
    }

    // Facebook: historical posts with media
    else if (asset.platform === "facebook") {
      try {
        const r = await importFacebookPosts(asset);
        if (r.imported) { anyImported = true; outcomes.push(`posts: ${r.count}`); }
        else outcomes.push(`posts: ${r.reason || `0 (skipped ${r.skipped || 0})`}`);
      } catch (err) {
        outcomes.push(`posts error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`FB posts import failed for ${asset.asset_id}:`, err);
      }
    }

    else {
      // LinkedIn (and any future un-wired platform): no importer exists.
      // Mark as imported so the asset doesn't sit perpetually in Pending.
      // Future Phase work that adds an importer will hit a separate
      // re-import flow rather than reusing imported_at.
      outcomes.push("no importer for this platform — marked complete");
      anyImported = true;
    }

    // Mark imported_at when at least one importer succeeded.
    // If everything errored or was skipped due to no site assignment, leave
    // it pending so a future cron retries when conditions change.
    if (anyImported) {
      try {
        await sql`UPDATE platform_assets SET imported_at = NOW() WHERE id = ${asset.asset_id}`;
        imported++;
      } catch (err) {
        errored++;
        console.error(`Failed to set imported_at for ${asset.asset_id}:`, err);
      }
    } else if (outcomes.some(o => o.includes("error"))) {
      errored++;
    } else {
      skipped++;
    }

    details.push({ asset_id: asset.asset_id, platform: asset.platform, outcome: outcomes.join(" · ") });
  }

  return { candidates: pending.length, imported, skipped, errored, details };
}
