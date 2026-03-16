/**
 * X/Twitter adapter.
 *
 * Publishes tweets via X API v2 with media upload via v1.1.
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";

const API_V2 = "https://api.x.com/2";
const UPLOAD_API = "https://upload.twitter.com/1.1";

class TwitterAdapter implements PlatformAdapter {
  readonly platform = "twitter";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, mediaType } = input;

    // Upload media if present
    const mediaIds: string[] = [];
    for (const url of mediaUrls.slice(0, 4)) {
      const mediaId = await uploadMedia(accessToken, url, mediaType);
      if (mediaId) mediaIds.push(mediaId);
    }

    // Create tweet
    const tweetBody: Record<string, unknown> = {
      text: caption.slice(0, 280),
    };

    if (mediaIds.length > 0) {
      tweetBody.media = { media_ids: mediaIds };
    }

    const res = await fetch(`${API_V2}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Twitter publish failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const tweetId = data.data?.id;

    return {
      platformPostId: tweetId,
      platformPostUrl: tweetId
        ? `https://x.com/i/status/${tweetId}`
        : undefined,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch(`${API_V2}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twitter token refresh failed: ${err}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 7200,
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://x.com/i/status/${platformPostId}`;
  }
}

/**
 * Upload media to Twitter via v1.1 media upload endpoint.
 * Downloads the image/video from URL and uploads as binary.
 */
async function uploadMedia(
  accessToken: string,
  mediaUrl: string,
  mediaType: string
): Promise<string | null> {
  try {
    // Download media
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) return null;
    const buffer = await mediaRes.arrayBuffer();

    // For images, use simple upload
    if (mediaType === "image") {
      const form = new FormData();
      form.append("media_data", Buffer.from(buffer).toString("base64"));

      const uploadRes = await fetch(`${UPLOAD_API}/media/upload.json`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      if (!uploadRes.ok) return null;
      const data = await uploadRes.json();
      return data.media_id_string || null;
    }

    // For video, use chunked upload (INIT → APPEND → FINALIZE)
    const totalBytes = buffer.byteLength;

    // INIT
    const initRes = await fetch(`${UPLOAD_API}/media/upload.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        command: "INIT",
        total_bytes: String(totalBytes),
        media_type: "video/mp4",
      }),
    });
    if (!initRes.ok) return null;
    const initData = await initRes.json();
    const mediaId = initData.media_id_string;

    // APPEND (single chunk for simplicity)
    const appendForm = new FormData();
    appendForm.append("command", "APPEND");
    appendForm.append("media_id", mediaId);
    appendForm.append("segment_index", "0");
    appendForm.append("media_data", Buffer.from(buffer).toString("base64"));

    await fetch(`${UPLOAD_API}/media/upload.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: appendForm,
    });

    // FINALIZE
    const finalRes = await fetch(`${UPLOAD_API}/media/upload.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        command: "FINALIZE",
        media_id: mediaId,
      }),
    });
    if (!finalRes.ok) return null;

    return mediaId;
  } catch {
    return null;
  }
}

export const twitterAdapter = new TwitterAdapter();
