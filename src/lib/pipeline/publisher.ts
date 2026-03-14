import { sql } from "@/lib/db";

/**
 * Publish a scheduled social post to its target platform.
 *
 * Currently supports: Instagram (Meta Graph API).
 * Posts must have a caption and at least one media URL.
 */
export async function publishPost(postId: string): Promise<{ success: boolean; error?: string }> {
  const [post] = await sql`
    SELECT sp.id, sp.caption, sp.hashtags, sp.media_urls, sp.media_type,
           sp.link_url, sp.slot_id,
           sa.platform, sa.account_id AS platform_account_id,
           sa.access_token_encrypted
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sp.id = ${postId} AND sp.status = 'scheduled'
  `;

  if (!post) return { success: false, error: "Post not found or not in scheduled status" };
  if (!post.caption) return { success: false, error: "Post has no caption" };
  if (!post.access_token_encrypted) return { success: false, error: "No access token for account" };

  // Build full caption with hashtags appended
  const hashtags = (post.hashtags || []) as string[];
  const fullCaption = hashtags.length > 0
    ? `${post.caption}\n\n${hashtags.join(" ")}`
    : post.caption;

  try {
    let result: { platformPostId: string; platformPostUrl?: string };

    switch (post.platform) {
      case "instagram":
        result = await publishToInstagram(
          post.platform_account_id,
          post.access_token_encrypted, // TODO: decrypt
          fullCaption,
          post.media_urls as string[],
          post.media_type
        );
        break;
      default:
        return { success: false, error: `Unsupported platform: ${post.platform}` };
    }

    // Update post as published
    await sql`
      UPDATE social_posts
      SET status = 'published',
          published_at = NOW(),
          platform_post_id = ${result.platformPostId},
          platform_post_url = ${result.platformPostUrl || null}
      WHERE id = ${postId}
    `;

    // Update slot if linked
    if (post.slot_id) {
      await sql`
        UPDATE publishing_slots SET status = 'published' WHERE id = ${post.slot_id}
      `;
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
 * Instagram publishing via Meta Graph API.
 *
 * Flow:
 * 1. Create a media container (image or video)
 * 2. Publish the container
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
 */
async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  caption: string,
  mediaUrls: string[],
  mediaType: string | null
): Promise<{ platformPostId: string; platformPostUrl?: string }> {
  const baseUrl = "https://graph.facebook.com/v21.0";
  const imageUrl = mediaUrls[0];

  if (!imageUrl) throw new Error("No media URL provided");

  // Step 1: Create media container
  const isVideo = mediaType?.startsWith("video") || false;

  const containerParams: Record<string, string> = {
    access_token: accessToken,
    caption,
  };

  if (isVideo) {
    containerParams.media_type = "REELS";
    containerParams.video_url = imageUrl;
  } else {
    containerParams.image_url = imageUrl;
  }

  const containerRes = await fetch(`${baseUrl}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(containerParams),
  });

  const containerData = await containerRes.json();

  if (!containerRes.ok) {
    throw new Error(`IG container creation failed: ${JSON.stringify(containerData.error || containerData)}`);
  }

  const containerId = containerData.id;

  // Step 1.5: Poll until container is ready (images and videos both need this)
  await waitForContainer(baseUrl, containerId, accessToken, isVideo ? 30 : 10);

  // Step 2: Publish the container
  const publishRes = await fetch(`${baseUrl}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  const publishData = await publishRes.json();

  if (!publishRes.ok) {
    throw new Error(`IG publish failed: ${JSON.stringify(publishData.error || publishData)}`);
  }

  return {
    platformPostId: publishData.id,
    platformPostUrl: `https://www.instagram.com/p/${publishData.id}/`,
  };
}

/**
 * Poll Meta API until a container is finished processing.
 * Images usually take a few seconds, videos can take 30s–5min.
 */
async function waitForContainer(
  baseUrl: string,
  containerId: string,
  accessToken: string,
  maxAttempts: number = 10,
  intervalMs: number = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await res.json();

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error(`Video processing failed: ${JSON.stringify(data)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Video processing timed out");
}

/**
 * Publish all posts that are due (scheduled_at <= now, status = scheduled, caption present).
 */
export async function publishDuePosts(siteId: string): Promise<{ published: number; failed: number }> {
  const duePosts = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sa.site_id = ${siteId}
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
