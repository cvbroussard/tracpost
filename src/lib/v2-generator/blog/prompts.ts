import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import type { BlogContentType } from "./types";
import type { AssetContext } from "../shared/asset-context-builder";
import { formatAssetBlock } from "../shared/asset-context-builder";
import { getModelConfig } from "../shared/model-config";

/**
 * Type-specific structural instructions per blog content type.
 * Ported from v1 buildTypedBlogPrompt.
 */
const TYPE_INSTRUCTIONS: Record<BlogContentType, string> = {
  authority_overview: `## Article Type: Authority Overview ("Why Us")
This is the flagship article — a wide tour of capabilities told through the client's perspective.

Structure:
1. Hook — the one thing this business does that no one else does (2-3 sentences)
2. Brief overview sections (1-2 paragraphs each) covering the key capability areas:
   - How they approach the work differently (methodology/process)
   - Layouts, workflow, and spatial design
   - Equipment, appliances, and performance infrastructure
   - Materials, surfaces, and finishes
   - Craftsmanship, custom features, and vendor partnerships
   - Utility infrastructure (electrical, plumbing, ventilation)
3. The outcome — what the finished result feels like to use
4. Subtle CTA woven into the closing

Each section should be wide, not deep — a taste that makes the reader want to learn more.
Tone: confident generalist, not narrow specialist. "We do all of this, and here's a glimpse of each."`,

  deep_dive: `## Article Type: Deep Dive
Single topic technical authority. Go deep on one subject.

Structure:
1. Hook — why this specific topic matters more than people think
2. The problem most people don't realize they have
3. The technical detail — explain it clearly, no jargon, but don't dumb it down
4. How this business approaches it differently
5. FAQ (3-4 questions)
6. Key takeaways (3-4 points)

Tone: subject matter expert talking to an informed peer.`,

  project_story: `## Article Type: Project Story
A narrative about a specific project, client, or transformation.

Structure:
1. The client's situation before (frustration, limitation, what triggered the project)
2. The discovery — what the team observed or learned
3. The key design decisions and why each one was made
4. The outcome — how the space performs now
5. One unexpected benefit the client didn't anticipate

Write as a story with a narrative arc. Use specific details — dimensions, materials, vendor names — drawn from asset metadata only.
Do NOT use client's real name — use "our client" or "a client in [neighborhood]".
Tone: storyteller sharing a war story with genuine enthusiasm.`,

  vendor_spotlight: `## Article Type: Vendor/Material Spotlight
A research-driven feature about a specific material, vendor, technique, or product.

Structure:
1. Open with the material/vendor in context — how you encountered it, why you chose it
2. The history and origin (use the research provided)
3. What makes it special — technical properties, craftsmanship, uniqueness
4. How it performs in real use — not just how it looks, but how it functions
5. Why your business specifically chooses to work with this material/vendor
6. What clients should know before requesting it

Tone: curator introducing something they genuinely respect.`,
};

export interface BlogPromptInput {
  contentType: BlogContentType;
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  intent: string | null;
  topicHint: string | null;
  hookText: string | null;
  research: string;
  vendorLinks: string[];
  /** Project page URLs for this site so the LLM can link when citing projects. */
  projectLinks: string[];
  existingTitles: string[];
  assets: AssetContext[];
}

export function buildBlogBodyPrompt(input: BlogPromptInput): string {
  const cfg = getModelConfig(input.contentType);
  const parts: string[] = [];

  parts.push(`Write an article for a local service business blog. Length: ${cfg.wordRange} words. No filler.`);
  parts.push("");
  parts.push(TYPE_INSTRUCTIONS[input.contentType]);

  // Brand context preamble
  parts.push("");
  parts.push("## Brand Context");
  parts.push(`Business: ${input.siteName} (${input.siteUrl})`);
  if (input.playbook) {
    const angle = input.playbook.brandPositioning?.selectedAngles?.[0];
    if (angle) {
      parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
      parts.push(`Tone: ${angle.tone || "professional, engaging"}`);
    }
    if (input.playbook.offerCore?.offerStatement?.emotionalCore) {
      parts.push(`Emotional core: ${input.playbook.offerCore.offerStatement.emotionalCore}`);
    }
    const lang = input.playbook.audienceResearch?.languageMap;
    if (lang) {
      parts.push("");
      parts.push("## Audience");
      if (lang.painPhrases?.length) parts.push(`Their pain: ${lang.painPhrases.slice(0, 3).join("; ")}`);
      if (lang.desirePhrases?.length) parts.push(`Their desire: ${lang.desirePhrases.slice(0, 3).join("; ")}`);
      if (lang.searchPhrases?.length) {
        const idx = Math.floor(Math.random() * lang.searchPhrases.length);
        parts.push(`Target search query: ${lang.searchPhrases[idx]}`);
      }
    }
  }

  // Voice fingerprint from brand_dna.signals.voice (additive value)
  if (input.brandVoice && Object.keys(input.brandVoice).length > 0) {
    parts.push("");
    parts.push("## Voice fingerprint (observed from real published posts)");
    if (input.brandVoice.tone) parts.push(`Observed tone: ${input.brandVoice.tone}`);
    if (input.brandVoice.length_pattern) parts.push(`Length pattern: ${input.brandVoice.length_pattern}`);
    if (input.brandVoice.casing) parts.push(`Casing: ${input.brandVoice.casing}`);
    if (input.brandVoice.emoji_use) parts.push(`Emoji use: ${input.brandVoice.emoji_use}`);
    if (Array.isArray(input.brandVoice.distinctive_traits) && (input.brandVoice.distinctive_traits as string[]).length > 0) {
      parts.push(`Distinctive traits: ${(input.brandVoice.distinctive_traits as string[]).join("; ")}`);
    }
  }

  // Intent override (reward-prompt strategy uses this)
  if (input.intent) {
    parts.push("");
    parts.push("## Editorial Angle");
    parts.push(input.intent);
  }
  if (input.topicHint) {
    parts.push(`Topic hint: ${input.topicHint}`);
  }
  if (input.hookText) {
    parts.push("");
    parts.push(`## Opening hook to weave in`);
    parts.push(`"${input.hookText}"`);
  }

  // Wikipedia research
  if (input.research && input.research.length > 0) {
    parts.push("");
    parts.push("## Background Research (from Wikipedia — factual reference)");
    parts.push(input.research);
  }

  // Vendor links — real URLs from asset_brands
  if (input.vendorLinks.length > 0) {
    parts.push("");
    parts.push("## Vendor/Partner Links (link to these in the article where naturally relevant)");
    for (const v of input.vendorLinks) parts.push(`  ${v}`);
  }

  // Project links — when the article cites a project by name or
  // alludes to one ("our Point Breeze colonial"), the LLM should link
  // to that project's page using markdown link syntax.
  if (input.projectLinks.length > 0) {
    parts.push("");
    parts.push("## Project Pages (link to these in the article when you cite or allude to a project)");
    parts.push("Format: project name → URL. Use markdown link syntax `[Name](URL)` when referencing a project naturally.");
    for (const p of input.projectLinks) parts.push(`  ${p}`);
  }

  // Available assets — full rich context per asset
  parts.push("");
  parts.push("## Available assets — REAL CAPTURED MOMENTS");
  parts.push("Each asset below was captured at real subscriber job sites with real materials and real people. Place assets inline using {{asset:UUID}} placeholders. The first asset listed is the HERO (always present at the top of the article). Pick body assets that reinforce the narrative.");
  for (const a of input.assets) {
    parts.push("");
    for (const line of formatAssetBlock(a)) parts.push(line);
  }

  // Existing titles to avoid
  if (input.existingTitles.length > 0) {
    parts.push("");
    parts.push("## ALREADY PUBLISHED — do NOT reuse these titles or similar phrasing");
    for (const t of input.existingTitles) parts.push(`  - ${t}`);
  }

  // Two-zone rule + anti-fabrication
  parts.push("");
  parts.push("## Strictness — the two-zone rule");
  parts.push("");
  parts.push("Your article body has TWO kinds of prose with different strictness levels:");
  parts.push("");
  parts.push("**Zone A — asset-adjacent prose**: paragraphs immediately preceding or following a `{{asset:UUID}}` placeholder. Describing what's in/around that specific asset.");
  parts.push("→ STRICT. Reference ONLY what's in that asset's metadata block above. Do NOT name materials, brands, models, dimensions, or specs that aren't in that specific asset's data.");
  parts.push("");
  parts.push("**Zone B — general / educational prose**: paragraphs not adjacent to a placeholder. Category context, market commentary, design principles, why-it-matters writing.");
  parts.push("→ LATITUDE. You may use general industry knowledge here. \"Marble varieties like Calacatta and Carrara each carry different vein patterns\" is fine. Background research above is for Zone B.");
  parts.push("");
  parts.push("Examples:");
  parts.push("  ✅ Zone A: \"The marble waterfall island anchors the prep zone\" (when asset has \"marble waterfall edge\" in context)");
  parts.push("  ❌ Zone A: \"The Calacatta marble waterfall island\" (when only \"marble\" is named)");
  parts.push("  ❌ Zone A: \"The Brizo bridge faucet\" (when Brizo is not in this asset's vendors)");
  parts.push("  ✅ Zone B: \"Bridge faucets from makers like Brizo, Waterworks, or Watermark each handle the gooseneck reach a little differently.\"");
  parts.push("");
  parts.push("**Never invent vendor or product names.** If a category word appears in an asset (\"brass faucet\") but no specific brand is named, write the category — never name a brand. Saying \"a Lacanche\" or \"a La Cornue\" or \"a Wolf\" when none of those names appear in the asset metadata is fabrication.");
  parts.push("");
  parts.push("**No category-pairing.** If the metadata says the marble is Calacatta, write \"Calacatta\" — NOT \"Calacatta or Carrara.\" Pairing a named entity with its trained category-mate is fabrication of the second name.");
  parts.push("");
  parts.push("**Never invent quantitative specs** (CFM ratings, amperage, square footage, prices) that don't appear in metadata.");

  // Writing rules
  parts.push("");
  parts.push("## Writing Rules");
  parts.push(`- Title: 40-60 characters. Specific and unique. Lead with the insight, not the category.`);
  parts.push(`- Open with a hook or story — not a definition.`);
  parts.push(`- 9th-grade reading level. Conversational, not academic.`);
  parts.push(`- 3-5 ## headings (at least one as a question).`);
  parts.push(`- Paragraphs over bullet lists.`);
  parts.push(`- NEVER include specific prices, dollar amounts, cost estimates, or price ranges.`);
  parts.push(`- Link to vendor/partner websites where provided. Include 1 outbound link to an authoritative non-competitor source.`);
  parts.push(`- Use {{asset:UUID}} placeholders inline; do NOT reference assets in prose ("see the image below").`);
  parts.push(`- contentPillars are SINGLE-WORD CATEGORICAL labels. Examples: "craft", "workflow", "renovation", "design", "proof". NEVER sentences.`);
  parts.push(`- contentTags are short keywords, 1-3 words each, lowercase.`);

  // Response format
  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "title": "...",
  "body": "...",
  "excerpt": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "contentPillars": ["pillar"],
  "contentTags": ["...", "..."]
}`);
  parts.push("```");

  return parts.join("\n");
}
