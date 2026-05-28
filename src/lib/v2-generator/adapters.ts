import { sql } from "@/lib/db";
import { generateV2Content } from "./core";
import type { ContentSpec, GenerateResult } from "./types";
import { primaryPillarFromTags, type PillarConfig } from "@/lib/pillars";

/**
 * Pool adapters — gather pool-specific upstream inputs and hand off to
 * the shared core engine. Each adapter is intentionally thin: gather,
 * assemble ContentSpec, call generateV2Content.
 *
 * Adding a new pool = one new adapter. Core doesn't change.
 */

/**
 * BLOG ADAPTER
 *
 * Generates a blog article from a single seed media asset. The seed
 * becomes the hero by default; sibling assets matching the seed's
 * pillar get pulled as body candidates so the LLM can place them.
 */
export async function generateBlogPost(opts: {
  siteId: string;
  seedAssetId: string;
  topicHint?: string;        // override; defaults to seed asset's context_note
  intent?: string;
  serviceId?: string;        // optional link to service category
  status?: "draft" | "published";
}): Promise<GenerateResult> {
  const [seed] = await sql`
    SELECT id, media_type, context_note, content_tags
    FROM media_assets
    WHERE id = ${opts.seedAssetId} AND business_id = ${opts.siteId}
  `;
  if (!seed) throw new Error(`Seed asset ${opts.seedAssetId} not found in site ${opts.siteId}`);

  // Pull body-candidate assets — same site, similar pillar, recent, quality-sorted.
  // The LLM selects which ones to actually place via {{asset:UUID}} in the body.
  // Pillar derived from seed's tags via site pillar_config (LOCKED 2026-05-09).
  const [pcRow] = await sql`SELECT pillar_config FROM businesses WHERE id = ${opts.siteId}`;
  const pc = (pcRow?.pillar_config || []) as PillarConfig;
  const pillar = primaryPillarFromTags(
    (seed.content_tags as string[] | null) || null,
    pc,
  );
  const pillarTagIds = pillar
    ? (pc.find((p) => p.id === pillar)?.tags.map((t) => t.id) || [])
    : [];

  const bodyCandidates = pillarTagIds.length > 0
    ? await sql`
        SELECT id FROM media_assets
        WHERE business_id = ${opts.siteId}
          AND id <> ${opts.seedAssetId}
          AND processing_stage = 'analyzed'
          AND archived_at IS NULL
          AND content_tags && ${pillarTagIds}::text[]
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 10
      `
    : await sql`
        SELECT id FROM media_assets
        WHERE business_id = ${opts.siteId}
          AND id <> ${opts.seedAssetId}
          AND processing_stage = 'analyzed'
          AND archived_at IS NULL
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 10
      `;

  const bodyAssetIds = bodyCandidates.map((r) => r.id as string);

  const spec: ContentSpec = {
    pool: "blog",
    siteId: opts.siteId,
    topicHint: opts.topicHint || (seed.context_note as string | null) || "Article from a recent capture",
    intent: opts.intent,
    heroAssetId: opts.seedAssetId,
    seedAssetId: opts.seedAssetId,
    bodyAssetIds,
    serviceId: opts.serviceId,
    contentPillars: Array.isArray(seed.content_pillars) ? (seed.content_pillars as string[]) : pillar ? [pillar] : [],
    contentTags: Array.isArray(seed.content_tags) ? (seed.content_tags as string[]) : [],
    status: opts.status || "draft",
  };

  return generateV2Content(spec);
}

/**
 * PROJECT ADAPTER
 *
 * Generates a project page from project metadata (name + scope) and
 * a curated set of project assets. Hero is required; the LLM picks
 * which body assets to place from the provided pool.
 */
export async function generateProjectPage(opts: {
  siteId: string;
  topicHint: string;             // project name + brief description
  heroAssetId: string;
  bodyAssetIds?: string[];
  startDate?: string;
  endDate?: string;
  intent?: string;
  contentPillars?: string[];
  status?: "active" | "archived";
}): Promise<GenerateResult> {
  const spec: ContentSpec = {
    pool: "project",
    siteId: opts.siteId,
    topicHint: opts.topicHint,
    intent: opts.intent || "case-study with before/after arc",
    heroAssetId: opts.heroAssetId,
    bodyAssetIds: opts.bodyAssetIds || [],
    projectMeta: {
      startDate: opts.startDate,
      endDate: opts.endDate,
    },
    contentPillars: opts.contentPillars || [],
    status: opts.status || "active",
  };

  return generateV2Content(spec);
}

/**
 * SERVICE ADAPTER
 *
 * Generates a service page from service category info. Slim services
 * (directory entries) work with minimal inputs; rich services
 * (authority hubs with body copy) provide more topic guidance.
 */
export async function generateServicePage(opts: {
  siteId: string;
  topicHint: string;             // service name + scope
  heroAssetId: string;
  bodyAssetIds?: string[];
  intent?: string;
  priceRange?: string;
  duration?: string;
  displayOrder?: number;
  contentPillars?: string[];
  status?: "active" | "archived";
}): Promise<GenerateResult> {
  const spec: ContentSpec = {
    pool: "service",
    siteId: opts.siteId,
    topicHint: opts.topicHint,
    intent: opts.intent || "authority overview of the service category",
    heroAssetId: opts.heroAssetId,
    bodyAssetIds: opts.bodyAssetIds || [],
    serviceMeta: {
      priceRange: opts.priceRange,
      duration: opts.duration,
      displayOrder: opts.displayOrder,
    },
    contentPillars: opts.contentPillars || [],
    status: opts.status || "active",
  };

  return generateV2Content(spec);
}
