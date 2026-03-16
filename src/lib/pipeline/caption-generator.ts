import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { PlatformFormat } from "./types";

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
           sa.platform, sa.account_name,
           s.name AS site_name, s.url AS site_url, s.brand_voice,
           ma.context_note, ma.transcription, ma.ai_analysis, ma.media_type AS asset_media_type
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN sites s ON sa.site_id = s.id
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

  const prompt = buildPrompt(post, platformFormat, rules, brandVoice);

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

function buildPrompt(
  post: Record<string, unknown>,
  platform: PlatformFormat,
  rules: (typeof PLATFORM_RULES)[string],
  brandVoice: Record<string, unknown>
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

/**
 * Generate captions for all scheduled posts that don't have one yet.
 */
export async function generateMissingCaptions(siteId: string): Promise<number> {
  const posts = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sa.site_id = ${siteId}
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
