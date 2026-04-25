/**
 * LinkedIn adapter.
 *
 * Publishes posts via LinkedIn Marketing API (UGC Posts).
 * Supports text, image, and video posts to personal profiles or company pages.
 */
import type {
  PlatformAdapter, PublishInput, PublishResult, TokenResult,
  FetchCommentsInput, CommentData, ReplyInput,
} from "./types";

const API_BASE = "https://api.linkedin.com/v2";

class LinkedInAdapter implements PlatformAdapter {
  readonly platform = "linkedin";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { platformAccountId, accessToken, caption, mediaUrls, mediaType, accountMetadata } = input;

    // Build author URN — prefer org URN for Company Pages, fall back to person URN
    const selectedOrg = accountMetadata?.selected_org as Record<string, string> | null;
    const author = selectedOrg?.org_urn
      || (accountMetadata?.person_urn as string)
      || (platformAccountId.startsWith("urn:") ? platformAccountId : `urn:li:person:${platformAccountId}`);

    // Upload media if present
    let mediaAsset: string | null = null;
    if (mediaUrls.length > 0) {
      mediaAsset = await uploadMedia(accessToken, author, mediaUrls[0], mediaType);
    }

    // Build UGC post
    const postBody: Record<string, unknown> = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: mediaAsset ? (mediaType === "video" ? "VIDEO" : "IMAGE") : "NONE",
          ...(mediaAsset && {
            media: [
              {
                status: "READY",
                media: mediaAsset,
              },
            ],
          }),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const res = await fetch(`${API_BASE}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`LinkedIn publish failed (${res.status}): ${errBody}`);
    }

    // Post ID is in the X-RestLi-Id header or response body
    const postId = res.headers.get("X-RestLi-Id") || "";

    return {
      platformPostId: postId,
      platformPostUrl: postId
        ? `https://www.linkedin.com/feed/update/${postId}`
        : undefined,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LinkedIn token refresh failed: ${err}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000, // ~60 days
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://www.linkedin.com/feed/update/${platformPostId}`;
  }

  async fetchComments(input: FetchCommentsInput): Promise<CommentData[]> {
    const { accessToken, platformPostId } = input;

    // LinkedIn post URNs need to be URL-encoded in the path
    const encodedUrn = encodeURIComponent(platformPostId);
    const url = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": "202601",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("LinkedIn fetchComments failed:", errText);
      return [];
    }

    const data = await res.json();

    return (data.elements || []).map((c: Record<string, unknown>) => {
      const created = c.created as Record<string, unknown> | undefined;
      const message = c.message as Record<string, unknown> | undefined;

      return {
        platformCommentId: c.id as string,
        platformPostId,
        parentCommentId: c.parentComment ? String(c.parentComment) : undefined,
        authorName: (c.actor as string) || "LinkedIn User",
        authorPlatformId: c.actor as string,
        body: (message?.text as string) || "",
        commentedAt: created?.time
          ? new Date(created.time as number).toISOString()
          : new Date().toISOString(),
        rawData: c,
      };
    });
  }

  async replyToComment(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }> {
    const { accessToken, platformCommentId, body, accountMetadata } = input;

    // The platformCommentId for LinkedIn is the comment ID
    // We need the post URN to construct the reply endpoint
    // The post URN should be stored in the inbox_comments.platform_post_id
    const personUrn = (accountMetadata?.person_urn as string) || "";

    // For LinkedIn, we reply to the post's comments thread, referencing the parent comment
    // We need the post URN — extract from the comment URN if it's a composite
    // Comment URN format: urn:li:comment:(urn:li:activity:xxx,commentId)
    let postUrn = "";
    if (platformCommentId?.includes("urn:li:comment:(")) {
      const match = platformCommentId.match(/urn:li:comment:\((urn:li:activity:\d+),/);
      if (match) postUrn = match[1];
    }

    if (!postUrn) {
      throw new Error("Cannot determine post URN from comment ID for LinkedIn reply");
    }

    const encodedUrn = encodeURIComponent(postUrn);
    const url = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202601",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        actor: personUrn,
        object: postUrn,
        message: { text: body },
        parentComment: platformCommentId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LinkedIn reply failed: ${errText}`);
    }

    const replyId = res.headers.get("x-restli-id") || "";
    return { success: true, platformReplyId: replyId };
  }
}

/**
 * Upload media to LinkedIn via register + upload flow.
 */
async function uploadMedia(
  accessToken: string,
  owner: string,
  mediaUrl: string,
  mediaType: string
): Promise<string | null> {
  try {
    // Step 1: Register upload
    const registerRes = await fetch(`${API_BASE}/assets?action=registerUpload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: [
            mediaType === "video"
              ? "urn:li:digitalmediaRecipe:feedshare-video"
              : "urn:li:digitalmediaRecipe:feedshare-image",
          ],
          owner,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    });

    if (!registerRes.ok) return null;
    const registerData = await registerRes.json();

    const uploadUrl =
      registerData.value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ]?.uploadUrl;
    const asset = registerData.value?.asset;

    if (!uploadUrl || !asset) return null;

    // Step 2: Download media and upload to LinkedIn
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) return null;
    const buffer = await mediaRes.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mediaType === "video" ? "video/mp4" : "image/jpeg",
      },
      body: buffer,
    });

    if (!uploadRes.ok) return null;

    return asset;
  } catch {
    return null;
  }
}

export const linkedinAdapter = new LinkedInAdapter();
