/**
 * YouTube Shorts adapter.
 *
 * Publishes short-form video (<60s) via YouTube Data API v3.
 * Uses resumable upload protocol.
 */
import type {
  PlatformAdapter, PublishInput, PublishResult, TokenResult,
  FetchCommentsInput, CommentData, ReplyInput,
} from "./types";
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

  async fetchComments(input: FetchCommentsInput): Promise<CommentData[]> {
    const { accessToken, platformPostId, since } = input;
    const url = `${API_BASE}/commentThreads?` + new URLSearchParams({
      part: "snippet,replies",
      videoId: platformPostId,
      maxResults: "50",
      order: "time",
    });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("YouTube fetchComments failed:", errText);
      return [];
    }

    const data = await res.json();
    const comments: CommentData[] = [];
    const sinceDate = since ? new Date(since) : null;

    for (const thread of data.items || []) {
      const top = thread.snippet?.topLevelComment?.snippet;
      if (!top) continue;

      // Skip comments older than cursor
      if (sinceDate && new Date(top.publishedAt) <= sinceDate) continue;

      comments.push({
        platformCommentId: thread.snippet.topLevelComment.id,
        platformPostId,
        authorName: top.authorDisplayName || "YouTube User",
        authorAvatarUrl: top.authorProfileImageUrl || undefined,
        authorPlatformId: top.authorChannelId?.value || undefined,
        body: top.textDisplay,
        commentedAt: top.publishedAt,
        rawData: top,
      });

      // Include replies
      for (const reply of thread.replies?.comments || []) {
        const r = reply.snippet;
        if (sinceDate && new Date(r.publishedAt) <= sinceDate) continue;

        comments.push({
          platformCommentId: reply.id,
          platformPostId,
          parentCommentId: thread.snippet.topLevelComment.id,
          authorName: r.authorDisplayName || "YouTube User",
          authorAvatarUrl: r.authorProfileImageUrl || undefined,
          authorPlatformId: r.authorChannelId?.value || undefined,
          body: r.textDisplay,
          commentedAt: r.publishedAt,
          rawData: r,
        });
      }
    }

    return comments;
  }

  async replyToComment(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }> {
    const { accessToken, platformCommentId, body } = input;
    const res = await fetch(`${API_BASE}/comments?part=snippet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          parentId: platformCommentId,
          textOriginal: body,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube reply failed: ${errText}`);
    }

    const data = await res.json();
    return { success: true, platformReplyId: data.id };
  }
}

export const youtubeAdapter = new YouTubeAdapter();
