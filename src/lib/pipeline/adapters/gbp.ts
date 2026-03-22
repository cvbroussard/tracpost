/**
 * Google Business Profile adapter.
 *
 * Publishes Local Posts to a GBP location via the My Business API.
 * Supports UPDATE posts (photo + text + optional CTA).
 */
import type {
  PlatformAdapter, PublishInput, PublishResult, TokenResult,
  FetchReviewsInput, ReviewData, ReplyInput,
} from "./types";
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
  async fetchReviews(input: FetchReviewsInput): Promise<{ reviews: ReviewData[]; nextCursor?: string }> {
    const { platformAccountId, accessToken, cursor } = input;
    // platformAccountId is the location resource name e.g. "accounts/123/locations/456"
    let url = `https://mybusiness.googleapis.com/v4/${platformAccountId}/reviews?pageSize=25`;
    if (cursor) {
      url += `&pageToken=${cursor}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("GBP fetchReviews failed:", errText);
      return { reviews: [] };
    }

    const data = await res.json();

    const reviews: ReviewData[] = (data.reviews || []).map((r: Record<string, unknown>) => {
      const reviewer = r.reviewer as Record<string, string> | undefined;
      return {
        platformReviewId: r.reviewId as string || r.name as string,
        reviewerName: reviewer?.displayName || "Google User",
        reviewerAvatarUrl: reviewer?.profilePhotoUrl || undefined,
        rating: starRatingToNumber(r.starRating as string),
        body: (r.comment as string) || null,
        reviewedAt: (r.createTime as string) || new Date().toISOString(),
        rawData: r,
      };
    });

    return { reviews, nextCursor: data.nextPageToken || undefined };
  }

  async replyToReview(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }> {
    const { platformAccountId, accessToken, platformReviewId, body } = input;
    // Review name format: "accounts/123/locations/456/reviews/789"
    const reviewName = platformReviewId?.startsWith("accounts/")
      ? platformReviewId
      : `${platformAccountId}/reviews/${platformReviewId}`;

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: body }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GBP review reply failed: ${errText}`);
    }

    return { success: true };
  }
}

function starRatingToNumber(rating: string | undefined): number | null {
  const map: Record<string, number> = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  };
  return rating ? map[rating] ?? null : null;
}

export const gbpAdapter = new GbpAdapter();
