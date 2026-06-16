/**
 * Shared base system prompt for all website page generation calls.
 *
 * Composes the writing rules from the brand catalog into a system prompt
 * that constrains every page section the generator produces. Page-specific
 * user prompts (hero, services, about, etc.) layer on top of this base.
 *
 * The base system prompt encodes:
 *  - Tone calibration (verbal.tone)
 *  - Lexicon constraints (verbal.lexicon.use / avoid)
 *  - Mechanical style rules (em-dashes, casing, no emoji, etc.)
 *  - Voice rules (brand persona vs named individuals)
 *  - Agency-scope reminder (factual, not aesthetic-judgmental)
 *  - Output schema instructions (use the submit tool)
 */
import type { GeneratorInput, DescriptorSlot } from "../types";

/**
 * Build the shared base system prompt for all page generation.
 *
 * Signature takes the full input (not just catalog) because owner-canonical
 * fields on the business row (e.g., business_info.tagline) take precedence
 * over the descriptor JSONB's tagline picker. Per the 2026-06-15 promotion:
 *   - businesses.tagline = owner-canonical
 *   - brand_descriptor.verbal.tagline = LLM-generated suggestion engine
 * Generator prefers the column when present; falls back to the descriptor
 * otherwise.
 */
export function buildBaseSystemPrompt(
  input: GeneratorInput,
): string {
  const catalog = input.catalog;
  const lines: string[] = [];

  lines.push(
    `You are a senior brand copywriter generating website content for a business. Your single job is to produce content that faithfully expresses the brand's declared identity catalog. You write the brand's voice — you do not impose your own creative direction.`,
  );
  lines.push("");

  // ── Voice + Tone ────────────────────────────────────────────────
  const tone = declaredValue(catalog.verbal.tone);
  const voiceSource = declaredValue(catalog.verbal.voice_source);
  if (tone) {
    lines.push("TONE — write in this register, every sentence:");
    lines.push(formatDeclared(tone));
    lines.push("");
  }
  if (voiceSource) {
    lines.push("VOICE SOURCE — who speaks for the brand:");
    lines.push(formatDeclared(voiceSource));
    lines.push(
      `If voice_source is "brand persona", DO NOT use first-person singular ("I"), DO NOT name a founder, DO NOT introduce individual team members. Speak as the brand entity.`,
    );
    lines.push("");
  }

  // ── Lexicon constraints ─────────────────────────────────────────
  const lexicon = declaredValue(catalog.verbal.lexicon);
  if (lexicon && typeof lexicon === "object") {
    const useTerms = extractArray(lexicon, "use");
    const avoidTerms = extractArray(lexicon, "avoid");
    if (useTerms.length || avoidTerms.length) {
      lines.push("LEXICON — strict vocabulary constraints:");
      if (useTerms.length) {
        lines.push(`  USE these terms where natural: ${useTerms.join(", ")}`);
      }
      if (avoidTerms.length) {
        lines.push(`  NEVER use these terms or near-synonyms: ${avoidTerms.join(", ")}`);
      }
      lines.push(
        `  These constraints are absolute. If the natural copy would use an avoided term, REPHRASE.`,
      );
      lines.push("");
    }
  }

  const avoidExtra = declaredValue(catalog.verbal.avoid);
  if (avoidExtra) {
    lines.push("ALSO AVOID:");
    lines.push(formatDeclared(avoidExtra));
    lines.push("");
  }

  // ── Mechanical style ────────────────────────────────────────────
  const mechanical = declaredValue(catalog.verbal.mechanical_style);
  if (mechanical) {
    lines.push("MECHANICAL STYLE — punctuation, casing, formatting rules:");
    lines.push(formatDeclared(mechanical));
    lines.push("");
  }

  // ── Tagline guidance ────────────────────────────────────────────
  // businesses.tagline (owner-canonical column) takes precedence over the
  // descriptor JSONB picker. If owner has declared a tagline on the
  // business row, use that verbatim. Descriptor JSONB tagline is treated
  // as the suggestion engine (LLM-generated candidates), never as
  // canonical.
  const ownerTagline = input.business_info.tagline;
  const descriptorTagline = declaredValue(catalog.verbal.tagline);
  const effectiveTagline = ownerTagline ?? (descriptorTagline ? formatDeclared(descriptorTagline) : null);
  if (effectiveTagline) {
    lines.push(`DECLARED TAGLINE (use verbatim where a tagline is called for, do NOT paraphrase or invent variants):`);
    lines.push(`  "${effectiveTagline}"`);
    lines.push("");
  } else {
    lines.push(`TAGLINE: no tagline is declared. Set tagline field to null in output; do NOT invent one.`);
    lines.push("");
  }

  // ── Agency-scope reminder ───────────────────────────────────────
  lines.push("AGENCY SCOPE DISCIPLINE:");
  lines.push(
    `- Generate content that EXPRESSES the declared catalog. Do NOT propose creative direction or aesthetic improvements not anchored in the declared values.`,
  );
  lines.push(
    `- Do NOT invent brand identity attributes that aren't in the catalog (no inferred founder, no fabricated values, no assumed credentials).`,
  );
  lines.push(
    `- When the catalog is silent on something, OMIT it from the output rather than filling the gap with invention.`,
  );
  lines.push("");

  // ── Output instructions ─────────────────────────────────────────
  lines.push("OUTPUT:");
  lines.push(
    `Call the provided submit tool with a JSON object matching the schema EXACTLY. Do not include any prose outside the tool call. Do not wrap the JSON in markdown fences. Do not return code blocks.`,
  );

  return lines.join("\n");
}

// ── helpers ────────────────────────────────────────────────────────

function declaredValue(slot: DescriptorSlot | null): unknown {
  if (!slot) return null;
  return slot.declared ?? null;
}

function formatDeclared(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatDeclared).join(", ");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .map(([k, v]) => `${k}: ${formatDeclared(v)}`)
      .join("; ");
  }
  return String(value);
}

function extractArray(obj: unknown, key: string): string[] {
  if (!obj || typeof obj !== "object") return [];
  const val = (obj as Record<string, unknown>)[key];
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}
