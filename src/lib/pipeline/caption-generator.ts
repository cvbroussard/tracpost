import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { PlatformFormat } from "./types";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
// Personas retired 2026-05-19. Identity attribution now lives verbatim
// in the transcript; caption gen reads transcript directly (or passes
// it to LLM) rather than reading a separate persona context layer.

const anthropic = new Anthropic();

interface CaptionRequest {
  postId: string;
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  platform: PlatformFormat;
}

/**
 * Platform-specific constraints for caption generation.
 */
const PLATFORM_RULES: Record<string, { maxLength: number; hashtagRange: [number, number]; style: string }> = {
  ig_feed: {
    maxLength: 2200,
    hashtagRange: [8, 15],
    style: "Conversational, hook in the first line. Line breaks between ideas. CTA at the end.",
  },
  ig_reel: {
    maxLength: 2200,
    hashtagRange: [5, 10],
    style: "Short and punchy. First line is the hook that matches the video content. Keep it under 150 chars for visibility.",
  },
  ig_story: {
    maxLength: 200,
    hashtagRange: [0, 3],
    style: "Ultra-brief. One line, maybe two. This overlays on the image/video.",
  },
  youtube: {
    maxLength: 5000,
    hashtagRange: [3, 5],
    style: "Descriptive title + paragraph description. Include timestamps if applicable. End with subscribe CTA.",
  },
  youtube_short: {
    maxLength: 100,
    hashtagRange: [3, 5],
    style: "Very short, attention-grabbing. Similar to ig_reel.",
  },
  gbp: {
    maxLength: 1500,
    hashtagRange: [0, 0],
    style: "Professional, local-focused. Include city name and service keywords. End with booking CTA and link.",
  },
  fb_feed: {
    maxLength: 63206,
    hashtagRange: [3, 5],
    style: "Conversational and engaging. Slightly longer than Instagram. Ask a question or share a story. CTA to comment or share.",
  },
  fb_reel: {
    maxLength: 2200,
    hashtagRange: [3, 5],
    style: "Short, punchy hook. Similar to ig_reel but can reference the Facebook Page or community.",
  },
  tiktok: {
    maxLength: 2200,
    hashtagRange: [3, 5],
    style: "Casual, trending tone. Hook in the first line — stop the scroll. Use popular format patterns. Include relevant trending hashtags.",
  },
  twitter: {
    maxLength: 280,
    hashtagRange: [1, 2],
    style: "Concise and punchy. One clear thought. No filler words. Optional question to drive replies.",
  },
  linkedin: {
    maxLength: 3000,
    hashtagRange: [3, 5],
    style: "Professional and insightful. Lead with a bold statement or industry observation. Share a lesson or result. End with a question to drive engagement.",
  },
  pinterest: {
    maxLength: 500,
    hashtagRange: [0, 0],
    style: "Keyword-rich description for search discovery. Describe what the image shows and why it matters. Include the website link context.",
  },
};

/**
 * Generate a caption for a scheduled post using Claude.
 *
 * Reads the post, its source asset, the site's brand_voice,
 * and the platform rules to generate an appropriate caption.
 */
export async function generateCaption({ postId }: CaptionRequest): Promise<CaptionResult> {
  // Fetch post + asset + site in one chain
  const [post] = await sql`
    SELECT sp.id, sp.account_id, sp.content_pillar, sp.media_type, sp.slot_id,
           sa.platform, sa.account_name, ssl.business_id,
           s.name AS site_name, s.url AS site_url, s.brand_voice,
           s.brand_playbook,
           ma.context_note, ma.transcription, ma.ai_analysis, ma.metadata AS asset_metadata,
           ma.media_type AS asset_media_type, ma.source AS asset_source
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    JOIN businesses s ON ssl.business_id = s.id
    LEFT JOIN media_assets ma ON sp.source_asset_id = ma.id
    WHERE sp.id = ${postId}
  `;

  if (!post) throw new Error(`Post ${postId} not found`);

  // Determine platform format from slot or account
  let platformFormat: PlatformFormat = "ig_feed";
  if (post.slot_id) {
    const [slot] = await sql`
      SELECT platform FROM publishing_slots WHERE id = ${post.slot_id}
    `;
    if (slot) platformFormat = slot.platform as PlatformFormat;
  } else {
    // Infer from account platform + media type
    const p = post.platform as string;
    if (p === "instagram") {
      platformFormat = post.asset_media_type?.startsWith("video") ? "ig_reel" : "ig_feed";
    } else if (p === "facebook") {
      platformFormat = (post.asset_media_type?.startsWith("video") ? "fb_reel" : "fb_feed") as PlatformFormat;
    } else if (p === "youtube") {
      platformFormat = "youtube";
    } else if (p === "gbp") {
      platformFormat = "gbp";
    }
  }

  const rules = PLATFORM_RULES[platformFormat] || PLATFORM_RULES.ig_feed;
  const brandVoice = (post.brand_voice || {}) as Record<string, unknown>;
  const playbook = post.brand_playbook as BrandPlaybook | null;

  // Pull a hook from the bank if playbook exists
  let hookText: string | undefined;
  if (playbook && post.business_id) {
    const [hook] = await sql`
      SELECT text FROM hook_bank
      WHERE business_id = ${post.business_id}
      ORDER BY CASE rating WHEN 'loved' THEN 0 ELSE 1 END, used_count ASC, RANDOM()
      LIMIT 1
    `;
    if (hook) {
      hookText = hook.text;
      await sql`
        UPDATE hook_bank SET used_count = used_count + 1, last_used_at = NOW()
        WHERE business_id = ${post.business_id} AND text = ${hook.text}
      `;
    }
  }

  // Check if this is an RSS-sourced link post
  const isRssContent = post.asset_source === "rss" && post.asset_media_type === "link";
  const rssMetadata = isRssContent
    ? (post.asset_metadata as Record<string, unknown>) || {}
    : null;

  const prompt = isRssContent
    ? buildRssPrompt(post, platformFormat, rules, playbook, rssMetadata)
    : playbook
      ? buildPlaybookPrompt(post, platformFormat, rules, playbook, hookText)
      : buildPrompt(post, platformFormat, rules, brandVoice);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse response — expect JSON { caption, hashtags }
  const parsed = parseResponse(text, rules);

  // Persist caption + hashtags on the post
  await sql`
    UPDATE social_posts
    SET caption = ${parsed.caption}, hashtags = ${parsed.hashtags}
    WHERE id = ${postId}
  `;

  return {
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    platform: platformFormat,
  };
}

function buildPlaybookPrompt(
  post: Record<string, unknown>,
  platform: PlatformFormat,
  rules: (typeof PLATFORM_RULES)[string],
  playbook: BrandPlaybook,
  hookText?: string,
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;

  const parts: string[] = [];

  parts.push("You are an expert social media content writer using brand intelligence to create high-performing captions.");
  parts.push("");
  parts.push("## Brand Intelligence");
  parts.push(`Site: ${post.site_name} (${post.site_url})`);
  parts.push(`Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}`);
  parts.push(`Tone: ${angle?.tone || "engaging"}`);
  parts.push(`Emotional core: ${offerCore.offerStatement.emotionalCore}`);
  parts.push("");
  parts.push("## Audience Language (use THESE phrases, not marketing speak)");
  parts.push(`Pain phrases: ${lang.painPhrases.join(", ")}`);
  parts.push(`Desire phrases: ${lang.desirePhrases.join(", ")}`);
  parts.push(`Emotional triggers: ${lang.emotionalTriggers.join(", ")}`);

  if (hookText) {
    parts.push("");
    parts.push(`## Hook to incorporate`);
    parts.push(`Weave this hook naturally into the caption opening: "${hookText}"`);
  }

  parts.push("");
  parts.push("## Content");
  parts.push(`Content pillar: ${post.content_pillar || "general"}`);
  parts.push(`Media type: ${post.asset_media_type || post.media_type || "image"}`);
  if (post.context_note) parts.push(`Context: "${post.context_note}"`);
  if (post.transcription) parts.push(`Transcription: "${post.transcription}"`);

  const analysis = post.ai_analysis as Record<string, unknown> | null;
  if (analysis?.description) {
    parts.push(`Visual: ${analysis.description}`);
  }

  parts.push("");
  parts.push("## Platform Rules");
  parts.push(`Platform: ${platform}`);
  parts.push(`Max length: ${rules.maxLength} chars`);
  parts.push(`Hashtags: ${rules.hashtagRange[0]}–${rules.hashtagRange[1]}`);
  parts.push(`Style: ${rules.style}`);

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push('{ "caption": "...", "hashtags": ["#tag1", "#tag2"] }');
  parts.push("");
  parts.push("Rules:");
  parts.push("- Use the audience's language, not generic marketing copy");
  parts.push("- First line must stop the scroll — lead with the hook or a pain/desire phrase");
  parts.push("- Do not include hashtags inside the caption text");
  if (platform === "tiktok" || platform === "ig_reel") {
    parts.push("- Optimize for platform SEARCH — use terms people search for on this platform");
  }

  return parts.join("\n");
}

function buildPrompt(
  post: Record<string, unknown>,
  platform: PlatformFormat,
  rules: (typeof PLATFORM_RULES)[string],
  brandVoice: Record<string, unknown>,
): string {
  const parts: string[] = [];

  parts.push("You are a social media content writer. Generate a caption for a social media post.");
  parts.push("");
  parts.push("## Brand");
  parts.push(`Site: ${post.site_name} (${post.site_url})`);
  if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
  if (brandVoice.keywords) parts.push(`Keywords to weave in naturally: ${(brandVoice.keywords as string[]).join(", ")}`);
  if (brandVoice.avoid) parts.push(`Words/phrases to avoid: ${(brandVoice.avoid as string[]).join(", ")}`);

  parts.push("");
  parts.push("## Content");
  parts.push(`Content pillar: ${post.content_pillar || "general"}`);
  parts.push(`Media type: ${post.asset_media_type || post.media_type || "image"}`);
  if (post.context_note) parts.push(`Context from the creator: "${post.context_note}"`);
  if (post.transcription) parts.push(`Audio transcription: "${post.transcription}"`);

  const analysis = post.ai_analysis as Record<string, unknown> | null;
  if (analysis && Object.keys(analysis).length > 0) {
    parts.push(`AI analysis of the asset: ${JSON.stringify(analysis)}`);
  }

  parts.push("");
  parts.push("## Platform rules");
  parts.push(`Platform: ${platform}`);
  parts.push(`Max caption length: ${rules.maxLength} characters`);
  parts.push(`Hashtag count: ${rules.hashtagRange[0]}–${rules.hashtagRange[1]}`);
  parts.push(`Style: ${rules.style}`);

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push('{ "caption": "...", "hashtags": ["#tag1", "#tag2"] }');
  parts.push("");
  parts.push("Do not include hashtags inside the caption text. They go in the hashtags array only.");

  return parts.join("\n");
}

function buildRssPrompt(
  post: Record<string, unknown>,
  platform: PlatformFormat,
  rules: (typeof PLATFORM_RULES)[string],
  playbook: BrandPlaybook | null,
  rssMetadata: Record<string, unknown> | null
): string {
  const parts: string[] = [];

  parts.push("You are a social media content writer. Write a social post sharing an article that is relevant to this business.");
  parts.push("");
  parts.push("## Business");
  parts.push(`Name: ${post.site_name} (${post.site_url})`);

  if (playbook) {
    const angle = playbook.brandPositioning.selectedAngles[0];
    parts.push(`Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}`);
    parts.push(`Tone: ${angle?.tone || "engaging"}`);
  }

  parts.push("");
  parts.push("## Article to share");
  const contextNote = (post.context_note as string) || "";
  const articleTitle = contextNote.replace(/^\[RSS\]\s*/, "");
  parts.push(`Title: ${articleTitle}`);

  if (rssMetadata?.source_excerpt) {
    parts.push(`Excerpt: ${rssMetadata.source_excerpt}`);
  }
  if (rssMetadata?.source_url) {
    parts.push(`Link: ${rssMetadata.source_url}`);
  }

  parts.push("");
  parts.push("## Platform Rules");
  parts.push(`Platform: ${platform}`);
  parts.push(`Max length: ${rules.maxLength} chars`);
  parts.push(`Hashtags: ${rules.hashtagRange[0]}–${rules.hashtagRange[1]}`);
  parts.push(`Style: ${rules.style}`);

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push('{ "caption": "...", "hashtags": ["#tag1", "#tag2"] }');
  parts.push("");
  parts.push("Rules:");
  parts.push("- Position the business as an industry expert sharing valuable content");
  parts.push("- Add a brief opinion or takeaway from the article");
  parts.push("- Encourage followers to read the article");
  parts.push("- Do not include hashtags inside the caption text");
  parts.push("- Include the article link naturally in the caption");

  return parts.join("\n");
}

function parseResponse(
  text: string,
  rules: (typeof PLATFORM_RULES)[string]
): { caption: string; hashtags: string[] } {
  // Strip markdown fencing if present
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    let caption = String(parsed.caption || "").slice(0, rules.maxLength);
    let hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map(String).slice(0, rules.hashtagRange[1])
      : [];

    // Ensure hashtags have # prefix
    hashtags = hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`));

    return { caption, hashtags };
  } catch {
    // Fallback: use the raw text as caption
    return {
      caption: text.slice(0, rules.maxLength),
      hashtags: [],
    };
  }
}

// ─── Compose path: anchor-aware, non-persisting caption generation ───
//
// The autopilot path (`generateCaption`) is post-centric: it reads a
// social_posts row, infers everything from its source asset, and writes
// the result back to the row. Compose has different shape: the
// subscriber picked an anchor (Topic) before any post row exists, and
// the resulting caption seeds the form for review/edit. It MUST NOT
// persist anything — publish path handles that.
//
// This shares `PLATFORM_RULES`, `parseResponse`, and the same Anthropic
// client. The prompt is tailored to the anchor-first paradigm: the
// caption's job is to tease the linked anchor URL.

export type ComposeAnchorInput = {
  type: "blog_post" | "project";
  title: string | null;
  excerpt: string | null;
  contentPillar: string | null;
  articleTags: string[];
};

export type ComposeHeroInput = {
  mediaType: string | null;
  contextNote: string | null;
  aiAnalysis: Record<string, unknown> | null;
} | null;

/**
 * Map a Compose template's (platform, format) tuple onto the
 * PLATFORM_RULES key the caption generator already knows about.
 */
export function templateToPlatformFormat(
  platform: string,
  format: string,
): PlatformFormat {
  const key = `${platform}_${format}`;
  const map: Record<string, PlatformFormat> = {
    facebook_single_image: "fb_feed",
    facebook_carousel: "fb_feed",
    facebook_video: "fb_feed",
    facebook_reel: "fb_reel",
    instagram_single_image: "ig_feed",
    instagram_carousel: "ig_feed",
    instagram_reel: "ig_reel",
    instagram_story: "ig_story",
    pinterest_tall_pin: "pinterest",
    blog_article: "ig_feed", // unused in practice; safe fallback
  };
  return map[key] || "ig_feed";
}

/**
 * Generate a Compose caption + hashtag set in the site's brand voice,
 * tailored to the anchor (Topic) the subscriber picked.
 *
 * Returns {caption, hashtags}. Does not persist. Failures throw so the
 * caller can fall back to the static stub.
 */
export async function composeAnchorCaption(opts: {
  siteId: string;
  platformFormat: PlatformFormat;
  anchor: ComposeAnchorInput;
  hero: ComposeHeroInput;
  link: string | null;
}): Promise<{ caption: string; hashtags: string[] }> {
  const { siteId, platformFormat, anchor, hero, link } = opts;

  const [site] = await sql`
    SELECT name, url, brand_voice, brand_playbook
    FROM businesses
    WHERE id = ${siteId}
  `;
  if (!site) throw new Error(`Site ${siteId} not found`);

  const rules = PLATFORM_RULES[platformFormat] || PLATFORM_RULES.ig_feed;
  const playbook = site.brand_playbook as BrandPlaybook | null;
  const brandVoice = (site.brand_voice || {}) as Record<string, unknown>;

  const prompt = buildAnchorPrompt({
    siteName: String(site.name || ""),
    siteUrl: String(site.url || ""),
    platform: platformFormat,
    rules,
    playbook,
    brandVoice,
    anchor,
    hero,
    link,
  });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseResponse(text, rules);
}

function buildAnchorPrompt(args: {
  siteName: string;
  siteUrl: string;
  platform: PlatformFormat;
  rules: (typeof PLATFORM_RULES)[string];
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  anchor: ComposeAnchorInput;
  hero: ComposeHeroInput;
  link: string | null;
}): string {
  const { siteName, siteUrl, platform, rules, playbook, brandVoice, anchor, hero, link } = args;
  const parts: string[] = [];

  parts.push("You write social captions whose single job is to make people click the linked URL. The post is a vehicle; the linked page is the destination.");
  parts.push("");
  parts.push("## Brand");
  parts.push(`Site: ${siteName} (${siteUrl})`);
  if (playbook) {
    const angle = playbook.brandPositioning?.selectedAngles?.[0];
    const lang = playbook.audienceResearch?.languageMap;
    if (angle) {
      parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
      parts.push(`Tone: ${angle.tone || "engaging"}`);
    }
    if (playbook.offerCore?.offerStatement?.emotionalCore) {
      parts.push(`Emotional core: ${playbook.offerCore.offerStatement.emotionalCore}`);
    }
    if (lang) {
      parts.push("");
      parts.push("## Audience language (use these phrases, not marketing speak)");
      if (lang.painPhrases?.length) parts.push(`Pain phrases: ${lang.painPhrases.join(", ")}`);
      if (lang.desirePhrases?.length) parts.push(`Desire phrases: ${lang.desirePhrases.join(", ")}`);
      if (lang.emotionalTriggers?.length) parts.push(`Emotional triggers: ${lang.emotionalTriggers.join(", ")}`);
    }
  } else {
    if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
    if (Array.isArray(brandVoice.keywords)) parts.push(`Keywords: ${(brandVoice.keywords as string[]).join(", ")}`);
    if (Array.isArray(brandVoice.avoid)) parts.push(`Avoid: ${(brandVoice.avoid as string[]).join(", ")}`);
  }

  parts.push("");
  parts.push("## Topic the post points at");
  parts.push(`Type: ${anchor.type === "blog_post" ? "article" : "project page"}`);
  if (anchor.title) parts.push(`Title: "${anchor.title}"`);
  if (anchor.excerpt) parts.push(`Excerpt: "${anchor.excerpt}"`);
  if (anchor.contentPillar) parts.push(`Content pillar: ${anchor.contentPillar}`);
  if (anchor.articleTags.length > 0) {
    parts.push(`Article tags (use as concept inspiration, NOT as caption keywords): ${anchor.articleTags.join(", ")}`);
  }
  if (link) parts.push(`Link: ${link}`);

  if (hero) {
    parts.push("");
    parts.push("## Visual being shown");
    parts.push(`Media type: ${hero.mediaType || "image"}`);
    if (hero.contextNote) parts.push(`Context: "${hero.contextNote}"`);
    if (hero.aiAnalysis?.description) parts.push(`Visual: ${String(hero.aiAnalysis.description)}`);
  }

  parts.push("");
  parts.push("## Platform rules");
  parts.push(`Platform: ${platform}`);
  parts.push(`Max length: ${rules.maxLength} chars`);
  parts.push(`Hashtags: ${rules.hashtagRange[0]}–${rules.hashtagRange[1]}`);
  parts.push(`Style: ${rules.style}`);

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push('{ "caption": "...", "hashtags": ["#PascalCaseTag", "..."] }');
  parts.push("");
  parts.push("Rules:");
  parts.push("- First line stops the scroll — hook tied to the topic, not generic");
  parts.push("- Tease the linked page; don't summarize it");
  const isFeedLike = platform === "fb_feed" || platform === "linkedin" || platform === "twitter" || platform === "gbp";
  if (isFeedLike && link) {
    parts.push("- Include the link in the caption text (Feed/LinkedIn/Twitter/GBP render inline links)");
  } else if (link) {
    parts.push("- Do NOT include the link in the caption text — Reel/Story/IG-feed surfaces don't render inline links well; the link goes in the post's link field separately");
  }
  parts.push("- Hashtags PascalCase (#KitchenDesign not #kitchendesign), in the hashtags array NOT in the caption text");
  parts.push("- Use the audience's actual language, not marketing speak");

  return parts.join("\n");
}

/**
 * Generate captions for all scheduled posts that don't have one yet.
 */
export async function generateMissingCaptions(siteId: string): Promise<number> {
  const posts = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId}
      AND sp.status = 'scheduled'
      AND sp.caption IS NULL
    ORDER BY sp.scheduled_at ASC
    LIMIT 20
  `;

  let generated = 0;
  for (const post of posts) {
    try {
      await generateCaption({ postId: post.id });
      generated++;
    } catch (err) {
      console.error(`Caption generation failed for post ${post.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return generated;
}
