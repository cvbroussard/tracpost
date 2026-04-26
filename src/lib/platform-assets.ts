/**
 * Unified platform assets helper.
 *
 * Replaces the per-platform fragmentation where Facebook pages, Instagram
 * accounts, GBP locations, and LinkedIn organizations each had their own
 * storage pattern.
 *
 * New model:
 *   social_accounts        — one row per OAuth grant (the credential)
 *   platform_assets        — what that credential can access
 *   site_platform_assets   — explicit site → asset assignment
 */
import "server-only";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

export type AssetType =
  | "facebook_page"
  | "instagram_account"
  | "gbp_location"
  | "linkedin_organization"
  | "linkedin_person"
  | "youtube_channel"
  | "tiktok_account"
  | "twitter_account"
  | "pinterest_account";

export interface PlatformAsset {
  id: string;
  socialAccountId: string;
  platform: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  metadata: Record<string, unknown>;
}

/**
 * Record an OAuth grant. Creates or updates the social_accounts row that
 * holds the credential. Returns the social_account_id for use when
 * recording assets.
 *
 * Use platform = 'meta' (not 'facebook' or 'instagram') for the umbrella
 * Meta credential. Page-level and IG-level access lives in platform_assets.
 */
export async function recordOAuthGrant(args: {
  subscriptionId: string;
  platform: string; // 'meta' | 'google' | 'linkedin' | ...
  userIdentifier: string; // platform-native user ID (Meta user ID, Google sub, LinkedIn person URN)
  userDisplayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO timestamp
  scopes: string[];
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const refreshTokenEncrypted = args.refreshToken ? encrypt(args.refreshToken) : null;
  const [row] = await sql`
    INSERT INTO social_accounts (
      subscription_id, platform, account_name, account_id,
      access_token_encrypted, refresh_token_encrypted,
      token_expires_at, scopes, status, metadata
    )
    VALUES (
      ${args.subscriptionId}, ${args.platform},
      ${args.userDisplayName}, ${args.userIdentifier},
      ${encrypt(args.accessToken)}, ${refreshTokenEncrypted},
      ${args.expiresAt},
      ${"{" + args.scopes.join(",") + "}"},
      'active',
      ${JSON.stringify(args.metadata || {})}
    )
    ON CONFLICT (subscription_id, platform, account_id)
    DO UPDATE SET
      account_name = EXCLUDED.account_name,
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, social_accounts.refresh_token_encrypted),
      token_expires_at = EXCLUDED.token_expires_at,
      scopes = EXCLUDED.scopes,
      status = 'active',
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;
  return row.id as string;
}

/**
 * Record an asset (page, IG account, GBP location, etc.) accessible by
 * the given OAuth grant. Idempotent — re-running with the same asset_id
 * updates the existing row.
 */
export async function recordAsset(args: {
  socialAccountId: string;
  platform: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [row] = await sql`
    INSERT INTO platform_assets (
      social_account_id, platform, asset_type, asset_id, asset_name, metadata
    )
    VALUES (
      ${args.socialAccountId}, ${args.platform}, ${args.assetType},
      ${args.assetId}, ${args.assetName}, ${JSON.stringify(args.metadata || {})}
    )
    ON CONFLICT (social_account_id, platform, asset_type, asset_id)
    DO UPDATE SET
      asset_name = EXCLUDED.asset_name,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `;
  return row.id as string;
}

/**
 * Assign a site to a platform asset. Operator-driven action that says
 * "this site publishes to this Page" (or location, or channel).
 */
export async function assignSiteToAsset(args: {
  siteId: string;
  platformAssetId: string;
  isPrimary?: boolean;
}): Promise<void> {
  await sql`
    INSERT INTO site_platform_assets (site_id, platform_asset_id, is_primary)
    VALUES (${args.siteId}, ${args.platformAssetId}, ${args.isPrimary ?? true})
    ON CONFLICT (site_id, platform_asset_id)
    DO UPDATE SET is_primary = EXCLUDED.is_primary
  `;
}

/**
 * Unassign a site from a platform asset.
 */
export async function unassignSiteFromAsset(siteId: string, platformAssetId: string): Promise<void> {
  await sql`
    DELETE FROM site_platform_assets
    WHERE site_id = ${siteId} AND platform_asset_id = ${platformAssetId}
  `;
}

/**
 * List all assets the given OAuth grant can access. Used by the assignment
 * UI to show operators what they can pick from.
 */
export async function getAssetsForSocialAccount(socialAccountId: string): Promise<PlatformAsset[]> {
  const rows = await sql`
    SELECT id, social_account_id, platform, asset_type, asset_id, asset_name, metadata
    FROM platform_assets
    WHERE social_account_id = ${socialAccountId}
    ORDER BY platform, asset_type, asset_name
  `;
  return rows.map((r) => ({
    id: r.id as string,
    socialAccountId: r.social_account_id as string,
    platform: r.platform as string,
    assetType: r.asset_type as AssetType,
    assetId: r.asset_id as string,
    assetName: r.asset_name as string,
    metadata: (r.metadata || {}) as Record<string, unknown>,
  }));
}

/**
 * List assigned assets for a site, optionally filtered by platform.
 */
export async function getSiteAssets(siteId: string, platform?: string): Promise<Array<PlatformAsset & { isPrimary: boolean; socialAccountId: string }>> {
  const rows = platform
    ? await sql`
        SELECT pa.id, pa.social_account_id, pa.platform, pa.asset_type, pa.asset_id, pa.asset_name, pa.metadata,
               spa.is_primary
        FROM site_platform_assets spa
        JOIN platform_assets pa ON pa.id = spa.platform_asset_id
        WHERE spa.site_id = ${siteId} AND pa.platform = ${platform}
        ORDER BY spa.is_primary DESC, pa.asset_name
      `
    : await sql`
        SELECT pa.id, pa.social_account_id, pa.platform, pa.asset_type, pa.asset_id, pa.asset_name, pa.metadata,
               spa.is_primary
        FROM site_platform_assets spa
        JOIN platform_assets pa ON pa.id = spa.platform_asset_id
        WHERE spa.site_id = ${siteId}
        ORDER BY pa.platform, spa.is_primary DESC, pa.asset_name
      `;
  return rows.map((r) => ({
    id: r.id as string,
    socialAccountId: r.social_account_id as string,
    platform: r.platform as string,
    assetType: r.asset_type as AssetType,
    assetId: r.asset_id as string,
    assetName: r.asset_name as string,
    metadata: (r.metadata || {}) as Record<string, unknown>,
    isPrimary: !!r.is_primary,
  }));
}

/**
 * Get the primary asset for a site on a given platform. This is what the
 * publisher uses when it's about to push a post.
 */
export async function getPrimaryAssetForSitePlatform(siteId: string, platform: string): Promise<(PlatformAsset & { socialAccountId: string }) | null> {
  const [row] = await sql`
    SELECT pa.id, pa.social_account_id, pa.platform, pa.asset_type, pa.asset_id, pa.asset_name, pa.metadata
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    WHERE spa.site_id = ${siteId} AND pa.platform = ${platform} AND spa.is_primary = true
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    socialAccountId: row.social_account_id as string,
    platform: row.platform as string,
    assetType: row.asset_type as AssetType,
    assetId: row.asset_id as string,
    assetName: row.asset_name as string,
    metadata: (row.metadata || {}) as Record<string, unknown>,
  };
}
