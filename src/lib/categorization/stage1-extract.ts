/**
 * Stage 1 of the briefing-complete cascade — text-only NER + tag
 * suggestion from the asset's transcript.
 *
 * Per project_tracpost_asset_analysis_cascade memory:
 * - Cheap text Haiku call (~$0.005, ~1s)
 * - Output structures the input to Stage 2 (multimodal)
 * - Quality compounds: Stage 2 receives pre-extracted entities to
 *   ground its analysis in known nouns
 *
 * HARD CONTRACT — transcript required. Refuses to run without one.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface EntityRecord {
  text: string;
  context_excerpt: string;
  char_start: number;
  char_end: number;
}

interface LocationRecord extends EntityRecord {
  type: "city" | "neighborhood" | "street_address" | "landmark" | "state" | "region" | "unknown";
  geocodable: boolean;
  privacy_sensitive: boolean;
}

export interface Stage1Result {
  entities: {
    brands: EntityRecord[];
    projects: EntityRecord[];
    specialties: EntityRecord[];
    locations: LocationRecord[];
    materials: EntityRecord[];
  };
  suggested_tags: string[];
  cost: { input_tokens: number; output_tokens: number };
}

export type Stage1Outcome =
  | { status: "success"; result: Stage1Result }
  | { status: "skipped"; reason: "no_transcript" }
  | { status: "error"; error: string };

const SYSTEM_PROMPT = `You extract structured entities and tag suggestions from a media asset's transcript (operator/subscriber narration during briefing).

OUTPUT five entity arrays + suggested_tags. Each entity record has uniform fields plus type-specific extras for locations.

ENTITY DEFINITIONS:

- **brands** — Vendor / manufacturer / product brand mentions ("Marvin windows", "Benjamin Moore paint", "Sub-Zero refrigerator"). Use proper noun + product context as the signal. Don't extract generic terms (e.g., "windows" alone is NOT a brand).

- **projects** — Named projects the subscriber is talking about ("Shadyside Parlor Restoration", "Mitchell Kitchen Remodel"). Usually title-cased multi-word phrases, often preceded by "our" or possessive context. NOT the same as work themes.

- **specialties** — Granular work-themes the subscriber mentions ("architectural millwork", "heritage kitchen restoration", "furniture-grade lacquer finishing"). These are NARROWER than GBP categories — they capture the subscriber's specific positioning and craft language. Industry-agnostic concept.

- **locations** — Geographic references. Set type field to one of: city, neighborhood, street_address, landmark, state, region, unknown. Set geocodable=true if there's a unique resolvable geographic point. Set privacy_sensitive=true for street_address values (subscriber home or client home — caption generation must never include these).

- **materials** — Materials, finishes, techniques ("oak", "lacquer paint", "walnut burl", "granite countertops", "limewash"). Construction-domain nouns specific enough to matter for SEO/captioning.

ENTITY RECORD SHAPE (all entities):
{
  "text": "verbatim from transcript",
  "context_excerpt": "...~50 chars before and after, ellipses if truncated...",
  "char_start": <integer index in transcript where text starts>,
  "char_end": <integer index where text ends>
}

LOCATION RECORD SHAPE (additional fields):
{
  ..., "type": "city|neighborhood|street_address|landmark|state|region|unknown",
  "geocodable": true|false,
  "privacy_sensitive": true|false
}

SUGGESTED_TAGS — A short array of 3-8 tag candidates derived from the transcript's narrative content (themes, angles, distinctive phrases). These will inform downstream tag selection but aren't authoritative. Use lowercase snake_case.

CRITICAL RULES:

1. **NEVER INVENT** — only extract entities/tags genuinely present in the transcript. Empty arrays are fine.
2. **CHAR_START/CHAR_END must be accurate integer positions** in the transcript string (0-indexed). Used downstream for highlighting.
3. **CONTEXT_EXCERPT should include ~30 chars before and after** the match, joined with ellipses where the surrounding text exceeds that.
4. **DON'T over-extract** — return only entities you're confident about. Quality over quantity.
5. **LOCATIONS privacy_sensitive flag is load-bearing** — street_address must always set privacy_sensitive=true. City/neighborhood/state are NOT privacy_sensitive.

OUTPUT: Return ONLY a JSON object matching the shape. No prose, no markdown code fences. Strict JSON.`;

export async function runStage1(transcript: string): Promise<Stage1Outcome> {
  if (!transcript || !transcript.trim()) {
    return { status: "skipped", reason: "no_transcript" };
  }

  try {
    const userMessage = `=== TRANSCRIPT (${transcript.length} chars) ===\n\n${transcript}\n\n=== ASK ===\nExtract entities and suggested tags per the system prompt. Return the JSON object.`;

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned no JSON object");
    const parsed = JSON.parse(match[0]) as {
      entities?: Partial<Stage1Result["entities"]>;
      suggested_tags?: string[];
    };

    // Defensive normalization — LLM may omit empty arrays
    const result: Stage1Result = {
      entities: {
        brands: parsed.entities?.brands ?? [],
        projects: parsed.entities?.projects ?? [],
        specialties: parsed.entities?.specialties ?? [],
        locations: (parsed.entities?.locations ?? []) as LocationRecord[],
        materials: parsed.entities?.materials ?? [],
      },
      suggested_tags: parsed.suggested_tags ?? [],
      cost: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    };

    return { status: "success", result };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
