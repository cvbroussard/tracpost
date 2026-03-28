import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ timeout: 15000 });

interface GuardResult {
  pass: boolean;
  flags: string[];
}

/**
 * Automated content safety scan for generated blog posts.
 * Runs between generation and draft storage.
 *
 * Only flags content that would damage the business if published.
 * Not a fact-checker — a safety net for egregious issues.
 */
export async function scanContent(
  title: string,
  body: string,
  businessName: string
): Promise<GuardResult> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `You are a content safety reviewer for a local business blog. The business is "${businessName}".

Title: ${title}

Article (first 2000 chars):
${body.slice(0, 2000)}

ONLY flag content that would DAMAGE the business if published. Do NOT flag:
- General industry facts or historical claims (founding dates, origins, etc.) — these are acceptable even if imprecise
- Subjective quality claims ("best", "finest", "serious") — this is marketing
- Vendor/brand mentions — the business chose these partners intentionally

DO flag:
1. "inappropriate" — Violence, exploitation, sexual content, hate speech, discrimination
2. "pricing" — Specific dollar amounts ($80,000, $500/sq ft, "starting at $X")
3. "defamation" — Explicitly negative claims about a named competitor
4. "hallucinated_contact" — Phone numbers, email addresses, or street addresses in the article body (the AI likely invented these)
5. "off_topic" — Content completely unrelated to the business's industry
6. "medical_legal" — Specific medical, legal, or financial advice that creates liability

Return ONLY valid JSON, no markdown:
{"pass": true, "flags": []}

If flagging: {"pass": false, "flags": ["pricing: mentions $80,000 remodel cost"]}

When in doubt, PASS. False positives waste the subscriber's time.`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    // Extract just the JSON object — Haiku sometimes appends explanation text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { pass: true, flags: [] };
    const result = JSON.parse(jsonMatch[0]);

    return {
      pass: result.pass === true,
      flags: Array.isArray(result.flags) ? result.flags : [],
    };
  } catch (err) {
    console.warn(
      "Content guard scan failed — defaulting to pass:",
      err instanceof Error ? err.message : err
    );
    return { pass: true, flags: [] };
  }
}
