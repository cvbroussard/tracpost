/**
 * Brand DNA signal extractor.
 *
 * Reads pulled platform data (historical_posts, engagement_events, gbp_profile)
 * and produces a structured BrandSignals object that downstream brand-DNA
 * generation consumes as evidence (not as template).
 *
 * Two Haiku calls:
 *   1. Voice + topical profile from captions
 *   2. Customer-voice profile from positive reviews
 *
 * Plus deterministic exemplar/anti-exemplar selection by engagement.
 *
 * Skips automatically for minimal-tier sites (caller decides via score).
 */
import "server-only";
import { sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface BrandSignals {
  // Style profile — how they communicate
  voice: {
    tone: string;             // e.g., "casual, lowercase, conversational"
    length_pattern: string;   // e.g., "1-2 sentences, occasionally longer"
    emoji_use: string;        // e.g., "heavy, used as sentence punctuation"
    hashtag_use: string;      // e.g., "rare, only 1-2 when used"
    casing: string;           // e.g., "lowercase throughout, sometimes Capitalized for emphasis"
    sign_offs: string[];      // recurring closing patterns
    distinctive_traits: string[]; // 3-5 specific quirks
  };
  // Topical profile — what they actually talk about
  topics: {
    primary_themes: string[];    // 3-5 dominant topics
    secondary_themes: string[];  // 3-5 less-frequent but recurring
    notably_absent: string[];    // category-typical topics they DON'T cover
  };
  // Customer-voice — language used in reviews about them
  customer_voice: {
    repeated_descriptors: string[];  // adjectives customers use
    outcomes_mentioned: string[];    // results/benefits customers cite
    common_phrases: string[];        // characteristic phrasings
    tone: string;                    // how customers talk about the brand
  };
  // Curated exemplars
  exemplars: {
    top_resonant: Array<{ caption: string; engagement: number; posted_at: string | null }>;
    flat_outcomes: Array<{ caption: string; engagement: number; posted_at: string | null }>;
  };
  // Provenance
  source_counts: {
    captions_analyzed: number;
    reviews_analyzed: number;
    site_id: string;
    extracted_at: string;
  };
}

const TOP_EXEMPLAR_COUNT = 5;
const FLAT_EXEMPLAR_COUNT = 3;
const MAX_CAPTIONS_FOR_LLM = 50;
const MAX_REVIEWS_FOR_LLM = 25;

function parseJsonStrict<T>(raw: string, label: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`${label}: no JSON object in response`);
  return JSON.parse(match[0]) as T;
}

async function extractVoiceAndTopics(captions: Array<{ caption: string; engagement: number }>): Promise<{ voice: BrandSignals["voice"]; topics: BrandSignals["topics"] }> {
  const sample = captions.slice(0, MAX_CAPTIONS_FOR_LLM)
    .map((c, i) => `[${i + 1}] (${c.engagement} eng) ${c.caption.slice(0, 400)}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are analyzing a business's social media captions to extract their authentic communication style. The output will inform brand-DNA generation — your job is OBJECTIVE OBSERVATION, not advice.

Captions (${captions.length} total, showing up to ${MAX_CAPTIONS_FOR_LLM}):

${sample}

Return ONLY JSON, no markdown:
{
  "voice": {
    "tone": "<one phrase: e.g. 'casual and conversational' or 'expert and direct' or 'playful and emoji-heavy'>",
    "length_pattern": "<observation about caption length: e.g. '1-2 sentences, mostly short' or 'long-form, often 3+ paragraphs'>",
    "emoji_use": "<frequency and pattern: 'heavy, often as sentence punctuation' / 'sparse, decorative only' / 'none'>",
    "hashtag_use": "<frequency: 'no hashtags' / 'rare, 1-2 when used' / 'heavy, 10+ per post'>",
    "casing": "<observation: 'lowercase throughout' / 'standard sentence case' / 'all caps for emphasis'>",
    "sign_offs": ["<recurring closing patterns, max 3>"],
    "distinctive_traits": ["<3-5 specific quirks that make this voice recognizable>"]
  },
  "topics": {
    "primary_themes": ["<3-5 dominant topics across the captions>"],
    "secondary_themes": ["<3-5 less-frequent but recurring topics>"],
    "notably_absent": ["<2-3 topics this category usually covers but THIS brand doesn't, max 3>"]
  }
}`,
    }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJsonStrict(raw, "voice+topics");
}

async function extractCustomerVoice(reviews: Array<{ body: string; star_rating: string | null }>): Promise<BrandSignals["customer_voice"]> {
  if (reviews.length === 0) {
    return {
      repeated_descriptors: [],
      outcomes_mentioned: [],
      common_phrases: [],
      tone: "no reviews captured",
    };
  }
  const sample = reviews.slice(0, MAX_REVIEWS_FOR_LLM)
    .map((r, i) => `[${i + 1}] (${r.star_rating || "?"}★) ${r.body.slice(0, 600)}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are analyzing customer reviews of a business to extract the language customers use. The output will inform brand-DNA generation — your job is OBJECTIVE OBSERVATION, not advice.

Reviews:

${sample}

Return ONLY JSON, no markdown:
{
  "repeated_descriptors": ["<adjectives customers use repeatedly to describe the business — max 8>"],
  "outcomes_mentioned": ["<concrete results/benefits customers cite — max 6>"],
  "common_phrases": ["<characteristic phrasings that appear multiple times — max 5>"],
  "tone": "<one phrase: how customers talk about this brand, e.g. 'enthusiastic and grateful' or 'matter-of-fact and detail-oriented'>"
}`,
    }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJsonStrict(raw, "customer_voice");
}

export async function extractBrandSignals(siteId: string): Promise<BrandSignals> {
  // Quality captions for voice/topic analysis (same filter as scorer)
  const captionRows = await sql`
    SELECT caption,
           COALESCE(like_count, 0) + COALESCE(comment_count, 0) AS engagement,
           posted_at
    FROM historical_posts
    WHERE site_id = ${siteId}
      AND caption IS NOT NULL
      AND length(caption) >= 15
      AND COALESCE(like_count, 0) + COALESCE(comment_count, 0) >= 3
      AND (posted_at IS NULL OR posted_at >= NOW() - INTERVAL '18 months')
      AND hidden_at IS NULL
    ORDER BY (COALESCE(like_count, 0) + COALESCE(comment_count, 0)) DESC
  `;
  const captions = captionRows.map(r => ({
    caption: r.caption as string,
    engagement: Number(r.engagement),
    posted_at: r.posted_at ? (r.posted_at as Date).toISOString() : null,
  }));

  // Positive review bodies
  const reviewRows = await sql`
    SELECT body, metadata->>'star_rating' AS star_rating
    FROM engagement_events
    WHERE site_id = ${siteId}
      AND platform = 'gbp'
      AND event_type = 'review'
      AND body IS NOT NULL
      AND length(body) >= 30
      AND (metadata->>'star_rating' IN ('FOUR', 'FIVE') OR sentiment = 'positive')
    ORDER BY occurred_at DESC
    LIMIT ${MAX_REVIEWS_FOR_LLM}
  `;
  const reviews = reviewRows.map(r => ({
    body: r.body as string,
    star_rating: (r.star_rating as string | null) || null,
  }));

  // Run both extractions in parallel
  const [voiceTopics, customerVoice] = await Promise.all([
    captions.length > 0
      ? extractVoiceAndTopics(captions)
      : Promise.resolve({
          voice: { tone: "no captions captured", length_pattern: "", emoji_use: "", hashtag_use: "", casing: "", sign_offs: [], distinctive_traits: [] },
          topics: { primary_themes: [], secondary_themes: [], notably_absent: [] },
        }),
    extractCustomerVoice(reviews),
  ]);

  // Deterministic exemplar selection
  const sortedByEngagement = [...captions].sort((a, b) => b.engagement - a.engagement);
  const top_resonant = sortedByEngagement.slice(0, TOP_EXEMPLAR_COUNT);
  const flat_outcomes = sortedByEngagement.slice(-FLAT_EXEMPLAR_COUNT).reverse();

  return {
    voice: voiceTopics.voice,
    topics: voiceTopics.topics,
    customer_voice: customerVoice,
    exemplars: { top_resonant, flat_outcomes },
    source_counts: {
      captions_analyzed: captions.length,
      reviews_analyzed: reviews.length,
      site_id: siteId,
      extracted_at: new Date().toISOString(),
    },
  };
}
