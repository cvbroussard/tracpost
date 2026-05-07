import type { ContentTypeKey } from "../shared/model-config";

/**
 * Blog generator types.
 *
 * Blog has 4 content type subtypes (authority/deep_dive/project_story/
 * vendor_spotlight). The classifier picks one based on context, or the
 * orchestrator can force it via `contentTypeOverride`.
 */

export type BlogContentType =
  | "authority_overview"
  | "deep_dive"
  | "project_story"
  | "vendor_spotlight";

export interface BlogGenerateSpec {
  siteId: string;

  /** Required hero — the asset the article is anchored on. */
  heroAssetId: string;

  /** Body candidate assets (latitude — cross-project OK). LLM places via {{asset:UUID}} */
  bodyAssetIds?: string[];

  /** Optional poster (for video heroes). */
  posterAssetId?: string;

  /** Optional analytics provenance — what asset triggered generation. */
  seedAssetId?: string;

  /** Optional editorial angle / intent override (used by reward-prompt strategy). */
  intent?: string;

  /** Optional title hint (rare — orchestrator usually lets the LLM title). */
  topicHint?: string;

  /** Force a specific content type instead of letting classify.ts pick. */
  contentTypeOverride?: BlogContentType;

  /** Optional FK to a service this authority article supports. */
  serviceId?: string;

  /** Optional FK to a project this article belongs to (used by chapter generator). */
  projectId?: string;

  /** Status to persist with. Defaults to 'draft'. */
  status?: "draft" | "published" | "flagged" | "archived";
}

export interface BlogGeneratedBody {
  title: string;
  body: string;          // markdown w/ {{asset:UUID}} placeholders
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentPillars: string[];
  contentTags: string[];
}

export interface BlogGenerateResult {
  id: string;            // blog_posts_v2.id
  slug: string;
  title: string;
  contentType: ContentTypeKey;
  assetsCount: number;
  status: string;
}
