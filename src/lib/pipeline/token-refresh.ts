import { sql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAdapter } from "./adapters/registry";

/**
 * Map an OAuth provider (social_accounts.platform) to the adapter key.
 * The adapter registry uses publishing-target keys ('facebook', 'gbp');
 * the social_accounts table now stores the OAuth provider for the new
 * platform_assets model ('meta', 'google').
 */
function adapterKeyFor(oauthProvider: string): string {
  if (oauthProvider === "google") return "gbp";
  if (oauthProvider === "meta") return "facebook"; // works for both FB+IG since they share Meta token
  return oauthProvider;
}

/**
 * Refresh tokens for all social accounts expiring within 7 days.
 * Uses the platform adapter to handle refresh logic per platform.
 */
export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const expiring = await sql`
    SELECT id, platform, access_token_encrypted, refresh_token_encrypted, account_name
    FROM social_accounts
    WHERE status = 'active'
      AND token_expires_at IS NOT NULL
      AND token_expires_at < ${sevenDaysFromNow}
  `;

  let refreshed = 0;
  let failed = 0;

  for (const account of expiring) {
    try {
      const adapter = getAdapter(adapterKeyFor(account.platform as string));
      if (!adapter) {
        console.error(`No adapter for platform ${account.platform}, skipping token refresh`);
        failed++;
        continue;
      }

      // Use refresh token if available (TikTok, Twitter, etc.), otherwise access token (Meta)
      const tokenForRefresh = decrypt(
        (account.refresh_token_encrypted || account.access_token_encrypted) as string
      );
      const { accessToken, expiresIn } = await adapter.refreshToken(tokenForRefresh);

      const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

      await sql`
        UPDATE social_accounts
        SET access_token_encrypted = ${encrypt(accessToken)},
            token_expires_at = ${newExpiry},
            updated_at = NOW()
        WHERE id = ${account.id}
      `;

      refreshed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Token refresh failed for ${account.account_name}: ${msg}`);

      // Mark account as needing re-auth
      await sql`
        UPDATE social_accounts
        SET status = 'token_expired', updated_at = NOW()
        WHERE id = ${account.id}
      `;

      failed++;
    }
  }

  return { refreshed, failed };
}

/**
 * Attempt to recover token_expired accounts using stored refresh tokens.
 * Called manually from admin or as part of site maintenance.
 *
 * Filters by site if siteId is provided. Includes accounts linked via
 * either the new platform_assets model OR the legacy site_social_links.
 */
export async function forceRefreshExpired(siteId?: string): Promise<{ recovered: number; failed: number }> {
  const expired = siteId
    ? await sql`
        SELECT DISTINCT sa.id, sa.platform, sa.access_token_encrypted, sa.refresh_token_encrypted, sa.account_name
        FROM social_accounts sa
        WHERE sa.status = 'token_expired'
          AND sa.refresh_token_encrypted IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM site_social_links ssl
              WHERE ssl.social_account_id = sa.id AND ssl.site_id = ${siteId}
            )
            OR EXISTS (
              SELECT 1 FROM site_platform_assets spa
              JOIN platform_assets pa ON pa.id = spa.platform_asset_id
              WHERE pa.social_account_id = sa.id AND spa.site_id = ${siteId}
            )
          )
      `
    : await sql`
        SELECT id, platform, access_token_encrypted, refresh_token_encrypted, account_name
        FROM social_accounts
        WHERE status = 'token_expired'
          AND refresh_token_encrypted IS NOT NULL
      `;

  let recovered = 0;
  let failed = 0;

  for (const account of expired) {
    try {
      const adapter = getAdapter(adapterKeyFor(account.platform as string));
      if (!adapter) { failed++; continue; }

      const refreshToken = decrypt(account.refresh_token_encrypted as string);
      const { accessToken, expiresIn } = await adapter.refreshToken(refreshToken);

      const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

      await sql`
        UPDATE social_accounts
        SET access_token_encrypted = ${encrypt(accessToken)},
            token_expires_at = ${newExpiry},
            status = 'active',
            updated_at = NOW()
        WHERE id = ${account.id}
      `;

      console.log(`Recovered ${account.platform} account: ${account.account_name}`);
      recovered++;
    } catch (err) {
      console.error(`Recovery failed for ${account.account_name} (${account.platform}): ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  return { recovered, failed };
}
