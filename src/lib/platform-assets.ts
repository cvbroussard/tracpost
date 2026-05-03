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
  | "pinterest_account"
  | "meta_ad_account";

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
 * Resolve all publishable targets for a site, unified across the new
 * platform_assets model and legacy site_social_links. Returns one entry
 * per platform. Used by the autopilot publisher.
 *
 * Each target is either:
 *   - source: 'asset'  — from site_platform_assets (new model)
 *   - source: 'legacy' — from site_social_links (old model)
 *
 * The returned shape gives the publisher everything it needs:
 *   - The token to authenticate with (decrypt-ready)
 *   - The platform-native account ID to publish to (Page ID, IG user ID, etc.)
 *   - Any platform-specific metadata (page_access_token for FB, person_urn for LI, etc.)
 */
export interface PublishTarget {
  source: "asset" | "legacy";
  platform: string;
  socialAccountId: string;
  /** Encrypted access token from social_accounts. Caller must decrypt. */
  accessTokenEncrypted: string;
  /** The platform-native ID to publish to (Page ID, IG user ID, location ID, etc.) */
  platformAccountId: string;
  /** Display name for logs/UI */
  accountName: string;
  /** Asset-level metadata (e.g., page_access_token for FB pages) merged with social_accounts metadata */
  metadata: Record<string, unknown>;
  /** The social_post.account_id FK target. For new model, this is the platform_asset id surrogate. */
  postAccountId: string;
}

export async function resolvePublishTargets(siteId: string): Promise<PublishTarget[]> {
  // 1. New model: assigned platform_assets
  const newRows = await sql`
    SELECT pa.id AS platform_asset_id, pa.platform, pa.asset_id, pa.asset_name,
           pa.metadata AS asset_metadata,
           sa.id AS social_account_id, sa.access_token_encrypted,
           sa.metadata AS account_metadata, sa.status
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${siteId}
      AND spa.is_primary = true
      AND sa.status = 'active'
  `;

  const targets: PublishTarget[] = newRows.map((r) => ({
    source: "asset" as const,
    platform: r.platform as string,
    socialAccountId: r.social_account_id as string,
    accessTokenEncrypted: r.access_token_encrypted as string,
    platformAccountId: r.asset_id as string,
    accountName: r.asset_name as string,
    metadata: {
      ...(r.account_metadata || {}),
      ...(r.asset_metadata || {}),
    } as Record<string, unknown>,
    // Use social_account_id as the FK target — the legacy social_posts.account_id
    // expects social_accounts.id. For new-model publishing, we still write
    // social_posts.account_id = social_accounts.id but the asset metadata
    // tells the publisher exactly which page/IG to post to.
    postAccountId: r.social_account_id as string,
  }));

  const claimedPlatforms = new Set(targets.map((t) => t.platform));

  // 2. Legacy fallback: site_social_links rows for platforms not yet migrated
  const legacyRows = await sql`
    SELECT sa.id AS social_account_id, sa.platform, sa.account_id AS platform_account_id,
           sa.account_name, sa.access_token_encrypted, sa.metadata AS account_metadata,
           sa.status
    FROM site_social_links ssl
    JOIN social_accounts sa ON sa.id = ssl.social_account_id
    WHERE ssl.site_id = ${siteId}
      AND sa.status = 'active'
  `;

  for (const r of legacyRows) {
    const platform = r.platform as string;
    if (claimedPlatforms.has(platform)) continue;
    targets.push({
      source: "legacy" as const,
      platform,
      socialAccountId: r.social_account_id as string,
      accessTokenEncrypted: r.access_token_encrypted as string,
      platformAccountId: r.platform_account_id as string,
      accountName: r.account_name as string,
      metadata: (r.account_metadata || {}) as Record<string, unknown>,
      postAccountId: r.social_account_id as string,
    });
  }

  return targets;
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
