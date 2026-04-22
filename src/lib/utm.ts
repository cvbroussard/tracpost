/**
 * UTM parameter builder for TracPost-generated links.
 *
 * Every link TracPost generates (GBP posts, social posts, blog articles,
 * email review requests) gets tagged so GA4 can attribute traffic back
 * to TracPost's content pipeline.
 *
 * Structure:
 *   utm_source=tracpost (always)
 *   utm_medium={platform} (gbp, instagram, facebook, linkedin, etc.)
 *   utm_campaign={content_type} (social_post, blog_article, review_request, gbp_post)
 *   utm_content={identifier} (asset ID, post ID, or slug for drill-down)
 */

export type UtmMedium =
  | "gbp"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "email"
  | "blog"
  | "website";

export type UtmCampaign =
  | "social_post"
  | "blog_article"
  | "gbp_post"
  | "review_request"
  | "newsletter"
  | "project_page";

interface UtmParams {
  medium: UtmMedium;
  campaign: UtmCampaign;
  content?: string;
}

/**
 * Append UTM parameters to a URL.
 * Handles URLs with existing query strings.
 */
export function appendUtm(baseUrl: string, params: UtmParams): string {
  if (!baseUrl) return baseUrl;

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("utm_source", "tracpost");
    url.searchParams.set("utm_medium", params.medium);
    url.searchParams.set("utm_campaign", params.campaign);
    if (params.content) {
      url.searchParams.set("utm_content", params.content);
    }
    return url.toString();
  } catch {
    // Fallback for malformed URLs
    const separator = baseUrl.includes("?") ? "&" : "?";
    let utm = `${separator}utm_source=tracpost&utm_medium=${params.medium}&utm_campaign=${params.campaign}`;
    if (params.content) {
      utm += `&utm_content=${encodeURIComponent(params.content)}`;
    }
    return baseUrl + utm;
  }
}

/**
 * Build a UTM-tagged link for a social post.
 * Used by the autopilot publisher when generating post captions with links.
 */
export function socialPostLink(websiteUrl: string, platform: string, assetId?: string): string {
  return appendUtm(websiteUrl, {
    medium: (platform as UtmMedium) || "website",
    campaign: platform === "gbp" ? "gbp_post" : "social_post",
    content: assetId?.slice(0, 8),
  });
}

/**
 * Build a UTM-tagged link for a blog article.
 */
export function blogArticleLink(articleUrl: string, distributionPlatform?: string): string {
  return appendUtm(articleUrl, {
    medium: (distributionPlatform as UtmMedium) || "blog",
    campaign: "blog_article",
  });
}

/**
 * Build a UTM-tagged link for a review request email.
 */
export function reviewRequestLink(websiteUrl: string): string {
  return appendUtm(websiteUrl, {
    medium: "email",
    campaign: "review_request",
  });
}
