import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface SuggestInput {
  reviewBody: string | null;
  rating: number | null;
  reviewerName: string | null;
  siteName: string | null;
  brandVoice?: Record<string, unknown> | null;
  brandPlaybook?: Record<string, unknown> | null;
}

const TONE_BY_RATING: Record<number, string> = {
  5: "Warm, grateful, and brief. Reference something specific from the review. Show genuine appreciation.",
  4: "Appreciative and acknowledging. Thank them and address any constructive feedback positively.",
  3: "Balanced and empathetic. Acknowledge the concern, highlight something positive, invite them to return.",
  2: "Professional and empathetic. Take responsibility, offer a path to resolution. Don't be defensive.",
  1: "Calm, professional, and empathetic. Apologize sincerely, don't argue, offer to resolve offline via email or phone.",
};

/**
 * Generate a suggested reply for a review using Claude.
 * Returns plain text, 2-4 sentences.
 */
export async function generateSuggestedReply(input: SuggestInput): Promise<string> {
  const { reviewBody, rating, reviewerName, siteName, brandVoice, brandPlaybook } = input;

  const toneGuidance = rating && TONE_BY_RATING[rating]
    ? TONE_BY_RATING[rating]
    : "Professional and friendly.";

  const brandContext = brandVoice
    ? `\nBrand voice: ${JSON.stringify(brandVoice)}`
    : "";

  const playbookTone = brandPlaybook && (brandPlaybook as Record<string, unknown>).brandPositioning
    ? `\nBrand positioning: ${JSON.stringify((brandPlaybook as Record<string, unknown>).brandPositioning)}`
    : "";

  const prompt = `You are writing a response to a customer review on behalf of "${siteName || "this business"}".

Review details:
- Rating: ${rating ? `${rating}/5 stars` : "No rating"}
- Reviewer: ${reviewerName || "A customer"}
- Review text: "${reviewBody || "(No text provided)"}"

Tone guidance: ${toneGuidance}
${brandContext}${playbookTone}

Write a response that is:
- 2-4 sentences
- Professional and human-sounding
- Specific to what they said (not generic)
- Does NOT mention AI or automation
- Uses the reviewer's first name if available
- Ends with an invitation to return or contact the business directly if the rating is 3 or below

Return ONLY the response text, no quotes, no JSON, no preamble.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim();
}
