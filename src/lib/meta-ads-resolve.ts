/**
 * Helper: resolve which ad account to use for a Marketing API operation.
 *
 * - If platformAssetId is provided, use that specific account (after
 *   verifying it belongs to the subscription's grants).
 * - Otherwise fall back to the primary ad account assigned to the
 *   active Business via site_platform_assets.
 *
 * Returns { adAccountId, accessToken } or null if nothing found.
 */
import "server-only";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export interface ResolvedAdAccount {
  adAccountId: string;     // act_xxx form, ready for Marketing API
  accessToken: string;     // decrypted, ready to pass to Marketing API
}

export async function resolveAdAccount(args: {
  subscriptionId: string;
  activeSiteId: string;
  platformAssetId?: string | null;
}): Promise<ResolvedAdAccount | null> {
  if (args.platformAssetId) {
    const rows = await sql`
      SELECT pa.asset_id, sa.access_token_encrypted
      FROM platform_assets pa
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE pa.id = ${args.platformAssetId}
        AND pa.asset_type = 'meta_ad_account'
        AND sa.subscription_id = ${args.subscriptionId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      adAccountId: rows[0].asset_id as string,
      accessToken: decrypt(rows[0].access_token_encrypted as string),
    };
  }

  // Fall back to primary assigned to the active Business
  const rows = await sql`
    SELECT pa.asset_id, sa.access_token_encrypted
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${args.activeSiteId}
      AND pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${args.subscriptionId}
    ORDER BY spa.is_primary DESC, pa.created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    adAccountId: rows[0].asset_id as string,
    accessToken: decrypt(rows[0].access_token_encrypted as string),
  };
}
