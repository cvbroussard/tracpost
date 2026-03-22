import type {
  PlatformAdapter, PublishInput, PublishResult, TokenResult,
  FetchCommentsInput, CommentData, FetchReviewsInput, ReviewData, ReplyInput,
} from "./types";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Facebook Pages adapter — publishes via Meta Graph API.
 *
 * Uses the same OAuth token as Instagram (Meta unified token).
 * Publishes to the Facebook Page linked via social_accounts.metadata.page_id.
 *
 * Flow:
 * - Photos: POST /{pageId}/photos { url, caption, access_token }
 * - Videos: POST /{pageId}/videos { file_url, description, access_token }
 * - Links:  POST /{pageId}/feed  { message, link, access_token }
 */
export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, mediaType, linkUrl, accountMetadata } = input;

    // Facebook publishes to the Page, not the IG user
    const pageId = (accountMetadata?.page_id as string) || input.platformAccountId;
    if (!pageId) throw new Error("No Facebook Page ID available");

    const isVideo = mediaType?.startsWith("video") || false;
    const imageUrl = mediaUrls[0];

    let postId: string;

    if (linkUrl && !imageUrl) {
      // Link post (no media)
      const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          link: linkUrl,
          access_token: accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`FB link post failed: ${JSON.stringify(data.error || data)}`);
      }
      postId = data.id;
    } else if (isVideo && imageUrl) {
      // Video post
      const res = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: imageUrl,
          description: caption,
          access_token: accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`FB video post failed: ${JSON.stringify(data.error || data)}`);
      }
      postId = data.id;
    } else if (imageUrl) {
      // Photo post
      const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`FB photo post failed: ${JSON.stringify(data.error || data)}`);
      }
      postId = data.id;
    } else {
      // Text-only post
      const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          access_token: accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`FB text post failed: ${JSON.stringify(data.error || data)}`);
      }
      postId = data.id;
    }

    return {
      platformPostId: postId,
      platformPostUrl: `https://www.facebook.com/${postId}`,
    };
  },

  async refreshToken(currentToken: string): Promise<TokenResult> {
    // Same Meta token refresh as Instagram
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
    return `https://www.facebook.com/${platformPostId}`;
  },

  async fetchComments(input: FetchCommentsInput): Promise<CommentData[]> {
    const { accessToken, platformPostId, since } = input;
    const fields = "id,message,created_time,from";
    let url = `${GRAPH_BASE}/${platformPostId}/comments?fields=${fields}&access_token=${accessToken}&limit=50`;
    if (since) {
      url += `&since=${Math.floor(new Date(since).getTime() / 1000)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.warn("FB fetchComments failed:", JSON.stringify(data.error || data));
      return [];
    }

    return (data.data || []).map((c: Record<string, unknown>) => ({
      platformCommentId: c.id as string,
      platformPostId,
      authorName: (c.from as Record<string, string>)?.name || "Unknown",
      authorPlatformId: (c.from as Record<string, string>)?.id || undefined,
      body: c.message as string,
      commentedAt: c.created_time as string,
      rawData: c,
    }));
  },

  async fetchReviews(input: FetchReviewsInput): Promise<{ reviews: ReviewData[]; nextCursor?: string }> {
    const { platformAccountId, accessToken, accountMetadata } = input;
    const pageId = (accountMetadata?.page_id as string) || platformAccountId;
    const fields = "reviewer,created_time,rating,review_text,recommendation_type,open_graph_story";
    const url = `${GRAPH_BASE}/${pageId}/ratings?fields=${fields}&access_token=${accessToken}&limit=25`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.warn("FB fetchReviews failed:", JSON.stringify(data.error || data));
      return { reviews: [] };
    }

    const reviews: ReviewData[] = (data.data || []).map((r: Record<string, unknown>) => ({
      platformReviewId: (r.open_graph_story as Record<string, string>)?.id || `fb_${(r.reviewer as Record<string, string>)?.id}_${r.created_time}`,
      reviewerName: (r.reviewer as Record<string, string>)?.name || "Facebook User",
      rating: r.rating ? Number(r.rating) : null,
      body: (r.review_text as string) || null,
      reviewedAt: r.created_time as string,
      rawData: r,
    }));

    const nextCursor = data.paging?.cursors?.after || undefined;
    return { reviews, nextCursor };
  },

  async replyToComment(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }> {
    const { accessToken, platformCommentId, body } = input;
    const res = await fetch(`${GRAPH_BASE}/${platformCommentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, access_token: accessToken }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`FB reply failed: ${JSON.stringify(data.error || data)}`);
    }

    return { success: true, platformReplyId: data.id };
  },
};
