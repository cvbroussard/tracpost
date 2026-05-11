import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

/**
 * Brand enrichment for the audio-first auto-tagging pipeline (#201).
 *
 * Per seed_and_enrich_principle: human commits identity (name), AI
 * completes schema (URL, description, category). Beta-pragmatic
 * approach: use Claude's training-data knowledge of brands rather
 * than web search. Claude knows the major brands subscribers will
 * mention (Brizo, Lacanche, Thermador, Calacatta, Crystal Cabinet
 * Works, etc.) without needing a search round-trip.
 *
 * Failure modes are non-fatal — the brand row exists usable from
 * the moment it's created (per the provenance play-by-play). This
 * just fills in the cosmetic fields when possible.
 */

const anthropic = new Anthropic();

interface EnrichResult {
  url: string | null;
  description: string | null;
  category: string | null;
  confidence: "high" | "medium" | "low";
}

/**
 * Enrich a brand row with URL, description, category from Claude's
 * training-data knowledge. Updates the brand row directly and stamps
 * enrichment_status + enrichment_metadata.
 *
 * Idempotent — checks status before running, skips if already enriched.
 */
export async function enrichBrand(brandId: string, brandName: string): Promise<void> {
  // Skip if already enriched. Primary check is the first-class
  // enriched_at column (migrate-114). enrichment_status string still
  // honored for explicit 'skipped' / 'failed' states the column can't
  // express on its own.
  const [current] = await sql`
    SELECT enrichment_status, enriched_at, url FROM brands WHERE id = ${brandId}
  `;
  if (!current) return;
  if (current.enriched_at) return; // already enriched at some point
  if (current.enrichment_status === "skipped") return;
  if (current.url) {
    // URL already set (manually) — skip enrichment, mark as such
    await sql`
      UPDATE brands SET enrichment_status = 'skipped', enriched_at = NOW()
      WHERE id = ${brandId}
    `;
    return;
  }

  await sql`
    UPDATE brands SET enrichment_attempts = enrichment_attempts + 1
    WHERE id = ${brandId}
  `;

  try {
    const result = await askClaudeAboutBrand(brandName);

    await sql`
      UPDATE brands
      SET
        url = ${result.url},
        description = COALESCE(brands.description, ${result.description}),
        enrichment_status = ${result.url ? "enriched" : "no_match"},
        enriched_at = NOW(),
        enrichment_metadata = ${JSON.stringify({
          category: result.category,
          confidence: result.confidence,
          enriched_at: new Date().toISOString(),
          provider: "claude-sonnet-4-6",
        })}::jsonb
      WHERE id = ${brandId}
    `;
  } catch (err) {
    await sql`
      UPDATE brands
      SET
        enrichment_status = 'failed',
        enrichment_metadata = ${JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          attempted_at: new Date().toISOString(),
        })}::jsonb
      WHERE id = ${brandId}
    `;
    throw err;
  }
}

async function askClaudeAboutBrand(brandName: string): Promise<EnrichResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = `What can you tell me about the brand "${brandName}"? This is a real-world business or product brand likely used by a contractor, kitchen remodeler, or service business.

Return ONLY valid JSON in this exact shape:
{
  "url": "https://example.com",
  "description": "1-2 sentence factual description of the brand",
  "category": "kitchen_fixtures | appliances | cabinetry | lighting | flooring | plumbing | hardware | tile | stone | other",
  "confidence": "high" | "medium" | "low"
}

Rules:
- URL must be the brand's primary website (homepage). Use https.
- Description should be factual, no marketing language.
- Category should be the closest fit from the list above.
- confidence="high" if you're certain this is a real brand and the URL is correct.
- confidence="low" if you're guessing — return null url in this case.
- If you don't recognize the brand at all, return: {"url": null, "description": null, "category": "other", "confidence": "low"}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as EnrichResult;

  // Refuse low-confidence URL claims to avoid pollution
  if (parsed.confidence === "low") {
    parsed.url = null;
  }

  return parsed;
}
