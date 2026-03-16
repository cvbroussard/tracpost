/**
 * YouTube Shorts adapter.
 *
 * Publishes short-form video (<60s) via YouTube Data API v3.
 * Uses resumable upload protocol.
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";
import { refreshGoogleToken } from "@/lib/google";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

class YouTubeAdapter implements PlatformAdapter {
  readonly platform = "youtube";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, mediaType } = input;

    if (mediaType !== "video" || mediaUrls.length === 0) {
      throw new Error("YouTube Shorts requires video content");
    }

    // Step 1: Download the video
    const videoRes = await fetch(mediaUrls[0]);
    if (!videoRes.ok) throw new Error("Failed to download video for YouTube upload");
    const videoBuffer = await videoRes.arrayBuffer();

    // Step 2: Initiate resumable upload
    const title = caption.split("\n")[0].slice(0, 100) || "New Short";
    // Adding #Shorts tells YouTube to treat as a Short
    const description = caption.includes("#Shorts") ? caption : `${caption}\n\n#Shorts`;

    const metadata = {
      snippet: {
        title,
        description,
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const initRes = await fetch(
      `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(videoBuffer.byteLength),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`YouTube upload init failed (${initRes.status}): ${err}`);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) throw new Error("YouTube did not return upload URL");

    // Step 3: Upload video binary
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.byteLength),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`YouTube upload failed (${uploadRes.status}): ${err}`);
    }

    const data = await uploadRes.json();
    const videoId = data.id;

    return {
      platformPostId: videoId,
      platformPostUrl: videoId
        ? `https://www.youtube.com/shorts/${videoId}`
        : undefined,
    };
  }

  /**
   * YouTube uses Google OAuth — same refresh as GBP.
   */
  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const result = await refreshGoogleToken(refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://www.youtube.com/shorts/${platformPostId}`;
  }
}

export const youtubeAdapter = new YouTubeAdapter();
