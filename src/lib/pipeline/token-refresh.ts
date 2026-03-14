import { sql } from "@/lib/db";
import { refreshLongLivedToken } from "@/lib/meta";

/**
 * Refresh tokens for all social accounts expiring within 7 days.
 * Called by the cron pipeline to keep tokens alive without
 * subscriber intervention.
 */
export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const expiring = await sql`
    SELECT id, platform, access_token_encrypted, account_name
    FROM social_accounts
    WHERE status = 'active'
      AND token_expires_at IS NOT NULL
      AND token_expires_at < ${sevenDaysFromNow}
  `;

  let refreshed = 0;
  let failed = 0;

  for (const account of expiring) {
    try {
      if (account.platform === "instagram") {
        const { accessToken, expiresIn } = await refreshLongLivedToken(
          account.access_token_encrypted // TODO: decrypt
        );

        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        await sql`
          UPDATE social_accounts
          SET access_token_encrypted = ${accessToken},
              token_expires_at = ${newExpiry},
              updated_at = NOW()
          WHERE id = ${account.id}
        `;

        refreshed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Token refresh failed for ${account.account_name}: ${msg}`);

      // Mark account as needing re-auth if refresh fails
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
