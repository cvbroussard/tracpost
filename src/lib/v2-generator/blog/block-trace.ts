import type { AssembledBlogPrompt } from "./assemble";

/**
 * Block-level traceability for the prompt inspector.
 *
 * Each `## ` block in the assembled blog prompt is sourced from one or
 * more origins: DB rows, source-file regions, external services, or
 * caller-supplied inputs. The inspector lets an operator click a block
 * and reveal where each piece came from.
 *
 * This module is the mapping. It runs *after* assembleBlogPrompt() and
 * needs no instrumentation in prompts.ts — it derives traces from the
 * block name + the structured `inputs` object the assembler exposes.
 *
 * Adding a new prompt block: add a case to `traceBlock()` keyed on the
 * block name. If the block is conditional, the case may return [] when
 * upstream inputs aren't present.
 */

export type TraceKind = "db" | "external" | "code" | "computed" | "input";

export interface TraceEntry {
  kind: TraceKind;
  /** Human-readable source label, e.g. "sites.brand_dna.signals.voice". */
  label: string;
  /** What this source contributes to the block. */
  detail: string;
  /** For kind="db" — table name. */
  table?: string;
  /** For kind="db" — columns or JSON path. */
  columns?: string[];
  /** For kind="db" — WHERE-clause summary. */
  filter?: string;
  /** For kind="code" — repo-relative file path. */
  file?: string;
  /** For kind="code" — line range, e.g. "189-212". */
  lines?: string;
  /** For kind="external" — service name. */
  service?: string;
  /** For kind="input" — caller-supplied field name from the spec. */
  inputName?: string;
  /** Concrete value(s) pulled — first few for display. */
  sample?: string[];
}

const PROMPTS_FILE = "src/lib/v2-generator/blog/prompts.ts";
const ASSEMBLE_FILE = "src/lib/v2-generator/blog/assemble.ts";
const ASSET_BUILDER_FILE = "src/lib/v2-generator/shared/asset-context-builder.ts";
const PROJECT_LINKS_FILE = "src/lib/v2-generator/shared/project-links.ts";
const VENDOR_FILE = "src/lib/v2-generator/shared/vendor-enrichment.ts";
const HOOK_FILE = "src/lib/v2-generator/shared/hooks.ts";
const RESEARCH_FILE = "src/lib/v2-generator/shared/wikipedia.ts";
const TITLES_FILE = "src/lib/v2-generator/shared/existing-titles.ts";
const CLASSIFY_FILE = "src/lib/v2-generator/blog/classify.ts";

/**
 * Build the per-block trace for an assembled prompt. Returns a parallel
 * array — same length / order as `promptStats.blocks`.
 */
export function buildBlockTraces(assembled: AssembledBlogPrompt): TraceEntry[][] {
  return assembled.promptStats.blocks.map((b) => traceBlock(b.name, assembled));
}

function traceBlock(name: string, a: AssembledBlogPrompt): TraceEntry[] {
  // Type-instructions block — name varies per content type.
  if (name.startsWith("Article Type:")) {
    return [
      {
        kind: "code",
        label: "TYPE_INSTRUCTIONS map",
        detail: `Static structural instructions for content type "${a.contentType}".`,
        file: PROMPTS_FILE,
        lines: "11-69",
      },
      {
        kind: a.spec.contentTypeOverride ? "input" : "computed",
        label: a.spec.contentTypeOverride
          ? "spec.contentTypeOverride"
          : "classifyBlogContentType()",
        detail: a.spec.contentTypeOverride
          ? `Content type forced by caller (no LLM classification).`
          : `LLM-classified content type from hero asset context + research.`,
        inputName: a.spec.contentTypeOverride ? "spec.contentTypeOverride" : undefined,
        file: a.spec.contentTypeOverride ? undefined : CLASSIFY_FILE,
        sample: [a.contentType],
      },
    ];
  }

  switch (name) {
    case "Preamble":
      return [
        {
          kind: "code",
          label: "buildBlogBodyPrompt preamble",
          detail: "Length target + 'no filler' directive. Length comes from getModelConfig(contentType).wordRange.",
          file: PROMPTS_FILE,
          lines: "92-94",
          sample: [`length: ${a.modelConfig.wordRange} words`],
        },
      ];

    case "Brand Context":
      return [
        {
          kind: "db",
          label: "sites.name + sites.url",
          detail: "Business identity in the prompt header.",
          table: "sites",
          columns: ["name", "url"],
          filter: `id = '${a.spec.siteId}'`,
          sample: [`name: ${a.inputs.siteName}`, `url: ${a.inputs.siteUrl}`],
        },
        ...(a.inputs.playbookPresent
          ? [
              {
                kind: "db" as TraceKind,
                label: "sites.brand_dna.playbook.brandPositioning.selectedAngles[0]",
                detail: "Brand angle, tagline, tone — only the first selected angle is used.",
                table: "sites",
                columns: ["brand_dna → playbook → brandPositioning → selectedAngles[0]"],
                filter: `id = '${a.spec.siteId}'`,
                sample: [
                  a.inputs.brandAngle ? `angle: ${a.inputs.brandAngle}` : "angle: (none)",
                  a.inputs.brandTone ? `tone: ${a.inputs.brandTone}` : "tone: (none)",
                ],
              },
              {
                kind: "db" as TraceKind,
                label: "sites.brand_dna.playbook.offerCore.offerStatement.emotionalCore",
                detail: "Emotional core line, when present.",
                table: "sites",
                columns: ["brand_dna → playbook → offerCore → offerStatement → emotionalCore"],
                filter: `id = '${a.spec.siteId}'`,
              },
            ]
          : [
              {
                kind: "computed" as TraceKind,
                label: "playbook missing",
                detail: "sites.brand_dna.playbook is null — angle/tone/emotional-core lines omitted; LLM falls back to Haiku.",
              },
            ]),
      ];

    case "Audience":
      return [
        {
          kind: "db",
          label: "sites.brand_dna.playbook.audienceResearch.languageMap",
          detail: "Pain phrases, desire phrases, and one randomly-picked search phrase per generation.",
          table: "sites",
          columns: [
            "brand_dna → playbook → audienceResearch → languageMap → painPhrases",
            "brand_dna → playbook → audienceResearch → languageMap → desirePhrases",
            "brand_dna → playbook → audienceResearch → languageMap → searchPhrases",
          ],
          filter: `id = '${a.spec.siteId}'`,
        },
        {
          kind: "code",
          label: "Random search-phrase pick",
          detail: "The Audience block surfaces ONE randomly-selected searchPhrase per call — different each generation.",
          file: PROMPTS_FILE,
          lines: "115-118",
        },
      ];

    case "Voice fingerprint (observed from real published posts)":
      return [
        {
          kind: "db",
          label: "sites.brand_dna.signals.voice",
          detail: "Observed voice traits — tone, length pattern, casing, emoji use, distinctive traits. Independent of playbook.",
          table: "sites",
          columns: [
            "brand_dna → signals → voice → tone",
            "brand_dna → signals → voice → length_pattern",
            "brand_dna → signals → voice → casing",
            "brand_dna → signals → voice → emoji_use",
            "brand_dna → signals → voice → distinctive_traits",
          ],
          filter: `id = '${a.spec.siteId}'`,
          sample: [
            a.inputs.voiceTone ? `tone: ${a.inputs.voiceTone}` : "tone: (none)",
            a.inputs.voiceLengthPattern ? `length: ${a.inputs.voiceLengthPattern}` : "",
            a.inputs.voiceEmojiPolicy ? `emoji: ${a.inputs.voiceEmojiPolicy}` : "",
          ].filter(Boolean),
        },
      ];

    case "Editorial Angle":
      return [
        {
          kind: "input",
          label: "spec.intent",
          detail: "Editorial angle override. Set by reward-prompt strategy (pulls from reward_prompts table) and inspector overrides.",
          inputName: "spec.intent",
          sample: a.spec.intent ? [a.spec.intent.slice(0, 120)] : [],
        },
      ];

    case "Opening hook to weave in":
      return [
        {
          kind: "db",
          label: "hooks (legacy hook bank)",
          detail: "Pulls one usable hook line for this site.",
          table: "hooks",
          columns: ["text"],
          filter: `site_id = '${a.spec.siteId}' AND used_at IS NULL`,
          file: HOOK_FILE,
          sample: a.inputs.hookText ? [a.inputs.hookText.slice(0, 120)] : [],
        },
      ];

    case "Background Research (from Wikipedia — factual reference)":
      return [
        {
          kind: "external",
          label: "Wikipedia API",
          detail: "Term extraction from hero asset's context_note → Wikipedia summary fetch. Cached per term.",
          service: "Wikipedia REST API",
          file: RESEARCH_FILE,
          sample: [`${a.inputs.researchChars} chars returned`],
        },
        {
          kind: "db",
          label: "media_assets.context_note (hero asset)",
          detail: "Source text used for term extraction.",
          table: "media_assets",
          columns: ["context_note"],
          filter: `id = '${a.spec.heroAssetId}'`,
        },
      ];

    case "Vendor/Partner Links (link to these in the article where naturally relevant)":
      return [
        {
          kind: "db",
          label: "asset_brands JOIN brands",
          detail: "Operator-tagged vendor URLs for the hero asset, capped at 3 with deep-link priority.",
          table: "asset_brands ⋈ brands",
          columns: ["brands.name", "brands.url"],
          filter: `asset_brands.asset_id = '${a.spec.heroAssetId}'`,
          file: VENDOR_FILE,
          sample: a.inputs.vendorLinks.slice(0, 3),
        },
      ];

    case "Project Pages (link to these in the article when you cite or allude to a project)":
      return [
        {
          kind: "db",
          label: "projects_v2 (active)",
          detail: "Project page URLs for inline citation. Uses display_name (short operator name) over name (article title) per migration 098.",
          table: "projects_v2",
          columns: ["slug", "COALESCE(display_name, name)"],
          filter: `site_id = '${a.spec.siteId}' AND status = 'active'`,
          file: PROJECT_LINKS_FILE,
          sample: a.inputs.projectLinks.slice(0, 3),
        },
        ...(a.spec.projectId
          ? [
              {
                kind: "input" as TraceKind,
                label: "spec.projectId (excludeProjectId)",
                detail: "Article belongs to this project chapter — that project is filtered out of the link list to avoid self-reference.",
                inputName: "spec.projectId",
                sample: [a.spec.projectId],
              },
            ]
          : []),
      ];

    case "Available assets — REAL CAPTURED MOMENTS":
      return [
        {
          kind: "input",
          label: "spec.heroAssetId + spec.bodyAssetIds",
          detail: "Asset IDs chosen by the orchestrator strategy before assembly. Hero is always first in the list.",
          inputName: "spec.heroAssetId, spec.bodyAssetIds",
          sample: [
            `hero: ${a.spec.heroAssetId}`,
            `body: ${(a.spec.bodyAssetIds || []).length} ids`,
          ],
        },
        {
          kind: "db",
          label: "media_assets",
          detail: "Per-asset context: media_type, context_note, content_pillar(s), content_tags, ai_analysis, transcription.",
          table: "media_assets",
          columns: ["media_type", "context_note", "content_pillar", "content_pillars", "content_tags", "ai_analysis", "transcription"],
          filter: `id = ANY(<resolved asset ids>)`,
          file: ASSET_BUILDER_FILE,
        },
        {
          kind: "db",
          label: "asset_brands JOIN brands (per asset)",
          detail: "Second vendor source. Operator-tagged brand names + URLs joined per asset; merged with ai_analysis.detected_vendors with case/snake_case normalization.",
          table: "asset_brands ⋈ brands",
          columns: ["brands.name", "brands.url"],
          filter: `asset_brands.asset_id = ANY(<resolved asset ids>)`,
          file: ASSET_BUILDER_FILE,
        },
        {
          kind: "code",
          label: "formatAssetBlock vendor normalization",
          detail: "Dedupes 'lacanche' / 'Lacanche' / 'marvin_windows' / 'Marvin Windows' to one canonical display per vendor. Operator-tagged names win as the display form.",
          file: ASSET_BUILDER_FILE,
          lines: "117-160",
        },
      ];

    case "ALREADY PUBLISHED — do NOT reuse these titles or similar phrasing":
      return [
        {
          kind: "db",
          label: "blog_posts_v2.title",
          detail: "Existing titles for this site so the LLM avoids duplicates and similar phrasing.",
          table: "blog_posts_v2",
          columns: ["title"],
          filter: `site_id = '${a.spec.siteId}'`,
          file: TITLES_FILE,
          sample: [`${a.inputs.existingTitleCount} titles`],
        },
      ];

    case "Strictness — the two-zone rule":
      return [
        {
          kind: "code",
          label: "Two-zone rule directive",
          detail: "Static prompt block. Zone A (asset-adjacent) = strict; Zone B (general/educational) = latitude. Resolves the over-boxing failure mode.",
          file: PROMPTS_FILE,
          lines: "190-212",
        },
      ];

    case "Writing Rules":
      return [
        {
          kind: "code",
          label: "Writing-rules directive",
          detail: "Static prompt block. Title length, reading level, headings, paragraphs, no prices, asset placeholder rules, contentPillars/contentTags shape.",
          file: PROMPTS_FILE,
          lines: "215-227",
        },
      ];

    case "Response format":
      return [
        {
          kind: "code",
          label: "JSON response schema",
          detail: "Required output keys: title, body, excerpt, metaTitle, metaDescription, contentPillars, contentTags.",
          file: PROMPTS_FILE,
          lines: "229-243",
        },
      ];
  }

  // Fallback for unrecognized blocks (defensive — surfaces as 'unknown'
  // in the inspector so we know to add a case here).
  return [
    {
      kind: "computed",
      label: "Unknown block",
      detail: `No trace mapped for block name "${name}". Add a case in block-trace.ts.`,
      file: "src/lib/v2-generator/blog/block-trace.ts",
    },
  ];
}
