import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";
import type { FetchCommentsInput } from "@/lib/pipeline/adapters/types";

const MAX_POSTS_PER_SYNC = 20;

/**
 * Sync comments for all social accounts linked to a site.
 * Returns the number of new comments added.
 */
export async function syncComments(siteId: string): Promise<number> {
  // Get all active social accounts for this site that have an adapter with fetchComments
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
    if (!adapter?.fetchComments) continue;

    const accessToken = decrypt(account.access_token_encrypted as string);

    // Get recent published posts for this account
    const posts = await sql`
      SELECT id, platform_post_id
      FROM social_posts
      WHERE account_id = ${account.id}
        AND status = 'published'
        AND platform_post_id IS NOT NULL
        AND published_at > NOW() - INTERVAL '30 days'
      ORDER BY published_at DESC
      LIMIT ${MAX_POSTS_PER_SYNC}
    `;

    for (const post of posts) {
      try {
        // Get cursor for this post
        const [cursor] = await sql`
          SELECT cursor_value FROM inbox_sync_cursors
          WHERE social_account_id = ${account.id} AND content_type = ${"comments:" + post.platform_post_id}
        `;

        const input: FetchCommentsInput = {
          platformAccountId: account.account_id,
          accessToken,
          platformPostId: post.platform_post_id,
          since: cursor?.cursor_value || undefined,
          accountMetadata: account.metadata as Record<string, unknown>,
        };

        const comments = await adapter.fetchComments(input);

        for (const comment of comments) {
          const [inserted] = await sql`
            INSERT INTO inbox_comments (
              subscriber_id, site_id, social_account_id, post_id,
              platform, platform_post_id, platform_comment_id,
              author_name, author_username, author_avatar_url, author_platform_id,
              body, commented_at, raw_data
            )
            VALUES (
              ${account.subscriber_id}, ${siteId}, ${account.id}, ${post.id},
              ${account.platform}, ${post.platform_post_id}, ${comment.platformCommentId},
              ${comment.authorName}, ${comment.authorUsername || null}, ${comment.authorAvatarUrl || null}, ${comment.authorPlatformId || null},
              ${comment.body}, ${comment.commentedAt}, ${JSON.stringify(comment.rawData || {})}
            )
            ON CONFLICT (platform, platform_comment_id) DO NOTHING
            RETURNING id
          `;
          if (inserted) totalAdded++;
        }

        // Update cursor to latest comment timestamp
        if (comments.length > 0) {
          const latestTimestamp = comments
            .map((c) => new Date(c.commentedAt).getTime())
            .reduce((a, b) => Math.max(a, b), 0);
          const cursorKey = "comments:" + post.platform_post_id;

          await sql`
            INSERT INTO inbox_sync_cursors (social_account_id, content_type, cursor_value, last_synced_at)
            VALUES (${account.id}, ${cursorKey}, ${new Date(latestTimestamp).toISOString()}, NOW())
            ON CONFLICT (social_account_id, content_type)
            DO UPDATE SET cursor_value = EXCLUDED.cursor_value, last_synced_at = NOW()
          `;
        }
      } catch (err) {
        console.error(`Comment sync error (${account.platform}/${post.platform_post_id}):`, err instanceof Error ? err.message : err);
      }
    }
  }

  return totalAdded;
}
