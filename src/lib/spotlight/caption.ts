import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface SpotlightCaptionInput {
  customerName: string | null;
  staffNote: string | null;
  siteName: string;
  brandVoice?: Record<string, unknown> | null;
  platform: string;
}

/**
 * Generate a social media shoutout caption for a Spotlight moment.
 * Returns { caption, hashtags }.
 */
export async function generateSpotlightCaption(input: SpotlightCaptionInput): Promise<{
  caption: string;
  hashtags: string[];
}> {
  const { customerName, staffNote, siteName, brandVoice, platform } = input;

  const brandContext = brandVoice
    ? `\nBrand voice: ${JSON.stringify(brandVoice)}`
    : "";

  const platformRules: Record<string, string> = {
    instagram: "Instagram: conversational, 3-5 hashtags, use emojis sparingly, hook in first line",
    facebook: "Facebook: warm and professional, 1-2 hashtags max, slightly longer form",
    twitter: "Twitter/X: concise, under 280 chars total including hashtags, 1-2 hashtags",
    linkedin: "LinkedIn: professional, celebratory, no emojis, 2-3 hashtags",
    threads: "Threads: casual and conversational, 1-2 hashtags, brief",
  };

  const prompt = `Generate a social media shoutout post for a customer at "${siteName}".

Customer name: ${customerName || "a valued customer"}
Context: ${staffNote || "Made a purchase"}
Platform: ${platformRules[platform] || "General social media: friendly and celebratory"}
${brandContext}

Write a celebratory, authentic post that:
- Celebrates the customer by name (if provided)
- References what they purchased or experienced (from context)
- Feels genuine, not corporate
- Makes the customer feel like a VIP
- Encourages others to visit
- Does NOT mention AI, automation, or Tracpost

Return JSON only:
{ "caption": "the post text without hashtags", "hashtags": ["#tag1", "#tag2"] }`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        caption: parsed.caption || "",
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      };
    }
  } catch { /* fall through */ }

  return { caption: text.trim(), hashtags: [] };
}
