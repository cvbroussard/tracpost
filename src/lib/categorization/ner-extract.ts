/**
 * NER extraction pass — text-only entity recognition on the asset's
 * transcript. Internal helper called by cascade-analyze.ts.
 *
 * Single-purpose: cheap Haiku call (~$0.005, ~1s) extracts structured
 * entities + tag suggestions from the transcript. Its output anchors
 * the multimodal vision pass that follows, reducing hallucination by
 * giving the vision model pre-resolved nouns to reason about.
 *
 * HARD CONTRACT — transcript required. Refuses without one.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface EntityRecord {
  text: string;
  context_excerpt: string;
  char_start: number;
  char_end: number;
}

export interface NerEntities {
  brands: EntityRecord[];
  specialties: EntityRecord[];
  materials: EntityRecord[];
}

export interface NerResult {
  entities: NerEntities;
  suggested_tags: string[];
  cost: { input_tokens: number; output_tokens: number };
}

export type NerOutcome =
  | { status: "success"; result: NerResult }
  | { status: "skipped"; reason: "no_transcript" }
  | { status: "error"; error: string };

export const NER_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You extract structured entities and tag suggestions from a media asset's transcript (operator/subscriber narration during briefing).

OUTPUT three entity arrays + suggested_tags. Each entity record has uniform fields.

ENTITY DEFINITIONS:

- **brands** — Vendor / manufacturer / product brand mentions ("Marvin windows", "Benjamin Moore paint", "Sub-Zero refrigerator"). Use proper noun + product context as the signal. Don't extract generic terms (e.g., "windows" alone is NOT a brand).

- **specialties** — Granular work-themes the subscriber mentions ("architectural millwork", "heritage kitchen restoration", "furniture-grade lacquer finishing"). These are NARROWER than GBP categories — they capture the subscriber's specific positioning and craft language. Industry-agnostic concept.

- **materials** — Materials, finishes, techniques ("oak", "lacquer paint", "walnut burl", "granite countertops", "limewash"). Construction-domain nouns specific enough to matter for SEO/captioning.

DO NOT EXTRACT "projects" or "locations":
- Project membership is set by the subscriber at upload time, not inferred from the transcript.
- Geographic references (cities, neighborhoods, addresses) are handled by a separate matcher that binds against the subscriber's GBP-declared service areas. If you see geography in the transcript, IGNORE it.

ENTITY RECORD SHAPE (all entities):
{
  "text": "verbatim from transcript",
  "context_excerpt": "...~50 chars before and after, ellipses if truncated...",
  "char_start": <integer index in transcript where text starts>,
  "char_end": <integer index where text ends>
}

SUGGESTED_TAGS — A short array of 3-8 tag candidates derived from the transcript's narrative content (themes, angles, distinctive phrases). These will inform downstream tag selection but aren't authoritative. Use lowercase snake_case.

OUTPUT SHAPE (strict — entities MUST be nested under an "entities" object):

{
  "entities": {
    "brands":      [ { "text": "...", "context_excerpt": "...", "char_start": N, "char_end": N }, ... ],
    "specialties": [ { ... same shape ... }, ... ],
    "materials":   [ { ... same shape ... }, ... ]
  },
  "suggested_tags": ["tag_one", "tag_two", ...]
}

CRITICAL RULES:

1. **WRAP entities** — the three entity arrays MUST live inside an "entities" object as shown above. Do NOT emit them at the top level.
2. **NEVER INVENT** — only extract entities/tags genuinely present in the transcript. Empty arrays are fine.
3. **CHAR_START/CHAR_END must be accurate integer positions** in the transcript string (0-indexed). Used downstream for highlighting.
4. **CONTEXT_EXCERPT should include ~30 chars before and after** the match, joined with ellipses where the surrounding text exceeds that.
5. **DON'T over-extract** — return only entities you're confident about. Quality over quantity.

OUTPUT: Return ONLY a JSON object matching the shape above. No prose, no markdown code fences. Strict JSON.`;

export async function extractNer(transcript: string): Promise<NerOutcome> {
  if (!transcript || !transcript.trim()) {
    return { status: "skipped", reason: "no_transcript" };
  }

  try {
    const userMessage = `=== TRANSCRIPT (${transcript.length} chars) ===\n\n${transcript}\n\n=== ASK ===\nExtract entities and suggested tags per the system prompt. Return the JSON object.`;

    const res = await anthropic.messages.create({
      model: NER_MODEL,
      max_tokens: 2000,
      // NER is extraction, not interpretation — we want the same
      // entities pulled from the same transcript every time. temp=0
      // gives the most stable surface forms (which the downstream
      // matchers then bind to the catalog). Anthropic doesn't expose
      // a seed so this isn't fully deterministic, but it's as close
      // as the API gets.
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned no JSON object");
    // Defensive: prompt asks for { entities: { brands, ... }, suggested_tags }
    // but Haiku has been observed flattening to { brands, ..., suggested_tags }.
    // Accept either shape — prefer the wrapped form, fall back to flat keys.
    const parsed = JSON.parse(match[0]) as Partial<NerEntities> & {
      entities?: Partial<NerEntities>;
      suggested_tags?: string[];
    };
    const e = parsed.entities ?? parsed;

    const result: NerResult = {
      entities: {
        brands: e.brands ?? [],
        specialties: e.specialties ?? [],
        materials: e.materials ?? [],
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
