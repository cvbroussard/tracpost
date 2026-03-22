/**
 * Platform adapter interface — implement this to add a new social platform.
 *
 * Each adapter handles publishing, token refresh, and post URL generation
 * for a single platform. The orchestrator selects the correct adapter
 * based on the `platform` field on social_accounts.
 */

export interface PublishResult {
  platformPostId: string;
  platformPostUrl?: string;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface PublishInput {
  /** Platform-specific user/account ID (e.g., IG user ID, FB page ID) */
  platformAccountId: string;
  /** OAuth access token (long-lived) */
  accessToken: string;
  /** Full caption text including hashtags */
  caption: string;
  /** Public URLs of media files */
  mediaUrls: string[];
  /** image or video */
  mediaType: string;
  /** Optional link URL (for platforms that support link posts) */
  linkUrl?: string;
  /** Platform-specific metadata from social_accounts.metadata */
  accountMetadata?: Record<string, unknown>;
}

// ── Inbox / Engagement types ──

export interface CommentData {
  platformCommentId: string;
  platformPostId: string;
  parentCommentId?: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  authorPlatformId?: string;
  body: string;
  commentedAt: string; // ISO 8601
  rawData?: Record<string, unknown>;
}

export interface ReviewData {
  platformReviewId: string;
  reviewerName: string;
  reviewerAvatarUrl?: string;
  rating: number | null;
  body: string | null;
  reviewedAt: string; // ISO 8601
  rawData?: Record<string, unknown>;
}

export interface FetchCommentsInput {
  platformAccountId: string;
  accessToken: string;
  platformPostId: string;
  since?: string; // ISO timestamp cursor
  accountMetadata?: Record<string, unknown>;
}

export interface FetchReviewsInput {
  platformAccountId: string;
  accessToken: string;
  cursor?: string;
  accountMetadata?: Record<string, unknown>;
}

export interface ReplyInput {
  platformAccountId: string;
  accessToken: string;
  platformCommentId?: string;
  platformReviewId?: string;
  body: string;
  accountMetadata?: Record<string, unknown>;
}

// ── Adapter interface ──

export interface PlatformAdapter {
  /** Platform identifier matching social_accounts.platform */
  readonly platform: string;

  /** Publish a post to this platform */
  publish(input: PublishInput): Promise<PublishResult>;

  /** Refresh an expiring OAuth token. Throw if not refreshable. */
  refreshToken(currentToken: string): Promise<TokenResult>;

  /** Build the public post URL from a platform post ID */
  getPostUrl(platformPostId: string, accountMetadata?: Record<string, unknown>): string;

  /** Fetch comments on a specific post (optional — adapters opt in) */
  fetchComments?(input: FetchCommentsInput): Promise<CommentData[]>;

  /** Fetch reviews for a business listing (optional — GBP, Facebook) */
  fetchReviews?(input: FetchReviewsInput): Promise<{ reviews: ReviewData[]; nextCursor?: string }>;

  /** Reply to a comment (optional) */
  replyToComment?(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }>;

  /** Reply to a review (optional) */
  replyToReview?(input: ReplyInput): Promise<{ success: boolean; platformReplyId?: string }>;
}
