/**
 * Blog Promotion Pipeline
 *
 * When a blog post is published, generates platform-specific social posts
 * across all connected accounts. Each post gets a tailored caption,
 * the blog hero image, and a link to the article.
 *
 * Trigger: blog post status → 'published'
 * Output: scheduled social posts staggered across platforms
 */

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import { publicBlogArticleUrl } from "@/lib/urls";

const anthropic = new Anthropic();

interface PromotionResult {
  blogPostId: string;
  postsCreated: number;
  errors: string[];
}

/**
 * Platform-specific promotion config.
 * Defines caption style, whether links work inline, and scheduling offset.
 */
const PLATFORM_CONFIG: Record<string, {
  maxLength: number;
  hashtagRange: [number, number];
  style: string;
  supportsLinks: boolean;
  delayMinutes: number;
  format: string;
}> = {
  twitter: {
    maxLength: 280,
    hashtagRange: [1, 2],
    style: "Punchy one-liner insight from the article + link. No filler. Make them click.",
    supportsLinks: true,
    delayMinutes: 0,
    format: "ig_feed",
  },
  fb_feed: {
    maxLength: 500,
    hashtagRange: [2, 4],
    style: "Conversational intro — share the key insight as if telling a friend. Include the link naturally mid-caption.",
    supportsLinks: true,
    delayMinutes: 15,
    format: "fb_feed",
  },
  linkedin: {
    maxLength: 1500,
    hashtagRange: [3, 5],
    style: "Professional thought leadership. Lead with a bold industry insight from the article. Share 2-3 key points. End with the link and a question for engagement.",
    supportsLinks: true,
    delayMinutes: 30,
    format: "linkedin",
  },
  instagram: {
    maxLength: 2200,
    hashtagRange: [8, 15],
    style: "Hook in the first line — the most compelling takeaway. Break into digestible lines. End with 'Link in bio' CTA. No inline links.",
    supportsLinks: false,
    delayMinutes: 60,
    format: "ig_feed",
  },
  pinterest: {
    maxLength: 500,
    hashtagRange: [0, 0],
    style: "SEO keyword-rich description of the article topic. Describe what the reader will learn. Focus on search discovery.",
    supportsLinks: true,
    delayMinutes: 90,
    format: "pinterest",
  },
  tiktok: {
    maxLength: 2200,
    hashtagRange: [3, 5],
    style: "Casual, hook-first. Stop the scroll. Tease the insight without giving it all away. 'Full article — link in bio.'",
    supportsLinks: false,
    delayMinutes: 120,
    format: "tiktok",
  },
  youtube: {
    maxLength: 5000,
    hashtagRange: [3, 5],
    style: "Descriptive community post sharing the article insight. Professional but approachable. Include the link.",
    supportsLinks: true,
    delayMinutes: 45,
    format: "youtube",
  },
};

/**
 * Promote a published blog post across all connected social accounts.
 * Creates platform-specific social posts with tailored captions.
 */
export async function promoteBlogPost(blogPostId: string): Promise<PromotionResult> {
  const result: PromotionResult = { blogPostId, postsCreated: 0, errors: [] };

  // Fetch blog post + site + playbook + blog settings
  const [post] = await sql`
    SELECT bp.id, bp.site_id, bp.title, bp.excerpt, bp.body, bp.tags,
           bp.og_image_url, bp.slug, bp.content_pillar,
           s.name AS site_name, s.blog_slug, s.brand_playbook, s.brand_voice,
           bs.subdomain, bs.custom_domain
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE bp.id = ${blogPostId} AND bp.status = 'published'
  `;

  if (!post) {
    result.errors.push("Blog post not found or not published");
    return result;
  }

  // Check if already promoted
  const [existing] = await sql`
    SELECT id FROM social_posts
    WHERE trigger_type = 'blog_publish' AND trigger_reference_id = ${blogPostId}
    LIMIT 1
  `;
  if (existing) {
    result.errors.push("Blog post already promoted");
    return result;
  }

  // Mark as promoting
  await sql`UPDATE blog_posts SET promotion_status = 'promoting' WHERE id = ${blogPostId}`;

  // Build blog URL
  const blogUrl = buildBlogUrl(post);

  // Fetch connected social accounts via site_social_links
  const accounts = await sql`
    SELECT sa.id, sa.platform, sa.account_name
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${post.site_id} AND sa.status = 'active'
  `;

  if (accounts.length === 0) {
    result.errors.push("No connected social accounts");
    await sql`UPDATE blog_posts SET promotion_status = 'failed' WHERE id = ${blogPostId}`;
    return result;
  }

  // Extract key takeaway from the article body for the caption prompt
  const keyTakeaway = await extractKeyTakeaway(post.title as string, (post.body as string) || "");

  const playbook = post.brand_playbook as BrandPlaybook | null;
  const promotionMeta: Record<string, unknown> = { posts: [] };

  // Map DB platform names to PLATFORM_CONFIG keys
  const platformMap: Record<string, string> = {
    facebook: "fb_feed",
    instagram: "instagram",
    twitter: "twitter",
    linkedin: "linkedin",
    pinterest: "pinterest",
    tiktok: "tiktok",
    youtube: "youtube",
  };

  for (const account of accounts) {
    const dbPlatform = account.platform as string;
    const platform = platformMap[dbPlatform] || dbPlatform;
    const config = PLATFORM_CONFIG[platform];
    if (!config) continue;

    try {
      // Generate platform-specific caption
      const { caption, hashtags } = await generatePromotionCaption({
        platform,
        config,
        title: post.title as string,
        excerpt: (post.excerpt as string) || "",
        keyTakeaway,
        blogUrl,
        siteName: post.site_name as string,
        tags: (post.tags as string[]) || [],
        playbook,
      });

      // Build full caption with hashtags
      const fullCaption = hashtags.length > 0
        ? `${caption}\n\n${hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`
        : caption;

      // Schedule with platform-specific delay
      const scheduledAt = new Date(Date.now() + config.delayMinutes * 60 * 1000).toISOString();

      const [socialPost] = await sql`
        INSERT INTO social_posts (
          account_id, caption, media_urls, link_url,
          content_pillar, status, scheduled_at,
          trigger_type, trigger_reference_id
        ) VALUES (
          ${account.id},
          ${fullCaption},
          ${post.og_image_url ? [post.og_image_url as string] : []},
          ${config.supportsLinks ? (await import("@/lib/utm")).blogArticleLink(blogUrl, account.platform as string) : null},
          ${(post.content_pillar as string) || null},
          'draft',
          ${scheduledAt},
          'blog_publish',
          ${blogPostId}
        )
        RETURNING id
      `;

      (promotionMeta.posts as Array<Record<string, unknown>>).push({
        platform,
        accountName: account.account_name,
        socialPostId: socialPost.id,
        scheduledAt,
      });

      result.postsCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${platform}: ${msg}`);
    }
  }

  // Update promotion status
  await sql`
    UPDATE blog_posts
    SET promotion_status = ${result.postsCreated > 0 ? "promoted" : "failed"},
        promotion_metadata = ${JSON.stringify(promotionMeta)}::jsonb
    WHERE id = ${blogPostId}
  `;

  return result;
}

/**
 * Build the public blog URL for a post.
 */
function buildBlogUrl(post: Record<string, unknown>): string {
  if (post.custom_domain) {
    return `https://${post.custom_domain}/${post.slug}`;
  }
  if (post.subdomain) {
    return `https://${post.subdomain}/${post.slug}`;
  }
  return publicBlogArticleUrl(String(post.blog_slug), String(post.slug));
}

/**
 * Extract the single most compelling takeaway from the article.
 * Used as the hook for promotional captions.
 */
async function extractKeyTakeaway(title: string, body: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Extract the single most compelling, specific insight from this article. One sentence, no fluff.

Title: ${title}
Article (first 1500 chars): ${body.slice(0, 1500)}

Return ONLY the one-sentence takeaway.`,
      }],
    });
    return response.content[0].type === "text" ? response.content[0].text.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Generate a platform-specific promotional caption.
 */
async function generatePromotionCaption({
  platform,
  config,
  title,
  excerpt,
  keyTakeaway,
  blogUrl,
  siteName,
  tags,
  playbook,
}: {
  platform: string;
  config: typeof PLATFORM_CONFIG[string];
  title: string;
  excerpt: string;
  keyTakeaway: string;
  blogUrl: string;
  siteName: string;
  tags: string[];
  playbook: BrandPlaybook | null;
}): Promise<{ caption: string; hashtags: string[] }> {
  const brandContext = playbook
    ? `Brand voice: ${playbook.brandPositioning?.selectedAngles?.[0]?.tone || "professional, engaging"}\nAudience language: ${playbook.audienceResearch?.languageMap?.painPhrases?.slice(0, 2).join("; ") || ""}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Write a social media post promoting this blog article. You are ${siteName} sharing your own expertise.

Article: "${title}"
Key insight: "${keyTakeaway}"
Summary: "${excerpt}"
Article URL: ${blogUrl}
Tags: ${tags.join(", ")}
${brandContext}

Platform: ${platform}
Style: ${config.style}
Max length: ${config.maxLength} characters
${config.supportsLinks ? "Include the article URL naturally in the caption." : "Do NOT include any URLs. Say 'link in bio' instead."}
Hashtags: ${config.hashtagRange[0]}-${config.hashtagRange[1]}

Position this as a thought leader sharing their own work — not curating someone else's content. Lead with the insight, not the fact that you published something.

Return ONLY JSON, no markdown: {"caption": "...", "hashtags": ["tag1", "tag2"]}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { caption: excerpt, hashtags: [] };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      caption: String(parsed.caption || excerpt),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
    };
  } catch {
    return { caption: excerpt, hashtags: [] };
  }
}
