/**
 * Catalog → image generation prompt translation.
 *
 * Phase 2A of the website generator. Takes the brand identity catalog +
 * a desired asset role (hero_primary, services_tile_N, etc.) and produces
 * a fully-elaborated prompt suitable for Nano Banana (gemini-2.5-flash-image).
 *
 * Hero strategy: the Phase 1 generator already produces `hero_image.alt`
 * text via the website-gen pipeline, which IS a catalog-anchored
 * description (it's authored by Sonnet against the same catalog). For the
 * MVP, that alt text is the primary prompt seed. We augment with:
 *   - Business / location context (anchors regional specificity)
 *   - visual.do_not_show as a negative-prompt clause (Nano Banana doesn't
 *     have a separate negative-prompt input, so we fold avoidance into the
 *     prompt as "do NOT show...")
 *   - Aspect ratio hint (handled by the API call, not the prompt)
 *
 * Future iterations may construct prompts purely from catalog (bypassing
 * the alt text), giving the image-gen pipeline complete independence from
 * the content-gen pipeline.
 */
import type { GeneratorInput, DescriptorSlot, HeroSection } from "@/lib/website-gen/types";

export type AssetRole =
  | "hero_primary"
  | "services_tile" // Phase 2 follow-up
  | "about_narrative" // Phase 2 follow-up
  | "project_gallery"; // Phase 2 follow-up

export interface BuiltImagePrompt {
  /** The full prompt text passed to Nano Banana. */
  prompt: string;
  /** Aspect ratio per role. */
  aspectRatio: "16:9" | "4:3" | "1:1" | "9:16";
  /** Provenance metadata persisted alongside the generated asset. */
  meta: {
    role: AssetRole;
    catalog_descriptors_used: string[];
    catalog_descriptors_missing: string[];
    alt_text_source: boolean;
  };
}

const HERO_ASPECT: BuiltImagePrompt["aspectRatio"] = "16:9";

/**
 * Build a Nano Banana prompt for a hero image.
 *
 * Combines the Phase 1 hero alt text (catalog-anchored) with business
 * context, do-not-show avoidance, and image quality directives.
 */
export function buildHeroImagePrompt(
  input: GeneratorInput,
  hero: HeroSection,
): BuiltImagePrompt {
  const lines: string[] = [];
  const used: string[] = [];
  const missing: string[] = [];

  // Lead with the Phase 1-generated alt text. It's a catalog-anchored
  // description authored by Sonnet against the same brand identity.
  const altText = hero.hero_image?.alt?.trim() ?? "";
  const hasAlt = altText.length > 0;
  if (hasAlt) {
    lines.push(altText);
    lines.push("");
  }

  // Business + location anchors.
  const bi = input.business_info;
  if (bi.location) {
    lines.push(
      `Setting: ${bi.location}${bi.business_type ? ` — depicting work consistent with a ${bi.business_type}` : ""}.`,
    );
  }

  // Pull visual catalog descriptors. When undeclared, omit rather than
  // invent — the LLM doesn't need filler.
  const envLook = declaredValue(input.catalog.visual.environmental_look);
  if (envLook) {
    used.push("visual.environmental_look");
    lines.push(`Environmental character: ${formatValue(envLook)}.`);
  } else {
    missing.push("visual.environmental_look");
  }

  const subjectStyle = declaredValue(input.catalog.visual.subject_style);
  if (subjectStyle) {
    used.push("visual.subject_style");
    lines.push(`Subject framing and photographic treatment: ${formatValue(subjectStyle)}.`);
  } else {
    missing.push("visual.subject_style");
  }

  const aesthetic = declaredValue(input.catalog.visual.aesthetic);
  if (aesthetic) {
    used.push("visual.aesthetic");
    lines.push(`Overall aesthetic: ${formatValue(aesthetic)}.`);
  } else {
    missing.push("visual.aesthetic");
  }

  const palette = declaredValue(input.catalog.visual.palette);
  if (palette) {
    used.push("visual.palette");
    lines.push(`Color palette: ${formatValue(palette)}.`);
  } else {
    missing.push("visual.palette");
  }

  // Negative prompt (visual.do_not_show)
  const doNotShow = declaredValue(input.catalog.visual.do_not_show);
  if (doNotShow) {
    used.push("visual.do_not_show");
    lines.push("");
    lines.push(`DO NOT show: ${formatValue(doNotShow)}.`);
  }

  // Image-craft directives that apply across hero images.
  lines.push("");
  lines.push(
    "Photographic quality: editorial, professionally lit, sharp focus, magazine-grade composition. " +
      "Natural light preferred unless the scene calls otherwise. Wide cinematic framing suitable for a website hero. " +
      "Color grading should feel intentional — not Instagram-filter-y, not oversaturated, not HDR. " +
      "Avoid stock-photography clichés: no overly posed people, no perfect-grin lifestyle staging, no generic 'team' shots.",
  );

  return {
    prompt: lines.join("\n"),
    aspectRatio: HERO_ASPECT,
    meta: {
      role: "hero_primary",
      catalog_descriptors_used: used,
      catalog_descriptors_missing: missing,
      alt_text_source: hasAlt,
    },
  };
}

// ── helpers ────────────────────────────────────────────────────────

function declaredValue(slot: DescriptorSlot | null): unknown {
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
