import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import type { AssetContext } from "../shared/asset-context-builder";
import { formatAssetBlock } from "../shared/asset-context-builder";
import { getModelConfig } from "../shared/model-config";

/**
 * Service overview prompt — single authority-overview shape with
 * geo-aware sections + cited-project asset blocks.
 *
 * Structure:
 *   1. What is this service (Zone B — categorical)
 *   2. Why we approach it differently (Zone B — positioning + voice)
 *   3. Where we serve (Zone A — geo-areas, named when present)
 *   4. Cited project examples (Zone A per cited project's assets)
 *   5. What clients should know
 */

export interface CitedProject {
  id: string;
  name: string;
  slug: string;
  assets: AssetContext[];
}

export interface ServicePromptInput {
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;

  /** Service entity fields. */
  serviceName: string;
  serviceDescription: string | null;
  serviceAreas: string[];          // ['Point Breeze, PA', 'Squirrel Hill', ...]
  serviceRadiusMiles: number | null;

  /** Service hero asset context block. */
  heroAsset: AssetContext;
  /** Optional service-pool body assets. */
  bodyAssets: AssetContext[];

  /** Project examples cited within the service article — each carries its own asset pool. */
  citedProjects: CitedProject[];

  hookText: string | null;
  research: string;
  vendorLinks: string[];
  existingTitles: string[];
}

export function buildServiceOverviewPrompt(input: ServicePromptInput): string {
  const cfg = getModelConfig("service_overview");
  const parts: string[] = [];

  parts.push(`Write a service overview page for a local service business. Length: ${cfg.wordRange} words. No filler.`);
  parts.push("");
  parts.push("## Article Type: Service Authority Overview");
  parts.push("This is the canonical page for a service. Tells prospects what the service is, why this business does it well, where it's offered, and offers concrete project examples as proof.");
  parts.push("");
  parts.push("Structure:");
  parts.push("1. Open with what the service IS — but lead with the outcome, not the deliverable. Why does someone want this?");
  parts.push("2. Why this business approaches it differently — methodology, philosophy, what they refuse to compromise on. Use brand voice.");
  parts.push("3. Where we serve — name specific neighborhoods/cities from the geo data. Make readers in those areas feel seen.");
  parts.push("4. Project examples — for each cited project, a focused paragraph using ONLY that project's assets. Each cited block is its own Zone A.");
  parts.push("5. What clients should know before they reach out — practical, honest, no sales fluff.");

  // Brand context
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
      if (lang.painPhrases?.length) parts.push(`Audience pain: ${lang.painPhrases.slice(0, 3).join("; ")}`);
      if (lang.desirePhrases?.length) parts.push(`Audience desire: ${lang.desirePhrases.slice(0, 3).join("; ")}`);
    }
  }

  // Voice fingerprint
  if (input.brandVoice && Object.keys(input.brandVoice).length > 0) {
    parts.push("");
    parts.push("## Voice fingerprint (observed from real published posts)");
    if (input.brandVoice.tone) parts.push(`Observed tone: ${input.brandVoice.tone}`);
    if (input.brandVoice.length_pattern) parts.push(`Length pattern: ${input.brandVoice.length_pattern}`);
    if (input.brandVoice.casing) parts.push(`Casing: ${input.brandVoice.casing}`);
  }

  // Service entity
  parts.push("");
  parts.push("## The service");
  parts.push(`Name: "${input.serviceName}"`);
  if (input.serviceDescription) parts.push(`Description: ${input.serviceDescription}`);

  // Geo
  if (input.serviceAreas.length > 0 || input.serviceRadiusMiles) {
    parts.push("");
    parts.push("## Where we serve");
    if (input.serviceAreas.length > 0) {
      parts.push(`Named service areas: ${input.serviceAreas.join(", ")}`);
      parts.push(`→ Use these names in the "Where we serve" section. Be specific. Mention them in cited project intros where applicable.`);
    }
    if (input.serviceRadiusMiles) {
      parts.push(`Service radius: ${input.serviceRadiusMiles} miles from base location.`);
      parts.push(`→ Mention the radius and major nearby cities/neighborhoods.`);
    }
  } else {
    parts.push("");
    parts.push("## Where we serve");
    parts.push("(No geo data set — write geo-agnostic. Skip the 'Where we serve' section or keep it brief.)");
  }

  // Hook + research + vendor links
  if (input.hookText) {
    parts.push("");
    parts.push(`## Opening hook to weave in: "${input.hookText}"`);
  }
  if (input.research) {
    parts.push("");
    parts.push("## Background Research (from Wikipedia — for Zone B context)");
    parts.push(input.research);
  }
  if (input.vendorLinks.length > 0) {
    parts.push("");
    parts.push("## Vendor/Partner Links");
    for (const v of input.vendorLinks) parts.push(`  ${v}`);
  }

  // Service hero + body assets
  parts.push("");
  parts.push("## Service-level assets — use in the opening + general sections");
  parts.push("");
  for (const line of formatAssetBlock(input.heroAsset)) parts.push(line);
  for (const a of input.bodyAssets) {
    parts.push("");
    for (const line of formatAssetBlock(a)) parts.push(line);
  }

  // Cited project blocks — each its own Zone A
  if (input.citedProjects.length > 0) {
    parts.push("");
    parts.push("## Cited project examples");
    parts.push("Each project below is a separate Zone A. The prose immediately around each project's `{{asset:UUID}}` placeholders MUST reference only that project's metadata. Do NOT mix vendors, materials, or details across projects.");
    for (const p of input.citedProjects) {
      parts.push("");
      parts.push(`### Project: "${p.name}"  (slug: ${p.slug})`);
      for (const a of p.assets) {
        for (const line of formatAssetBlock(a)) parts.push(line);
      }
    }
  }

  // Existing titles
  if (input.existingTitles.length > 0) {
    parts.push("");
    parts.push("## ALREADY PUBLISHED — do NOT reuse these names");
    for (const t of input.existingTitles) parts.push(`  - ${t}`);
  }

  // Two-zone rule + anti-fabrication (same as blog)
  parts.push("");
  parts.push("## Strictness — the two-zone rule");
  parts.push("");
  parts.push("**Zone A — asset-adjacent prose**: paragraphs immediately around a `{{asset:UUID}}` placeholder, OR within a cited-project block.");
  parts.push("→ STRICT. Reference ONLY what's in that asset's metadata (or that project's asset pool). Do NOT name materials, brands, or specs not in that data.");
  parts.push("");
  parts.push("**Zone B — general / educational prose**: opening, methodology, geo overview, closing — paragraphs not tied to a specific asset.");
  parts.push("→ LATITUDE. Use general industry knowledge. Background research above is for Zone B.");
  parts.push("");
  parts.push("**Never invent vendor or product names.** **Never pair a named entity with its trained category-mate** (no \"Calacatta or Carrara\" when only Calacatta is named). **Never invent quantitative specs.**");

  // Writing rules
  parts.push("");
  parts.push("## Writing Rules");
  parts.push(`- Title: 40-60 chars. Lead with the service outcome, not the category label.`);
  parts.push(`- 9th-grade reading level. Conversational.`);
  parts.push(`- 3-5 ## headings (at least one as a question).`);
  parts.push(`- Paragraphs over bullets.`);
  parts.push(`- NEVER include prices or dollar amounts.`);
  parts.push(`- Link to vendor/partner websites where provided. Include 1 outbound link to an authoritative non-competitor.`);
  parts.push(`- Use {{asset:UUID}} placeholders inline.`);
  parts.push(`- contentPillars are SINGLE-WORD CATEGORICAL labels.`);
  parts.push(`- contentTags are short keywords, lowercase.`);

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
