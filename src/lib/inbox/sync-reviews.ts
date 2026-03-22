import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";
import type { FetchReviewsInput } from "@/lib/pipeline/adapters/types";

/**
 * Sync reviews for all social accounts linked to a site.
 * Returns the number of new reviews added.
 */
export async function syncReviews(siteId: string): Promise<number> {
  // Get all active social accounts for this site that have an adapter with fetchReviews
  const accounts = await sql`
    SELECT sa.id, sa.subscriber_id, sa.platform, sa.account_id,
           sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
  `;

  let totalAdded = 0;

  for (const account of accounts) {
    const adapter = getAdapter(account.platform);
    if (!adapter?.fetchReviews) continue;

    const accessToken = decrypt(account.access_token_encrypted as string);

    try {
      // Get cursor
      const [cursor] = await sql`
        SELECT cursor_value FROM inbox_sync_cursors
        WHERE social_account_id = ${account.id} AND content_type = 'reviews'
      `;

      const input: FetchReviewsInput = {
        platformAccountId: account.account_id,
        accessToken,
        cursor: cursor?.cursor_value || undefined,
        accountMetadata: account.metadata as Record<string, unknown>,
      };

      const { reviews, nextCursor } = await adapter.fetchReviews(input);

      for (const review of reviews) {
        const [inserted] = await sql`
          INSERT INTO inbox_reviews (
            subscriber_id, site_id, social_account_id,
            platform, platform_review_id,
            reviewer_name, reviewer_avatar_url,
            rating, body, reviewed_at, raw_data
          )
          VALUES (
            ${account.subscriber_id}, ${siteId}, ${account.id},
            ${account.platform}, ${review.platformReviewId},
            ${review.reviewerName}, ${review.reviewerAvatarUrl || null},
            ${review.rating}, ${review.body}, ${review.reviewedAt},
            ${JSON.stringify(review.rawData || {})}
          )
          ON CONFLICT (platform, platform_review_id) DO NOTHING
          RETURNING id
        `;
        if (inserted) totalAdded++;
      }

      // Update cursor
      if (nextCursor) {
        await sql`
          INSERT INTO inbox_sync_cursors (social_account_id, content_type, cursor_value, last_synced_at)
          VALUES (${account.id}, 'reviews', ${nextCursor}, NOW())
          ON CONFLICT (social_account_id, content_type)
          DO UPDATE SET cursor_value = EXCLUDED.cursor_value, last_synced_at = NOW()
        `;
      }
    } catch (err) {
      console.error(`Review sync error (${account.platform}/${account.account_id}):`, err instanceof Error ? err.message : err);
    }
  }

  return totalAdded;
}
