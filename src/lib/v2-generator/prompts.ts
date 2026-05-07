import type { ContentSpec } from "./types";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

/**
 * Prompt builders for the v2 generator's two LLM calls.
 *
 * Call 1 — body: produces title + body markdown + excerpt + meta + tags
 * Call 2 — kit:  produces structured ingredients (hooks/takeaways/etc.)
 *
 * Both calls share a brand-context preamble (built once from the
 * site's playbook + voice). The body call's output feeds the kit
 * call's context so kit ingredients are grounded in the actual
 * article.
 */

export interface BodyPromptInput {
  spec: ContentSpec;
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  /** Available media assets the LLM can reference via {{asset:UUID}}. */
  availableAssets: Array<{
    id: string;
    kind: "image" | "video";
    mediaType: string;
    isHero: boolean;
    contextNote: string | null;
    description: string | null;
    sceneType: string | null;
    detectedVendors: string[];
    detectedPersonas: string[];
    transcription: string | null;
    contentPillars: string[];
    contentTags: string[];
  }>;
}

export function buildBodyPrompt(input: BodyPromptInput): string {
  const { spec, siteName, siteUrl, playbook, brandVoice, availableAssets } = input;
  const parts: string[] = [];

  parts.push("You write authoritative, voice-driven articles for a service business. The article serves as a destination — social posts will point at it. Lead the reader; don't pitch.");
  parts.push("");
  parts.push(brandPreamble(siteName, siteUrl, playbook, brandVoice));

  parts.push("");
  parts.push("## Article spec");
  parts.push(`Pool: ${spec.pool}`);
  parts.push(`Topic hint: ${spec.topicHint}`);
  if (spec.intent) parts.push(`Intent: ${spec.intent}`);
  if (spec.contentPillars?.length) {
    parts.push(`Content pillars to weave: ${spec.contentPillars.join(", ")}`);
  }

  parts.push("");
  parts.push("## Available assets — REAL CAPTURED MOMENTS");
  parts.push("Each asset below is something the subscriber actually photographed/filmed at real job sites with real materials and real people. The article must reference these specifics — vendors by name, materials by name, personas by name. Generic prose that could describe any kitchen is failure.");
  parts.push("");
  parts.push("Place assets inline using {{asset:UUID}} placeholders. The first asset listed is the HERO (always present at the top of the article). Pick body assets that reinforce the narrative.");
  for (const a of availableAssets) {
    parts.push("");
    parts.push(`### {{asset:${a.id}}}  (${a.kind}${a.isHero ? " — HERO" : ""})`);
    if (a.contextNote) parts.push(`  Caption from creator: "${a.contextNote}"`);
    if (a.description) parts.push(`  Visual: ${a.description}`);
    if (a.sceneType) parts.push(`  Scene type: ${a.sceneType}`);
    if (a.detectedVendors.length) parts.push(`  Vendors visible: ${a.detectedVendors.join(", ")}`);
    if (a.detectedPersonas.length) parts.push(`  People visible: ${a.detectedPersonas.join(", ")}`);
    if (a.transcription) parts.push(`  Transcription: ${a.transcription}`);
    if (a.contentTags.length) parts.push(`  Tags: ${a.contentTags.join(", ")}`);
    if (a.contentPillars.length) parts.push(`  Pillars: ${a.contentPillars.join(", ")}`);
  }

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "title": "...",
  "body": "...",                      // full markdown article body with {{asset:UUID}} placeholders inline
  "excerpt": "...",                   // 1-2 sentence summary, used in feeds + meta
  "metaTitle": "...",                 // ≤60 chars, SEO
  "metaDescription": "...",           // ≤160 chars, SEO
  "contentPillars": ["pillar1"],      // 1-3 SINGLE-WORD category labels. NOT sentences. NOT phrases.
  "contentTags": ["...", "..."]       // 5-10 short keywords (1-3 words each)
}`);
  parts.push("```");
  parts.push("");
  parts.push("## The two-zone rule (most important)");
  parts.push("");
  parts.push("Your article body has TWO kinds of prose, and the strictness rules differ for each:");
  parts.push("");
  parts.push("**Zone A — asset-adjacent prose**: paragraphs immediately preceding or following a `{{asset:UUID}}` placeholder. This prose is describing or contextualizing that specific asset.");
  parts.push("→ STRICT. Reference ONLY what's in that asset's metadata block above (Caption, Visual, Vendors visible, Tags). Do NOT name materials, brands, models, dimensions, or specs that aren't in that specific asset's data.");
  parts.push("");
  parts.push("**Zone B — general / educational prose**: paragraphs not adjacent to a placeholder. Category context, market commentary, design principles, why-it-matters writing.");
  parts.push("→ LATITUDE. You may use general industry knowledge here. \"Marble varieties like Calacatta and Carrara each carry different vein patterns\" is fine — that's category education, not a claim about any specific asset. \"A bridge faucet from a maker like Brizo or another manufacturer\" is fine here too — it's discussing the category.");
  parts.push("");
  parts.push("The placeholder positions tell you which zone you're in. A paragraph immediately before/after a `{{asset:UUID}}` is Zone A. A paragraph between placeholders, far from any placeholder, or in opening/closing sections is Zone B.");
  parts.push("");
  parts.push("Examples of Zone A done right (asset metadata says: \"marble countertops with waterfall edge, brass bridge faucet, Lacanche Sully range\"):");
  parts.push("  ✅ \"The marble waterfall island anchors the prep zone, with the brass bridge faucet rising over it.\"");
  parts.push("  ❌ \"The Calacatta marble waterfall island…\" (Calacatta not in metadata)");
  parts.push("  ❌ \"The Brizo bridge faucet…\" (Brizo not in metadata)");
  parts.push("");
  parts.push("Examples of Zone B done right (same asset metadata):");
  parts.push("  ✅ \"Marble has been the work surface for serious kitchens for centuries — Calacatta brings dramatic veining, Carrara a softer pattern, Statuario the most pristine white.\"");
  parts.push("  ✅ \"Bridge faucets from makers like Brizo, Waterworks, or Watermark each handle the gooseneck reach a little differently.\"");
  parts.push("");
  parts.push("## Other rules");
  parts.push("- **For the HERO**: write the opening section to feature what's actually IN it (Zone A). Reference the actual visual. If it's a video showing motion, describe what happens in that specific video.");
  parts.push("- **If a specific variety/brand IS named in the asset metadata, use it.** \"Lacanche Sully\" must be \"Lacanche Sully\" in Zone A — never weakened to \"a Lacanche or another European range.\"");
  parts.push("- **No inventing dimensions, prices, or quantitative specs** (\"1,250 CFM\", \"$5K\", \"40 amps\") in Zone A unless they appear in metadata. Zone B can use rough industry ranges if helpful.");
  parts.push("- If asset metadata is sparse, write SHORTER and more focused — don't pad Zone A with general material education to compensate (move that content to Zone B if it belongs).");
  parts.push("- Use the audience's actual language (per playbook), not marketing speak.");
  parts.push("- Body is markdown. Use ## subheads, lists, short paragraphs.");
  parts.push("- Place assets where they reinforce the narrative — not all bunched up.");
  parts.push("- Don't reference assets in prose ('see the image below'); the placeholders speak for themselves.");
  parts.push("- Meta description is the snippet Google shows; make it specific.");
  parts.push("- contentPillars are CATEGORICAL labels, like a taxonomy entry. Examples: \"craft\", \"workflow\", \"renovation\", \"design\", \"proof\". Single words. Lowercase. NEVER sentences or descriptions.");
  parts.push("- contentTags are short keywords, 1-3 words each. Lowercase. Examples: \"kitchen design\", \"rift-sawn oak\", \"Pittsburgh remodel\".");

  return parts.join("\n");
}

export interface KitPromptInput {
  spec: ContentSpec;
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  /** Body output from the previous LLM call — anchors the kit. */
  bodyContext: {
    title: string;
    body: string;
    excerpt: string;
    contentTags: string[];
  };
}

export function buildKitPrompt(input: KitPromptInput): string {
  const { spec, siteName, siteUrl, playbook, brandVoice, bodyContext } = input;
  const parts: string[] = [];

  parts.push("You distill an article into structured ingredients. These ingredients feed a slicing system that composes social captions for every platform — short and long, casual and professional. Generate ingredients RICH enough that any platform's slicer can pull a great caption without further help.");
  parts.push("");
  parts.push(brandPreamble(siteName, siteUrl, playbook, brandVoice));

  parts.push("");
  parts.push("## The article");
  parts.push(`Title: "${bodyContext.title}"`);
  parts.push(`Excerpt: ${bodyContext.excerpt}`);
  parts.push(`Tags: ${bodyContext.contentTags.join(", ")}`);
  parts.push("");
  parts.push("Body:");
  parts.push("```");
  parts.push(bodyContext.body.slice(0, 6000)); // truncate to keep prompt bounded
  parts.push("```");

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "hooks": ["...", "...", "..."],              // 4-6 punchy opening lines, ≤120 chars each, ranked strongest first
  "takeaways": ["...", "..."],                 // 4-6 single-sentence value props, ≤140 chars each
  "keyTerms": ["...", "..."],                  // 6-12 domain words / proper nouns / location markers
  "proofPoints": ["..."],                      // 3-5 specific facts, numbers, names that lend authority
  "inlineLinkContexts": ["...", "..."],        // 4-6 natural phrasings to introduce the URL ("see the full breakdown", "details on the blog")
  "ctaVariants": {
    "short": ["..."],                          // 3-4 ultra-brief CTAs (≤25 chars)
    "medium": ["..."],                         // 3-4 medium CTAs (≤60 chars)
    "long": ["..."]                            // 2-3 longer CTAs (≤120 chars)
  },
  "voiceMarkers": {
    "signoffs": ["..."],                       // 1-3 natural sign-off lines if relevant
    "emojiPolicy": "none|sparse|frequent",
    "exclamationDensity": "low|medium|high",
    "casing": "sentence|title|lowercase"
  }
}`);
  parts.push("```");
  parts.push("");
  parts.push("Rules:");
  parts.push("- Hooks STOP THE SCROLL — every one must work as a first line");
  parts.push("- Takeaways are stand-alone — readable without context");
  parts.push("- Key terms are PascalCase-able later; use natural casing here");
  parts.push("- Voice markers describe the article's actual register, not aspirational");
  parts.push(`- Topic context: ${spec.pool} for ${siteName}; ingredients should reflect this`);

  return parts.join("\n");
}

function brandPreamble(
  siteName: string,
  siteUrl: string,
  playbook: BrandPlaybook | null,
  brandVoice: Record<string, unknown>,
): string {
  const parts: string[] = [];
  parts.push("## Brand context");
  parts.push(`Site: ${siteName} (${siteUrl})`);

  // ── Strategic positioning + audience language (from dna.playbook) ──
  if (playbook) {
    const angle = playbook.brandPositioning?.selectedAngles?.[0];
    const lang = playbook.audienceResearch?.languageMap;
    if (angle) {
      parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
      parts.push(`Tone (positioning): ${angle.tone || "engaging"}`);
    }
    if (playbook.offerCore?.offerStatement?.emotionalCore) {
      parts.push(`Emotional core: ${playbook.offerCore.offerStatement.emotionalCore}`);
    }
    if (lang) {
      if (lang.painPhrases?.length) parts.push(`Pain phrases: ${lang.painPhrases.join(", ")}`);
      if (lang.desirePhrases?.length) parts.push(`Desire phrases: ${lang.desirePhrases.join(", ")}`);
      if (lang.emotionalTriggers?.length) parts.push(`Emotional triggers: ${lang.emotionalTriggers.join(", ")}`);
    }
  }

  // ── Voice fingerprint observed from real published content ──
  // (dna.signals.voice — additive value over the playbook alone)
  if (brandVoice && Object.keys(brandVoice).length > 0) {
    parts.push("");
    parts.push("## Voice fingerprint (observed from real published posts)");
    if (brandVoice.tone) parts.push(`Observed tone: ${brandVoice.tone}`);
    if (brandVoice.length_pattern) parts.push(`Length pattern: ${brandVoice.length_pattern}`);
    if (brandVoice.casing) parts.push(`Casing: ${brandVoice.casing}`);
    if (brandVoice.emoji_use) parts.push(`Emoji use: ${brandVoice.emoji_use}`);
    if (brandVoice.hashtag_use) parts.push(`Hashtag use: ${brandVoice.hashtag_use}`);
    if (Array.isArray(brandVoice.sign_offs) && brandVoice.sign_offs.length) {
      parts.push(`Sign-offs: ${(brandVoice.sign_offs as string[]).join(" | ")}`);
    }
    if (Array.isArray(brandVoice.distinctive_traits) && brandVoice.distinctive_traits.length) {
      parts.push(`Distinctive traits: ${(brandVoice.distinctive_traits as string[]).join("; ")}`);
    }
  }

  return parts.join("\n");
}
