import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "./adapters/registry";
import { socialPostLink } from "@/lib/utm";

/**
 * Publish a scheduled social post to its target platform via adapter.
 *
 * The adapter is selected by the `platform` field on social_accounts.
 * Posts must have a caption and at least one media URL.
 */
export async function publishPost(postId: string): Promise<{ success: boolean; error?: string }> {
  const [post] = await sql`
    SELECT sp.id, sp.caption, sp.hashtags, sp.media_urls, sp.media_type,
           sp.link_url, sp.slot_id,
           sa.platform, sa.account_id AS platform_account_id,
           sa.access_token_encrypted, sa.metadata AS account_metadata
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sp.id = ${postId} AND sp.status = 'scheduled'
  `;

  if (!post) return { success: false, error: "Post not found or not in scheduled status" };
  if (!post.caption) return { success: false, error: "Post has no caption" };
  if (!post.access_token_encrypted) return { success: false, error: "No access token for account" };

  // Look up adapter
  const adapter = getAdapter(post.platform);
  if (!adapter) {
    return { success: false, error: `Unsupported platform: ${post.platform}` };
  }

  // Build full caption with hashtags appended
  const hashtags = (post.hashtags || []) as string[];
  const fullCaption = hashtags.length > 0
    ? `${post.caption}\n\n${hashtags.join(" ")}`
    : post.caption;

  try {
    const result = await adapter.publish({
      platformAccountId: post.platform_account_id,
      accessToken: decrypt(post.access_token_encrypted as string),
      caption: fullCaption,
      mediaUrls: post.media_urls as string[],
      mediaType: post.media_type,
      linkUrl: post.link_url ? socialPostLink(post.link_url as string, post.platform as string, postId) : undefined,
      accountMetadata: (post.account_metadata || {}) as Record<string, unknown>,
    });

    // Update post as published
    await sql`
      UPDATE social_posts
      SET status = 'published',
          published_at = NOW(),
          platform_post_id = ${result.platformPostId},
          platform_post_url = ${result.platformPostUrl || null}
      WHERE id = ${postId}
    `;

    // Legacy: update slot if linked (deprecated — autopilot doesn't use slots)
    if (post.slot_id) {
      await sql`
        UPDATE publishing_slots SET status = 'published' WHERE id = ${post.slot_id}
      `.catch(() => {});
    }

    // Update source asset
    await sql`
      UPDATE media_assets SET triage_status = 'consumed'
      WHERE id = (SELECT source_asset_id FROM social_posts WHERE id = ${postId})
        AND triage_status = 'scheduled'
    `;

    // Audit trail
    await sql`
      INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
      VALUES (${postId}, 'publish', 'scheduled', 'published', ${`Published to ${post.platform}`})
    `;

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Record the failure
    await sql`
      UPDATE social_posts
      SET status = 'failed', error_message = ${message}
      WHERE id = ${postId}
    `;

    await sql`
      INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
      VALUES (${postId}, 'publish_failed', 'scheduled', 'failed', ${message})
    `;

    return { success: false, error: message };
  }
}

/**
 * Publish all posts that are due (scheduled_at <= now, status = scheduled, caption present).
 */
export async function publishDuePosts(siteId: string): Promise<{ published: number; failed: number }> {
  const duePosts = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sp.status = 'scheduled'
      AND sp.caption IS NOT NULL
      AND sp.scheduled_at <= NOW()
    ORDER BY sp.scheduled_at ASC
    LIMIT 10
  `;

  let published = 0;
  let failed = 0;

  for (const post of duePosts) {
    const result = await publishPost(post.id);
    if (result.success) published++;
    else failed++;
  }

  return { published, failed };
}
