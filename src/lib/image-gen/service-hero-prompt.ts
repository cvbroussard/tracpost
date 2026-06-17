/**
 * Service hero — prompt + alt-text construction.
 *
 * Unlike the website hero generator (which reuses Phase 1's already-
 * generated alt text as the prompt seed), services don't have a
 * pre-existing alt. We make ONE LLM call (Sonnet 4.6) that produces
 * both {image_prompt, alt_text} from the service context + brand catalog.
 *
 * Per the hero generation doctrine discussion (2026-06-17):
 *   - prompt + alt generated together for coherence + cost efficiency
 *   - alt is brand-voiced (anchored in catalog), not purely descriptive
 *   - both exposed to operator in the UI but not editable (per
 *     [[brand-identity-layer-stack]] — surfaces translate catalog,
 *     don't vary from it)
 *
 * The construction step is separable from the image gen step so the UI
 * can preview the prompt before firing Nano Banana ($0.04 + 20-40s).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { DescriptorSlot, GeneratorInput } from "@/lib/website-gen/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5"; // sonnet 4.6 alias when available; falling back to 4.5 family is fine for this task

export interface ServiceHeroPromptInput {
  /** Service display name (operator-facing label, e.g., "Kitchen Reimagined"). */
  serviceName: string;
  /** Service description (brand-voiced sentence). */
  serviceDescription: string | null;
  /** Source cluster intent label (e.g., "Kitchen remodeling"). */
  clusterIntentLabel: string | null;
  /** The category this service primarily anchors to (e.g., "Kitchen remodeler"). */
  primaryCategoryName: string | null;
  /** Generator input bundle (provides catalog + business_info). */
  input: GeneratorInput;
}

export interface BuiltServiceHeroPrompt {
  /** Full prompt text passed to Nano Banana. */
  prompt: string;
  /** Alt text to persist alongside the image (brand-voiced, anchored in catalog). */
  alt: string;
  /** Aspect ratio for service heroes (16:9 same as page heroes). */
  aspectRatio: "16:9";
  /** Provenance — which catalog descriptors fed the prompt + which were missing. */
  meta: {
    catalog_descriptors_used: string[];
    catalog_descriptors_missing: string[];
    model: string;
  };
}

const SYSTEM_PROMPT = `You are constructing two outputs for a local business's service hero image generation:

1. IMAGE_PROMPT — a detailed prompt for an image generation model (Nano Banana / gemini-2.5-flash-image). Photographic, editorial, suitable for a website service tile. Should depict the kind of work this service represents, in the brand's visual style.

2. ALT_TEXT — a single sentence describing the resulting image for accessibility + SEO. Brand-voiced, anchored in the brand's positioning. Describes what's in the image AND its connection to the brand's identity (not generic stock-photo language).

Both outputs draw from the SAME brand catalog inputs to ensure visual coherence with the rest of the brand's surfaces (home page hero, other services, etc.). The catalog descriptors are the canonical brand visual identity — your prompts must translate them faithfully.

CRITICAL CONSTRAINTS:
- DO NOT invent visual details not implied by the catalog. If the catalog says "Pittsburgh pre-war homes, period detail, warm desaturated palette" don't add "Mediterranean tile, neon accents" out of thin air.
- The image must depict the kind of WORK the service represents (e.g., a Kitchen Reimagined service image shows a kitchen rendered in the brand's style — NOT abstract or symbolic art).
- The alt text should evoke both WHAT'S in the image AND the BRAND'S identity (e.g., "A renovated pre-war Pittsburgh kitchen by [brand] — period detail preserved alongside refined modern finishes" is better than "A modern kitchen with white cabinets").
- Photographic quality directives: editorial, professionally lit, sharp focus, magazine-grade composition, natural light preferred, wide cinematic framing.
- No stock-photography clichés: no overly posed people, no perfect-grin lifestyle staging, no generic "team" shots.
- If visual.do_not_show is provided in inputs, the prompt must respect it.

OUTPUT a JSON object only. No prose, no markdown fences.

Schema:
{
  "image_prompt": "Full multi-line prompt for Nano Banana...",
  "alt": "Single-sentence alt text, brand-voiced..."
}`;

function declaredValue(slot: DescriptorSlot | null | undefined): unknown {
  if (!slot) return null;
  return slot.declared ?? null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join("; ");
  }
  return String(value);
}

function buildUserMessage(args: ServiceHeroPromptInput): {
  text: string;
  catalogUsed: string[];
  catalogMissing: string[];
} {
  const { serviceName, serviceDescription, clusterIntentLabel, primaryCategoryName, input } = args;
  const used: string[] = [];
  const missing: string[] = [];
  const lines: string[] = [];

  lines.push(`SERVICE CONTEXT:`);
  lines.push(`  Name:               ${serviceName}`);
  if (serviceDescription) lines.push(`  Description:        ${serviceDescription}`);
  if (clusterIntentLabel) lines.push(`  Customer intent:    "${clusterIntentLabel}"`);
  if (primaryCategoryName) lines.push(`  GBP category:       ${primaryCategoryName}`);
  lines.push("");

  lines.push(`BUSINESS CONTEXT:`);
  const bi = input.business_info;
  if (bi.business_type) lines.push(`  Business type:      ${bi.business_type}`);
  if (bi.location) lines.push(`  Location:           ${bi.location}`);
  lines.push("");

  lines.push(`BRAND VISUAL CATALOG (translate these faithfully):`);
  const envLook = declaredValue(input.catalog.visual.environmental_look);
  if (envLook) {
    used.push("visual.environmental_look");
    lines.push(`  Environmental:      ${formatValue(envLook)}`);
  } else missing.push("visual.environmental_look");

  const subjectStyle = declaredValue(input.catalog.visual.subject_style);
  if (subjectStyle) {
    used.push("visual.subject_style");
    lines.push(`  Subject/framing:    ${formatValue(subjectStyle)}`);
  } else missing.push("visual.subject_style");

  const aesthetic = declaredValue(input.catalog.visual.aesthetic);
  if (aesthetic) {
    used.push("visual.aesthetic");
    lines.push(`  Aesthetic:          ${formatValue(aesthetic)}`);
  } else missing.push("visual.aesthetic");

  const palette = declaredValue(input.catalog.visual.palette);
  if (palette) {
    used.push("visual.palette");
    lines.push(`  Palette:            ${formatValue(palette)}`);
  } else missing.push("visual.palette");

  const doNotShow = declaredValue(input.catalog.visual.do_not_show);
  if (doNotShow) {
    used.push("visual.do_not_show");
    lines.push(`  DO NOT show:        ${formatValue(doNotShow)}`);
  }

  lines.push("");
  lines.push(`BRAND POSITIONING (for alt text voice):`);
  const positioning = declaredValue(input.catalog.strategic?.positioning);
  if (positioning) {
    used.push("strategic.positioning");
    lines.push(`  Positioning:        ${formatValue(positioning)}`);
  } else missing.push("strategic.positioning");

  const audience = declaredValue(input.catalog.strategic?.audience);
  if (audience) {
    used.push("strategic.audience");
    lines.push(`  Audience:           ${formatValue(audience)}`);
  }

  lines.push("");
  lines.push(`Produce ONE JSON object with image_prompt + alt. Return JSON only, no prose, no fences.`);

  return { text: lines.join("\n"), catalogUsed: used, catalogMissing: missing };
}

export async function buildServiceHeroPrompt(
  args: ServiceHeroPromptInput,
): Promise<BuiltServiceHeroPrompt> {
  const { text: userMessage, catalogUsed, catalogMissing } = buildUserMessage(args);

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `service-hero-prompt: model returned no JSON object (length=${text.length})`,
    );
  }

  let parsed: { image_prompt?: string; alt?: string };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(
      `service-hero-prompt: JSON.parse failed — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!parsed.image_prompt?.trim() || !parsed.alt?.trim()) {
    throw new Error("service-hero-prompt: model omitted image_prompt or alt");
  }

  return {
    prompt: parsed.image_prompt.trim(),
    alt: parsed.alt.trim(),
    aspectRatio: "16:9",
    meta: {
      catalog_descriptors_used: catalogUsed,
      catalog_descriptors_missing: catalogMissing,
      model: MODEL,
    },
  };
}
