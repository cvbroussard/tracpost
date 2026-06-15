/**
 * Build the user-side prompt for generating a home-page hero section.
 *
 * Layered on top of the base system prompt (which encodes writing rules).
 * This user prompt provides:
 *  - Brand context (name, type, location, GBP description for cross-surface alignment)
 *  - Strategic positioning (positioning, hooks, audience, CTA style)
 *  - Asset context (logo, future image placeholder hint)
 *  - The specific task and the required JSON shape
 */
import type { GeneratorInput, DescriptorSlot } from "../types";

export function buildHeroUserPrompt(input: GeneratorInput): string {
  const lines: string[] = [];

  // ── Business context ────────────────────────────────────────────
  lines.push("BUSINESS CONTEXT");
  lines.push(`- Name: ${input.business_info.name ?? "(unknown)"}`);
  lines.push(`- Type: ${input.business_info.business_type ?? "(unknown)"}`);
  lines.push(`- Location: ${input.business_info.location ?? "(unknown)"}`);
  if (input.business_info.url) lines.push(`- Website: ${input.business_info.url}`);
  lines.push("");

  // ── GBP context (cross-surface alignment) ───────────────────────
  if (input.gbp_profile?.description) {
    lines.push("GBP (Google Business Profile) DESCRIPTION — the live public text on Google:");
    lines.push(`"${input.gbp_profile.description}"`);
    lines.push(
      `Use this for cross-surface awareness. If the GBP description conflicts with the declared positioning below, your hero should reflect the DECLARED positioning — not the GBP description. The discrepancy is intentional rework toward alignment.`,
    );
    lines.push("");
  }

  // ── Strategic positioning ───────────────────────────────────────
  const positioning = declaredValue(input.catalog.strategic.positioning);
  if (positioning) {
    lines.push("DECLARED STRATEGIC POSITIONING:");
    if (typeof positioning === "object" && positioning !== null) {
      const p = positioning as Record<string, unknown>;
      if (p.wedge) lines.push(`- Wedge: ${formatValue(p.wedge)}`);
      if (p.angles) lines.push(`- Angles: ${formatValue(p.angles)}`);
      if (p.narrative) lines.push(`- Narrative: ${formatValue(p.narrative)}`);
    } else {
      lines.push(formatValue(positioning));
    }
    lines.push("");
  }

  const hooks = declaredValue(input.catalog.strategic.hooks);
  if (hooks) {
    lines.push("DECLARED OPENING HOOKS (use any/all that fit a hero):");
    lines.push(formatValue(hooks));
    lines.push("");
  }

  const audience = declaredValue(input.catalog.strategic.audience);
  if (audience) {
    lines.push("DECLARED AUDIENCE (who the copy addresses):");
    lines.push(formatValue(audience));
    lines.push("");
  }

  const cta = declaredValue(input.catalog.strategic.cta);
  if (cta) {
    lines.push("DECLARED CTA STYLE:");
    if (typeof cta === "object" && cta !== null) {
      const c = cta as Record<string, unknown>;
      if (c.action) lines.push(`- Action verb / phrase: ${formatValue(c.action)}`);
      if (c.style) lines.push(`- Style: ${formatValue(c.style)}`);
    } else {
      lines.push(formatValue(cta));
    }
    lines.push("");
  }

  // ── Offer + proof (informs hero subhead + supporting context) ───
  const offer = declaredValue(input.catalog.strategic.offer);
  if (offer) {
    lines.push("DECLARED OFFER (services + capabilities — context for the headline):");
    lines.push(formatValue(offer));
    lines.push("");
  }

  const proof = declaredValue(input.catalog.strategic.proof);
  if (proof) {
    lines.push("DECLARED PROOF (what supports the brand's claims):");
    lines.push(formatValue(proof));
    lines.push("");
  }

  // ── Asset context ───────────────────────────────────────────────
  lines.push("ASSET CONTEXT");
  if (input.brand_assets.logo) {
    lines.push(`- Brand logo: available (${input.brand_assets.logo.url})`);
  } else {
    lines.push(`- Brand logo: not available`);
  }
  lines.push(
    `- Hero image: a brand-faithful image will be generated in a separate pipeline pass. For now, the hero_image asset_id and url should be null; only supply alt text describing the IDEAL hero image content given the catalog (so the future image-gen pipeline has guidance).`,
  );
  lines.push("");

  // ── The task ────────────────────────────────────────────────────
  lines.push("TASK");
  lines.push(
    `Generate the hero section for this brand's homepage. The hero is the first thing a visitor sees — it must establish the brand's positioning in seconds.`,
  );
  lines.push("");
  lines.push("Constraints specific to the hero section:");
  lines.push(
    `- HEADLINE: punchy, brand-voice, anchored in the declared positioning. Maximum 12 words. Should make a visitor in the target audience feel addressed.`,
  );
  lines.push(
    `- SUBHEAD: optional supporting line that contextualizes the headline. Null if the headline carries the load alone. Maximum 25 words.`,
  );
  lines.push(
    `- TAGLINE: include if a declared tagline exists in the catalog. Otherwise null — DO NOT invent one.`,
  );
  lines.push(
    `- PRIMARY CTA: text + href. Use the declared CTA style if specified. Default href: "/contact".`,
  );
  lines.push(
    `- SECONDARY CTA: optional. If included, should serve a different intent than the primary (e.g., browse work vs initiate contact). Default href if "/projects" is appropriate.`,
  );
  lines.push(
    `- HERO IMAGE alt text: describe the image that SHOULD be there given the catalog. Be specific — mention setting, subject, environmental cues, palette anchors. This becomes the image-gen prompt later.`,
  );
  lines.push("");
  lines.push(
    `Call the submit_hero_section tool with the JSON shape exactly.`,
  );

  return lines.join("\n");
}

// ── helpers ────────────────────────────────────────────────────────

function declaredValue(slot: DescriptorSlot | null): unknown {
  if (!slot) return null;
  return slot.declared ?? null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? `  - ${v}` : `  - ${formatValue(v)}`))
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `  ${k}: ${formatValue(v)}`)
      .join("\n");
  }
  return String(value);
}
