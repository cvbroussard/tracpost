/**
 * Pinterest adapter.
 *
 * Publishes pins via Pinterest API v5.
 * Supports image and video pins with link attribution.
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";

const API_BASE = "https://api.pinterest.com/v5";

class PinterestAdapter implements PlatformAdapter {
  readonly platform = "pinterest";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, linkUrl, accountMetadata } = input;

    // board_id is required — stored in account metadata during connect
    const boardId = accountMetadata?.board_id as string;
    if (!boardId) {
      throw new Error("Pinterest requires a board_id in account metadata");
    }

    // Build pin
    const pinBody: Record<string, unknown> = {
      board_id: boardId,
      description: caption.slice(0, 500),
      title: caption.split("\n")[0].slice(0, 100) || "New Pin",
    };

    if (linkUrl) {
      pinBody.link = linkUrl;
    }

    if (mediaUrls.length > 0) {
      pinBody.media_source = {
        source_type: "url",
        url: mediaUrls[0],
      };
    }

    const res = await fetch(`${API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pinBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Pinterest publish failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const pinId = data.id;

    return {
      platformPostId: pinId,
      platformPostUrl: pinId
        ? `https://www.pinterest.com/pin/${pinId}/`
        : undefined,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const credentials = Buffer.from(
      `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
    ).toString("base64");

    const res = await fetch(`${API_BASE}/oauth/token`, {
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
      throw new Error(`Pinterest token refresh failed: ${err}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://www.pinterest.com/pin/${platformPostId}/`;
  }
}

export const pinterestAdapter = new PinterestAdapter();
