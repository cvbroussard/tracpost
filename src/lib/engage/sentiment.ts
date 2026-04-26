/**
 * Quick rule-based sentiment classifier. Good enough for v1.
 * Upgrade to LLM-based classification later if accuracy matters.
 */
import "server-only";

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
