import { sql } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
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
           sp.link_url, sp.slot_id, sp.metadata AS post_metadata,
           sp.account_id AS social_account_id,
           sa.platform, sa.account_id AS platform_account_id,
           sa.access_token_encrypted, sa.refresh_token_encrypted,
           sa.token_expires_at, sa.metadata AS account_metadata
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sp.id = ${postId} AND sp.status = 'scheduled'
  `;

  if (!post) return { success: false, error: "Post not found or not in scheduled status" };
  if (!post.caption) return { success: false, error: "Post has no caption" };
  if (!post.access_token_encrypted) return { success: false, error: "No access token for account" };

  // New-model overrides: when the post was created from a platform_asset,
  // the autopilot stashed the actual platform_account_id and asset metadata
  // (e.g., page_access_token for FB) into social_posts.metadata.
  const postMeta = (post.post_metadata || {}) as Record<string, unknown>;
  const accountIdOverride = postMeta.platform_account_id_override as string | undefined;
  const assetMetadata = (postMeta.asset_metadata || {}) as Record<string, unknown>;

  // Resolve the account ID we publish AS.
  // For platform 'meta' (umbrella OAuth): social_accounts.account_id is the user ID,
  //   so we MUST use the override (Page ID or IG account ID) from the asset.
  // For legacy rows: social_accounts.account_id is already the publishing target.
  const platformAccountId = accountIdOverride || (post.platform_account_id as string);

  // For the adapter, derive the target platform from the asset metadata if present,
  // otherwise from social_accounts.platform (legacy).
  // The asset's platform is what the publisher actually targets (facebook vs instagram
  // even though both share a 'meta' grant).
  const adapterPlatform = (postMeta.platform as string) || (post.platform as string);

  // Look up adapter
  const adapter = getAdapter(adapterPlatform);
  if (!adapter) {
    return { success: false, error: `Unsupported platform: ${adapterPlatform}` };
  }

  // Pre-publish refresh: if the user-level token is expired or expiring within
  // 5 minutes, refresh it first using the platform adapter. Page-specific tokens
  // (FB) are derived from a valid user token, so refreshing the user token is
  // sufficient. Skip refresh entirely when the post uses a page_access_token
  // (FB pages) — those don't expire the same way.
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  const expiresAt = post.token_expires_at ? new Date(post.token_expires_at as string).getTime() : null;
  const isExpiring = expiresAt !== null && expiresAt - Date.now() < REFRESH_BUFFER_MS;

  let userAccessToken = decrypt(post.access_token_encrypted as string);

  if (isExpiring && post.refresh_token_encrypted) {
    try {
      const refreshAdapter = getAdapter(post.platform as string);
      if (refreshAdapter?.refreshToken) {
        const refreshResult = await refreshAdapter.refreshToken(
          decrypt(post.refresh_token_encrypted as string)
        );
        userAccessToken = refreshResult.accessToken;
        const newExpiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString();
        await sql`
          UPDATE social_accounts
          SET access_token_encrypted = ${encrypt(userAccessToken)},
              token_expires_at = ${newExpiresAt},
              status = 'active',
              updated_at = NOW()
          WHERE id = ${post.social_account_id as string}
        `;
        console.log(`Token refreshed inline for ${post.platform} (${post.social_account_id})`);
      }
    } catch (refreshErr) {
      console.warn("Inline token refresh failed:", refreshErr);
      // Continue with the (possibly expired) token — let the publish call fail
      // with the platform's actual error message rather than guessing here.
    }
  }

  // For Facebook page publishing, the adapter needs the page-specific access token,
  // not the user token. The asset metadata carries it.
  const pageAccessToken = assetMetadata.page_access_token as string | undefined;
  const accessToken = pageAccessToken
    ? pageAccessToken
    : userAccessToken;

  // Build full caption with hashtags appended
  const hashtags = (post.hashtags || []) as string[];
  const fullCaption = hashtags.length > 0
    ? `${post.caption}\n\n${hashtags.join(" ")}`
    : post.caption;

  try {
    const result = await adapter.publish({
      platformAccountId,
      accessToken,
      caption: fullCaption,
      mediaUrls: post.media_urls as string[],
      mediaType: post.media_type,
      linkUrl: post.link_url ? socialPostLink(post.link_url as string, adapterPlatform, postId) : undefined,
      accountMetadata: {
        ...(post.account_metadata || {}),
        ...assetMetadata,
      } as Record<string, unknown>,
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
