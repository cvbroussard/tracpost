/**
 * TikTok adapter.
 *
 * Publishes videos via TikTok Content Posting API v2.
 * Only supports video content (no static images for feed).
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";

const API_BASE = "https://open.tiktokapis.com/v2";

class TikTokAdapter implements PlatformAdapter {
  readonly platform = "tiktok";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, mediaType } = input;

    if (mediaType !== "video" || mediaUrls.length === 0) {
      throw new Error("TikTok only supports video posts");
    }

    // Step 1: Initialize video upload via URL pull
    const initRes = await fetch(`${API_BASE}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 150),
          description: caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrls[0],
        },
      }),
    });

    if (!initRes.ok) {
      const errBody = await initRes.text();
      throw new Error(`TikTok publish init failed (${initRes.status}): ${errBody}`);
    }

    const initData = await initRes.json();
    const publishId = initData.data?.publish_id;

    if (!publishId) {
      throw new Error("TikTok publish init returned no publish_id");
    }

    // Step 2: Poll for publish status
    const postId = await pollPublishStatus(accessToken, publishId);

    return {
      platformPostId: postId || publishId,
      platformPostUrl: postId ? `https://www.tiktok.com/@/video/${postId}` : undefined,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const res = await fetch(`${API_BASE}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`TikTok token refresh failed: ${err}`);
    }

    const data = await res.json();
    return {
      accessToken: data.data.access_token,
      expiresIn: data.data.expires_in || 86400,
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://www.tiktok.com/@/video/${platformPostId}`;
  }
}

async function pollPublishStatus(
  accessToken: string,
  publishId: string,
  maxAttempts = 10
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const res = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    if (!res.ok) continue;

    const data = await res.json();
    const status = data.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      return data.data.publicaly_available_post_id?.[0] || null;
    }
    if (status === "FAILED") {
      throw new Error(`TikTok publish failed: ${data.data?.fail_reason || "unknown"}`);
    }
  }

  return null; // Still processing — post may appear later
}

export const tiktokAdapter = new TikTokAdapter();
