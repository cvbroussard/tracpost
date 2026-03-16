/**
 * Google Business Profile adapter.
 *
 * Publishes Local Posts to a GBP location via the My Business API.
 * Supports UPDATE posts (photo + text + optional CTA).
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";
import { refreshGoogleToken } from "@/lib/google";

class GbpAdapter implements PlatformAdapter {
  readonly platform = "gbp";

  /**
   * Publish a Local Post to Google Business Profile.
   *
   * GBP Local Posts API:
   *   POST accounts/{accountId}/locations/{locationId}/localPosts
   *
   * The platformAccountId for GBP is the full location resource name
   * stored in gbp_locations.gbp_location_id (e.g., "accounts/123/locations/456").
   *
   * The access token comes from gbp_credentials via the publisher.
   * Note: GBP tokens are short-lived (1hr), so the publisher should
   * refresh before calling publish if needed.
   */
  async publish(input: PublishInput): Promise<PublishResult> {
    const { platformAccountId, accessToken, caption, mediaUrls } = input;
    const locationId = platformAccountId;

    // Build the Local Post payload
    const postBody: Record<string, unknown> = {
      languageCode: "en",
      summary: caption,
      topicType: "STANDARD",
    };

    // Add media if available
    if (mediaUrls.length > 0) {
      postBody.media = mediaUrls.map((url) => ({
        mediaFormat: "PHOTO",
        sourceUrl: url,
      }));
    }

    // Add CTA if a link URL is provided
    if (input.linkUrl) {
      postBody.callToAction = {
        actionType: "LEARN_MORE",
        url: input.linkUrl,
      };
    }

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`GBP publish failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    // data.name = "accounts/123/locations/456/localPosts/789"
    const postId = data.name || "";
    const searchUrl = data.searchUrl || "";

    return {
      platformPostId: postId,
      platformPostUrl: searchUrl || this.getPostUrl(postId, input.accountMetadata),
    };
  }

  /**
   * Refresh a Google OAuth token using a refresh token.
   *
   * For GBP, the currentToken parameter is the refresh token
   * (not the access token), since Google access tokens are only 1hr.
   * The publisher passes the refresh token from gbp_credentials.
   */
  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const result = await refreshGoogleToken(refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  /**
   * Build a URL to view the GBP post.
   * GBP posts appear in Google Maps / Search — the direct URL
   * is the searchUrl returned by the API, or the business listing.
   */
  getPostUrl(
    platformPostId: string,
    accountMetadata?: Record<string, unknown>
  ): string {
    // If we have a place_id in metadata, link to Google Maps
    const placeId = accountMetadata?.place_id as string | undefined;
    if (placeId) {
      return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
    }
    // Fallback: the post resource name isn't a public URL
    return `https://business.google.com/`;
  }
}

export const gbpAdapter = new GbpAdapter();
