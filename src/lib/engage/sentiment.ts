/**
 * Sentiment classifier — LLM-based with rule-based fallback.
 *
 * analyzeSentiment(): Claude Haiku call. Catches sarcasm, negation, mixed
 *   sentiment, context. Returns label + confidence + rationale.
 *
 * quickSentiment(): legacy keyword/emoji rules. Used as fallback when the
 *   LLM call fails or ANTHROPIC_API_KEY is missing.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const POSITIVE_WORDS = new Set([
  "love", "loved", "amazing", "awesome", "fantastic", "great", "wonderful",
  "perfect", "excellent", "beautiful", "stunning", "incredible", "best",
  "thank", "thanks", "appreciate", "grateful", "happy", "thrilled", "excited",
  "recommend", "highly", "professional", "friendly", "helpful", "kind",
  "fabulous", "outstanding", "superb", "magnificent", "delightful", "fresh",
  "clean", "talented", "skilled", "passionate", "obsessed", "favorite",
  "❤️", "😍", "🔥", "👏", "🙌", "✨", "💯", "👍",
]);

const NEGATIVE_WORDS = new Set([
  "terrible", "awful", "horrible", "worst", "hate", "disappointed",
  "bad", "poor", "rude", "unprofessional", "dirty", "broken", "ruined",
  "scam", "fraud", "lied", "lying", "stolen", "scammed", "refund",
  "complaint", "angry", "frustrated", "unhappy", "regret", "avoid",
  "never", "wouldn't", "wouldnt", "shouldn't", "shouldnt", "don't",
  "expensive", "overpriced", "rude", "ignored", "waited", "waiting",
  "👎", "😡", "😤", "💔",
]);

export function quickSentiment(text: string): "positive" | "neutral" | "negative" {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);

  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  // Emoji check (not split by \W+)
  for (const emoji of POSITIVE_WORDS) {
    if (text.includes(emoji)) pos++;
  }
  for (const emoji of NEGATIVE_WORDS) {
    if (text.includes(emoji)) neg++;
  }

  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative";
  score: number;            // -1 (very negative) to 1 (very positive)
  rationale: string | null; // one short sentence; null if rule-based fallback
}

/**
 * LLM-based sentiment for a single comment/review/mention body.
 * Falls back to quickSentiment on any failure (missing key, network error,
 * unparseable response). Always resolves — never throws.
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!text || text.trim().length < 2) {
    return { sentiment: "neutral", score: 0, rationale: null };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const s = quickSentiment(text);
    return {
      sentiment: s,
      score: s === "positive" ? 0.7 : s === "negative" ? -0.7 : 0,
      rationale: null,
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Classify the sentiment of this customer comment toward the business it's directed at. Account for sarcasm, negation, mixed sentiment, and tone.

Comment: "${text.replace(/"/g, '\\"').slice(0, 1000)}"

Return ONLY JSON, no markdown:
{"sentiment":"positive|neutral|negative","score":<-1 to 1>,"rationale":"<one short sentence>"}`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const sentiment = parsed.sentiment as string;
    if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") {
      throw new Error(`unexpected sentiment value: ${sentiment}`);
    }
    const score = typeof parsed.score === "number" ? Math.max(-1, Math.min(1, parsed.score)) : 0;
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 200) : null;
    return { sentiment, score, rationale };
  } catch (err) {
    console.error("analyzeSentiment LLM failed, falling back to rules:", err instanceof Error ? err.message : err);
    const s = quickSentiment(text);
    return {
      sentiment: s,
      score: s === "positive" ? 0.7 : s === "negative" ? -0.7 : 0,
      rationale: null,
    };
  }
}
