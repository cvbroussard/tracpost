import { sql } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Resolve GBP API credentials for a site from the unified
 * connection-machinery tables.
 *
 *   platform_assets + site_platform_assets — written by /manage/connections
 *   gbp_credentials — OAuth token store, keyed on site_id
 *
 * Returns the validated access token (refreshing on the fly if expired)
 * plus the locationPath the v1 Business Information API expects
 * ("locations/{id}") and the platform_assets row id for traceability.
 *
 * The legacy social_accounts/site_social_links path is no longer the
 * source of truth for GBP — every GBP reader must use this function.
 */
export async function getGbpCredentials(siteId: string): Promise<{
  accessToken: string;
  /** v1 Business Information API path — "locations/{id}" */
  locationPath: string;
  /** v4 My Business API account prefix — "accounts/{id}" — needed for
   *  photos, reviews, and other v4 endpoints. Null if metadata.accountId
   *  is missing (older platform_assets rows). */
  gbpAccountId: string | null;
  /** Composes the full v4 path "accounts/{id}/locations/{id}" or falls
   *  back to v1 path if accountId is missing. */
  v4LocationPath: string;
  /** platform_assets row id — for traceability/joins */
  assetRowId: string;
} | null> {
  const [row] = await sql`
    SELECT pa.id AS asset_row_id, pa.asset_id, pa.metadata AS asset_metadata,
           gc.id AS cred_id, gc.access_token, gc.refresh_token, gc.token_expires_at
    FROM platform_assets pa
    JOIN site_platform_assets spa ON spa.platform_asset_id = pa.id
    JOIN gbp_credentials gc ON gc.site_id = spa.site_id AND gc.is_active = true
    WHERE spa.site_id = ${siteId}
      AND pa.platform = 'gbp'
      AND pa.asset_type = 'gbp_location'
      AND spa.is_primary = true
    LIMIT 1
  `;

  if (!row) return null;

  // Refresh the access_token if it's expired or about to be (60s buffer).
  // Google access tokens last ~1 hour; refresh_token is long-lived.
  const expiresAt = new Date(row.token_expires_at as string).getTime();
  const needsRefresh = expiresAt - Date.now() < 60_000;
  let accessToken: string;
  if (needsRefresh && row.refresh_token) {
    try {
      const { refreshGoogleToken } = await import("@/lib/google");
      const refreshToken = decrypt(row.refresh_token as string);
      const refreshed = await refreshGoogleToken(refreshToken);
      const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn - 60) * 1000);
      await sql`
        UPDATE gbp_credentials
        SET access_token = ${encrypt(refreshed.accessToken)},
            token_expires_at = ${newExpiresAt.toISOString()},
            updated_at = NOW()
        WHERE id = ${row.cred_id}
      `;
      accessToken = refreshed.accessToken;
    } catch (err) {
      console.warn("GBP token refresh failed:", err instanceof Error ? err.message : err);
      return null;
    }
  } else {
    accessToken = decrypt(row.access_token as string);
  }

  // v1 Business Information API uses "locations/{id}" — platform_assets.asset_id
  // already stores this format.
  const locationPath = row.asset_id as string;
  const assetMetadata = (row.asset_metadata || {}) as Record<string, unknown>;
  const gbpAccountId = (assetMetadata.accountId as string) || null;
  const v4LocationPath = gbpAccountId
    ? `${gbpAccountId}/${locationPath}`
    : locationPath;

  return {
    accessToken,
    locationPath,
    gbpAccountId,
    v4LocationPath,
    assetRowId: row.asset_row_id as string,
  };
}
