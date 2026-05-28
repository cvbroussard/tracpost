import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";
import { generateSuggestedReply } from "@/lib/inbox/ai-response";
import type { FetchReviewsInput } from "@/lib/pipeline/adapters/types";

/**
 * Sync reviews for all social accounts linked to a site.
 * Auto-drafts AI replies for new reviews (curtain model).
 * Returns the number of new reviews added.
 */
export async function syncReviews(siteId: string): Promise<number> {
  const accounts = await sql`
    SELECT sa.id, sa.billing_account_id, sa.platform, sa.account_id,
           sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId} AND sa.status = 'active'
  `;

  // Load site context once for auto-drafting
  const [site] = await sql`
    SELECT name, brand_voice, brand_playbook FROM businesses WHERE id = ${siteId}
  `;

  let totalAdded = 0;
  const newReviewIds: { id: string; body: string | null; rating: number | null; reviewerName: string }[] = [];

  for (const account of accounts) {
    const adapter = getAdapter(account.platform);
    if (!adapter?.fetchReviews) continue;

    const accessToken = decrypt(account.access_token_encrypted as string);

    try {
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
            billing_account_id, business_id, social_account_id,
            platform, platform_review_id,
            reviewer_name, reviewer_avatar_url,
            rating, body, reviewed_at, raw_data,
            reply_status
          )
          VALUES (
            ${account.subscription_id}, ${siteId}, ${account.id},
            ${account.platform}, ${review.platformReviewId},
            ${review.reviewerName}, ${review.reviewerAvatarUrl || null},
            ${review.rating}, ${review.body}, ${review.reviewedAt},
            ${JSON.stringify(review.rawData || {})},
            'needs_reply'
          )
          ON CONFLICT (platform, platform_review_id) DO NOTHING
          RETURNING id
        `;
        if (inserted) {
          totalAdded++;
          newReviewIds.push({
            id: inserted.id,
            body: review.body,
            rating: review.rating,
            reviewerName: review.reviewerName,
          });
        }
      }

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

  // Auto-draft replies for new reviews (5 at a time)
  if (newReviewIds.length > 0 && site) {
    for (let i = 0; i < newReviewIds.length; i += 5) {
      const batch = newReviewIds.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (review) => {
          try {
            const suggestion = await generateSuggestedReply({
              reviewBody: review.body,
              rating: review.rating,
              reviewerName: review.reviewerName,
              siteName: site.name,
              brandVoice: site.brand_voice as Record<string, unknown> | null,
              brandPlaybook: site.brand_playbook as Record<string, unknown> | null,
            });
            await sql`
              UPDATE inbox_reviews
              SET suggested_reply = ${suggestion},
                  suggested_reply_at = NOW(),
                  reply_status = 'draft_ready',
                  auto_drafted = true
              WHERE id = ${review.id}
            `;
          } catch (err) {
            console.error(`Auto-draft failed for review ${review.id}:`, err instanceof Error ? err.message : err);
          }
        })
      );
    }
  }

  return totalAdded;
}
