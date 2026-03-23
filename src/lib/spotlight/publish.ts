import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";
import { generateSpotlightCaption } from "./caption";
import { sendPushNotification } from "@/lib/notifications";

/**
 * Publish a Spotlight post immediately to all linked social accounts.
 *
 * Flow:
 * 1. Generate AI caption per platform
 * 2. Create social_posts rows with authority='trigger', trigger_type='spotlight'
 * 3. Publish immediately via adapters
 * 4. Update spotlight_sessions with social_post_id + caption
 * 5. Send push notification to subscriber
 */
export async function publishSpotlight(sessionId: string): Promise<{
  published: number;
  failed: number;
  errors: string[];
}> {
  const result = { published: 0, failed: 0, errors: [] as string[] };

  // Load session with site info
  const [session] = await sql`
    SELECT ss.*, s.name AS site_name, s.brand_voice
    FROM spotlight_sessions ss
    JOIN sites s ON s.id = ss.site_id
    WHERE ss.id = ${sessionId} AND ss.photo_consent = true
  `;

  if (!session) {
    result.errors.push("Session not found or no photo consent");
    return result;
  }

  if (!session.photo_url) {
    result.errors.push("No photo URL on session");
    return result;
  }

  // Get all active social accounts linked to this site
  const accounts = await sql`
    SELECT sa.id, sa.platform, sa.account_id, sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${session.site_id} AND sa.status = 'active'
  `;

  if (accounts.length === 0) {
    result.errors.push("No active social accounts linked to site");
    return result;
  }

  let savedCaption = "";

  for (const account of accounts) {
    try {
      const adapter = getAdapter(account.platform);
      if (!adapter) continue;

      // Generate platform-specific caption
      const { caption, hashtags } = await generateSpotlightCaption({
        customerName: session.customer_name,
        staffNote: session.staff_note,
        siteName: session.site_name,
        brandVoice: session.brand_voice as Record<string, unknown>,
        platform: account.platform,
      });

      const fullCaption = hashtags.length > 0
        ? `${caption}\n\n${hashtags.join(" ")}`
        : caption;

      if (!savedCaption) savedCaption = caption;

      // Create social_posts row
      const [post] = await sql`
        INSERT INTO social_posts (
          account_id, caption, hashtags, media_urls, media_type,
          status, authority, trigger_type, trigger_reference_id,
          scheduled_at
        )
        VALUES (
          ${account.id}, ${caption}, ${hashtags}, ${[session.photo_url]}, 'image',
          'scheduled', 'trigger', 'spotlight', ${sessionId},
          NOW()
        )
        RETURNING id
      `;

      // Publish immediately
      const accessToken = decrypt(account.access_token_encrypted as string);
      const pubResult = await adapter.publish({
        platformAccountId: account.account_id,
        accessToken,
        caption: fullCaption,
        mediaUrls: [session.photo_url],
        mediaType: "image",
        accountMetadata: (account.metadata || {}) as Record<string, unknown>,
      });

      // Update post as published
      await sql`
        UPDATE social_posts
        SET status = 'published',
            published_at = NOW(),
            platform_post_id = ${pubResult.platformPostId},
            platform_post_url = ${pubResult.platformPostUrl || null}
        WHERE id = ${post.id}
      `;

      // Link first published post to session
      if (result.published === 0) {
        await sql`
          UPDATE spotlight_sessions
          SET social_post_id = ${post.id}, caption = ${caption}, updated_at = NOW()
          WHERE id = ${sessionId}
        `;
      }

      // Log analytics
      await sql`
        INSERT INTO spotlight_analytics (session_id, site_id, event, metadata)
        VALUES (${sessionId}, ${session.site_id}, 'social_posted', ${JSON.stringify({ platform: account.platform, post_id: post.id })})
      `;

      result.published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`${account.platform}: ${msg}`);
      result.failed++;
    }
  }

  // Push notification to subscriber
  if (result.published > 0) {
    const customerLabel = session.customer_name || "A customer";
    const ratingLabel = session.star_rating ? ` (${session.star_rating}★)` : "";

    await sendPushNotification(
      session.subscriber_id,
      "New Spotlight!",
      `${customerLabel} was Spotlighted${ratingLabel} — posted to ${result.published} account${result.published > 1 ? "s" : ""}`,
      { type: "spotlight", sessionId, siteId: session.site_id }
    );
  }

  return result;
}
