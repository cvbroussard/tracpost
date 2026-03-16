/**
 * LinkedIn adapter.
 *
 * Publishes posts via LinkedIn Marketing API (UGC Posts).
 * Supports text, image, and video posts to personal profiles or company pages.
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";

const API_BASE = "https://api.linkedin.com/v2";

class LinkedInAdapter implements PlatformAdapter {
  readonly platform = "linkedin";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { platformAccountId, accessToken, caption, mediaUrls, mediaType } = input;

    // platformAccountId is the LinkedIn URN (e.g., "urn:li:person:xxx" or "urn:li:organization:xxx")
    const author = platformAccountId;

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
