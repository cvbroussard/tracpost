/**
 * Platform asset health checks.
 *
 * For each platform_asset, validate:
 *   1. Parent token is still valid at the OAuth provider
 *   2. Token still has permission for this specific asset
 *   3. Asset itself is still reachable on the platform
 *
 * Updates platform_assets.health_status and platform_assets.health_error.
 *
 * Run via cron (proactive) or before-publish (reactive).
 */
import "server-only";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export type HealthStatus = "healthy" | "permission_lost" | "token_expired" | "unreachable" | "unknown";

interface HealthCheckResult {
  status: HealthStatus;
  error?: string;
}

interface AssetWithToken {
  id: string;
  platform: string;
  asset_type: string;
  asset_id: string;
  asset_name: string;
  metadata: Record<string, unknown>;
  social_account_id: string;
  oauth_provider: string;
  access_token_encrypted: string;
  account_status: string;
}

/**
 * Check a single Meta platform_asset (Facebook page or Instagram account).
 */
async function checkMetaAsset(asset: AssetWithToken): Promise<HealthCheckResult> {
  const userToken = decrypt(asset.access_token_encrypted);
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return { status: "unknown", error: "Meta app credentials not configured" };
  const appToken = `${appId}|${appSecret}`;

  // Step 1: validate parent token
  const dbgRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  const dbgData = await dbgRes.json();
  const tokenInfo = dbgData.data || {};

  if (!tokenInfo.is_valid) {
    return { status: "token_expired", error: tokenInfo.error?.message || "Token invalid" };
  }

  // Step 2: check granular_scopes for this asset's id
  const granularScopes = (tokenInfo.granular_scopes || []) as Array<{ scope: string; target_ids?: string[] }>;
  const requiredScope = asset.platform === "instagram" ? "instagram_content_publish" : "pages_manage_posts";
  const matchingScope = granularScopes.find((s) => s.scope === requiredScope);

  if (!matchingScope) {
    return { status: "permission_lost", error: `Token has no ${requiredScope} permission` };
  }
  // Meta returns target_ids only when the user selected specific assets.
  // When the user opted in to "all current and future" assets, target_ids
  // is omitted — meaning the permission applies to everything the user can access.
  // Absence of target_ids = broader grant, NOT a permission loss.
  if (matchingScope.target_ids && !matchingScope.target_ids.includes(asset.asset_id)) {
    return { status: "permission_lost", error: `Asset ${asset.asset_id} not in ${requiredScope} target_ids` };
  }

  // Step 3: live fetch — does the asset still exist?
  const pageToken = (asset.metadata?.page_access_token as string) || userToken;
  const liveRes = await fetch(
    `https://graph.facebook.com/v23.0/${asset.asset_id}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
  );
  if (!liveRes.ok) {
    const errBody = await liveRes.json().catch(() => ({}));
    return { status: "unreachable", error: errBody.error?.message || `HTTP ${liveRes.status}` };
  }

  return { status: "healthy" };
}

/**
 * Check a single GBP location asset.
 */
async function checkGbpAsset(asset: AssetWithToken): Promise<HealthCheckResult> {
  const accessToken = decrypt(asset.access_token_encrypted);
  const accountId = (asset.metadata?.accountId as string) || (asset.metadata?.account_id as string) || "";
  const locationPart = asset.asset_id.startsWith("locations/") ? asset.asset_id : `locations/${asset.asset_id}`;
  const path = accountId ? `${accountId}/${locationPart}` : locationPart;

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${path}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 401) {
    return { status: "token_expired", error: "Google token unauthorized" };
  }
  if (res.status === 403) {
    return { status: "permission_lost", error: "Token lacks permission for this location" };
  }
  if (res.status === 404) {
    return { status: "unreachable", error: "Location not found" };
  }
  if (!res.ok) {
    const errText = await res.text();
    return { status: "unknown", error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }

  return { status: "healthy" };
}

/**
 * Check a single LinkedIn asset (organization or personal profile).
 * For now we just verify the token is still valid via /v2/userinfo.
 */
async function checkLinkedInAsset(asset: AssetWithToken): Promise<HealthCheckResult> {
  const token = decrypt(asset.access_token_encrypted);
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return { status: "token_expired", error: "LinkedIn token expired" };
  if (!res.ok) return { status: "unknown", error: `HTTP ${res.status}` };
  return { status: "healthy" };
}

/**
 * Run health check for one asset based on its platform.
 */
async function checkAsset(asset: AssetWithToken): Promise<HealthCheckResult> {
  // If the parent token is already known-bad, short-circuit.
  if (asset.account_status === "token_expired" || asset.account_status === "token_revoked") {
    return { status: "token_expired", error: `Parent token status: ${asset.account_status}` };
  }

  if (asset.platform === "facebook" || asset.platform === "instagram") {
    return checkMetaAsset(asset);
  }
  if (asset.platform === "gbp") {
    return checkGbpAsset(asset);
  }
  if (asset.platform === "linkedin") {
    return checkLinkedInAsset(asset);
  }
  return { status: "unknown", error: `No health checker for platform: ${asset.platform}` };
}

/**
 * Run health checks against all platform_assets.
 * Returns a summary: count by status.
 */
export async function checkAllAssetHealth(): Promise<Record<HealthStatus, number>> {
  const assets = await sql`
    SELECT pa.id, pa.platform, pa.asset_type, pa.asset_id, pa.asset_name, pa.metadata,
           sa.id AS social_account_id, sa.platform AS oauth_provider,
           sa.access_token_encrypted, sa.status AS account_status
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
  `;

  const summary: Record<HealthStatus, number> = {
    healthy: 0,
    permission_lost: 0,
    token_expired: 0,
    unreachable: 0,
    unknown: 0,
  };

  for (const row of assets) {
    const asset: AssetWithToken = {
      id: row.id as string,
      platform: row.platform as string,
      asset_type: row.asset_type as string,
      asset_id: row.asset_id as string,
      asset_name: row.asset_name as string,
      metadata: (row.metadata || {}) as Record<string, unknown>,
      social_account_id: row.social_account_id as string,
      oauth_provider: row.oauth_provider as string,
      access_token_encrypted: row.access_token_encrypted as string,
      account_status: row.account_status as string,
    };

    let result: HealthCheckResult;
    try {
      result = await checkAsset(asset);
    } catch (err) {
      result = {
        status: "unknown",
        error: err instanceof Error ? err.message : "Check threw exception",
      };
    }

    summary[result.status]++;

    await sql`
      UPDATE platform_assets
      SET health_status = ${result.status},
          health_checked_at = NOW(),
          health_error = ${result.error || null}
      WHERE id = ${asset.id}
    `;
  }

  return summary;
}

/**
 * Get health for a single asset (used in pre-publish validation).
 */
export async function checkAndUpdateAssetHealth(platformAssetId: string): Promise<HealthCheckResult> {
  const [row] = await sql`
    SELECT pa.id, pa.platform, pa.asset_type, pa.asset_id, pa.asset_name, pa.metadata,
           sa.id AS social_account_id, sa.platform AS oauth_provider,
           sa.access_token_encrypted, sa.status AS account_status
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.id = ${platformAssetId}
  `;
  if (!row) return { status: "unknown", error: "Asset not found" };

  const asset: AssetWithToken = {
    id: row.id as string,
    platform: row.platform as string,
    asset_type: row.asset_type as string,
    asset_id: row.asset_id as string,
    asset_name: row.asset_name as string,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    social_account_id: row.social_account_id as string,
    oauth_provider: row.oauth_provider as string,
    access_token_encrypted: row.access_token_encrypted as string,
    account_status: row.account_status as string,
  };

  let result: HealthCheckResult;
  try {
    result = await checkAsset(asset);
  } catch (err) {
    result = {
      status: "unknown",
      error: err instanceof Error ? err.message : "Check threw exception",
    };
  }

  await sql`
    UPDATE platform_assets
    SET health_status = ${result.status},
        health_checked_at = NOW(),
        health_error = ${result.error || null}
    WHERE id = ${platformAssetId}
  `;

  return result;
}
