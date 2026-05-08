import type {
  PlatformAdapter, PublishInput, PublishResult, TokenResult,
  FetchCommentsInput, CommentData, ReplyInput,
} from "./types";
import { INSTAGRAM_DEFAULTS } from "./defaults";
import { applyDisclosurePrefix } from "./ai-disclosure";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Instagram adapter — publishes via Meta Graph API.
 *
 * Flow:
 * 1. Create media container (image or REELS video)
 * 2. Poll until container status = FINISHED
 * 3. Publish the container
 */
export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { platformAccountId, accessToken, caption, mediaUrls, mediaType, aiGenerated } = input;
    const imageUrl = mediaUrls[0];
    if (!imageUrl) throw new Error("No media URL provided");

    const isVideo = mediaType?.startsWith("video") || false;

    // AI disclosure (#160): prepend disclosure language to caption when the
    // source asset is AI-generated. Meta's Graph API doesn't currently expose
    // a stable explicit AI-flag at the publish layer, so the visible caption
    // prefix is our compliance mechanism + positioning signal.
    const finalCaption = applyDisclosurePrefix(caption, aiGenerated === true);

    // Step 1: Create media container.
    // Per project_tracpost_upload_ai_detection.md guideline #1, set every
    // parameter explicitly rather than relying on platform defaults. Defaults
    // centralized in adapters/defaults.ts (#159).
    const containerParams: Record<string, string> = {
      access_token: accessToken,
      caption: finalCaption,
    };

    if (isVideo) {
      containerParams.media_type = INSTAGRAM_DEFAULTS.REELS.media_type;
      containerParams.video_url = imageUrl;
      // Explicit cross-post-to-Feed flag for Reels. Default platform behavior
      // matches but pinning here protects against silent platform changes.
      containerParams.share_to_feed = String(INSTAGRAM_DEFAULTS.REELS.share_to_feed);
    } else {
      containerParams.image_url = imageUrl;
    }

    const containerRes = await fetch(`${GRAPH_BASE}/${platformAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerParams),
    });

    const containerData = await containerRes.json();
    if (!containerRes.ok) {
      throw new Error(
        `IG container creation failed: ${JSON.stringify(containerData.error || containerData)}`
      );
    }

    const containerId = containerData.id;

    // Step 2: Poll until ready
    await waitForContainer(containerId, accessToken, isVideo ? 30 : 10);

    // Step 3: Publish
    const publishRes = await fetch(`${GRAPH_BASE}/${platformAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      throw new Error(
        `IG publish failed: ${JSON.stringify(publishData.error || publishData)}`
      );
    }

    return {
      platformPostId: publishData.id,
      platformPostUrl: `https://www.instagram.com/p/${publishData.id}/`,
    };
  },

  async refreshToken(currentToken: string): Promise<TokenResult> {
    const res = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: currentToken,
        })
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Token refresh failed: ${JSON.stringify(data.error || data)}`);
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
    };
  },

  getPostUrl(platformPostId: string): string {
    return `https://www.instagram.com/p/${platformPostId}/`;
  },

  async fetchComments(input: FetchCommentsInput): Promise<CommentData[]> {
    const { accessToken, platformPostId, since } = input;
    const fields = "id,text,timestamp,username,from";
    let url = `${GRAPH_BASE}/${platformPostId}/comments?fields=${fields}&access_token=${accessToken}&limit=50`;
    if (since) {
      url += `&since=${Math.floor(new Date(since).getTime() / 1000)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.warn("IG fetchComments failed:", JSON.stringify(data.error || data));
      return [];
    }

    return (data.data || []).map((c: Record<string, unknown>) => ({
      platformCommentId: c.id as string,
      platformPostId,
      authorName: (c.from as Record<string, string>)?.username || (c.username as string) || "Unknown",
      authorUsername: (c.username as string) || undefined,
      authorPlatformId: (c.from as Record<string, string>)?.id || undefined,
      body: c.text as string,
      commentedAt: c.timestamp as string,
      rawData: c,
    }));
  },

  async replyToComment(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }> {
    const { accessToken, platformCommentId, body } = input;
    const res = await fetch(`${GRAPH_BASE}/${platformCommentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, access_token: accessToken }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`IG reply failed: ${JSON.stringify(data.error || data)}`);
    }

    return { success: true, platformReplyId: data.id };
  },
};

/**
 * Poll Meta API until a media container is finished processing.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts: number = 10,
  intervalMs: number = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await res.json();

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error(`Media processing failed: ${JSON.stringify(data)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Media processing timed out");
}
