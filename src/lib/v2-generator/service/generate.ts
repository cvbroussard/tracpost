import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import {
  pullHook,
  getExistingTitles,
  getVendorLinks,
  buildAssetContexts,
  researchAssetContext,
  fixMalformedMarkdown,
  scanContent,
  buildArticleSchema,
  getModelConfig,
  generateContentKit,
  FALLBACK_MODEL,
  FALLBACK_MAX_TOKENS,
} from "../shared";
import { buildServiceOverviewPrompt, type CitedProject } from "./prompts";
import type { ServiceGenerateSpec, ServiceGeneratedBody, ServiceGenerateResult } from "./types";

const anthropic = new Anthropic();

/**
 * Generate a v2 service overview page.
 *
 * Pipeline:
 *   1. Load site + service + geo data
 *   2. Resolve service-level assets (hero + body candidates from service_assets)
 *   3. Pick cited projects: prefer those in service_areas; fall back to all active
 *      v2 projects on the site. For each cited project, pull its top assets
 *      (STRICT — only that project's asset_projects).
 *   4. Pull hook + existing titles + vendor links + Wikipedia research
 *   5. Build prompt with geo awareness + cited-project Zone A blocks
 *   6. LLM call (Sonnet 4.6 with playbook)
 *   7. Parse + repair markdown
 *   8. Filter placeholders to known asset ids
 *   9. Content guard scan
 *   10. Persist to services_v2 (UPDATE, since the row already exists from
 *       provisioning) + service_assets manifest + schema_jsonld in metadata
 */
export async function generateServicePage(spec: ServiceGenerateSpec): Promise<ServiceGenerateResult> {
  // 1. Load service + site
  const [service] = await sql`
    SELECT s.id, s.business_id, s.slug, s.name, s.description,
           s.hero_asset_id, s.poster_asset_id,
           s.service_areas, s.service_radius_miles,
           businesses.name AS site_name, businesses.url AS site_url, businesses.brand_dna
    FROM services_v2 s
    JOIN businesses ON businesses.id = s.business_id
    WHERE s.id = ${spec.serviceId}
  `;
  if (!service) throw new Error(`Service ${spec.serviceId} not found`);
  if (!service.hero_asset_id) {
    throw new Error(`Service ${spec.serviceId} has no hero_asset_id`);
  }

  const dna = (service.brand_dna || {}) as Record<string, unknown>;
  const playbook = (dna.playbook as BrandPlaybook | null) || null;
  const brandVoice = (dna.signals as Record<string, unknown> | null)?.voice as Record<string, unknown> || {};
  const siteName = String(service.site_name || "");
  const siteUrl = String(service.site_url || "");
  const serviceAreas = Array.isArray(service.service_areas) ? (service.service_areas as string[]) : [];
  const serviceRadius = (service.service_radius_miles as number | null) || null;

  // 2. Service-level assets — hero + manifest body
  const manifestRows = await sql`
    SELECT media_asset_id, role, slot_index FROM service_assets
    WHERE service_id = ${spec.serviceId}
    ORDER BY slot_index
  `;
  const manifestAssetIds = manifestRows.map((r) => r.media_asset_id as string);
  const allServiceAssetIds = [
    service.hero_asset_id as string,
    ...manifestAssetIds.filter((id) => id !== service.hero_asset_id),
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  const serviceAssets = await buildAssetContexts(
    allServiceAssetIds,
    service.hero_asset_id as string,
    service.business_id as string,
  );
  const heroAsset = serviceAssets.find((a) => a.isHero) || serviceAssets[0];
  if (!heroAsset) throw new Error(`Service ${spec.serviceId} hero asset not resolvable`);
  const bodyServiceAssets = serviceAssets.filter((a) => !a.isHero).slice(0, 3);

  // 3. Cited projects — prefer those in service_areas, fall back to all v2 projects
  const allProjectsForSite = await sql`
    SELECT id, slug, name, hero_asset_id
    FROM projects_v2
    WHERE business_id = ${service.business_id} AND status = 'active'
    ORDER BY created_at DESC
  `;
  // Cap to 4 cited projects to keep article focused
  const citedProjectRows = allProjectsForSite.slice(0, 4);

  const citedProjects: CitedProject[] = [];
  for (const p of citedProjectRows) {
    const projAssetRows = await sql`
      SELECT ma.id
      FROM asset_projects ap
      JOIN media_assets ma ON ma.id = ap.asset_id
      WHERE ap.project_id = ${p.id}
        AND ma.processing_stage = 'analyzed'
        AND ma.archived_at IS NULL
        AND (ma.media_type ILIKE 'image%' OR ma.media_type = 'video')
      ORDER BY ma.quality_score DESC NULLS LAST
      LIMIT 3
    `;
    if (projAssetRows.length === 0) continue;
    const projAssetIds = projAssetRows.map((r) => r.id as string);
    const projHeroId = (p.hero_asset_id as string) || projAssetIds[0];
    const projAssets = await buildAssetContexts(projAssetIds, projHeroId, service.business_id as string);
    citedProjects.push({
      id: p.id as string,
      name: p.name as string,
      slug: p.slug as string,
      assets: projAssets,
    });
  }

  // 4. Parallel context gathering
  const [hookText, existingTitles, vendorData, research] = await Promise.all([
    pullHook(service.business_id as string),
    getExistingTitles(service.business_id as string, "service"),
    getVendorLinks(service.hero_asset_id as string),
    researchAssetContext(heroAsset.contextNote || ""),
  ]);

  // 5. Build prompt
  const prompt = buildServiceOverviewPrompt({
    siteName,
    siteUrl,
    playbook,
    brandVoice,
    serviceName: service.name as string,
    serviceDescription: (service.description as string | null) || null,
    serviceAreas,
    serviceRadiusMiles: serviceRadius,
    heroAsset,
    bodyAssets: bodyServiceAssets,
    citedProjects,
    hookText,
    research,
    vendorLinks: vendorData.formatted,
    existingTitles,
  });

  // 6. LLM call
  const cfg = getModelConfig("service_overview");
  const useSonnet = Boolean(playbook);
  const response = await anthropic.messages.create({
    model: useSonnet ? cfg.model : FALLBACK_MODEL,
    max_tokens: useSonnet ? cfg.maxTokens : FALLBACK_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const body = parseServiceBody(text);

  // 7. Repair body
  body.body = fixMalformedMarkdown(body.body);

  // 8. Filter placeholders to known asset ids (across all sources)
  const knownIds = new Set([
    ...serviceAssets.map((a) => a.id),
    ...citedProjects.flatMap((p) => p.assets.map((a) => a.id)),
  ]);
  const placeholderRegex = /\{\{asset:([0-9a-f-]{36})\}\}/g;
  body.body = body.body.replace(placeholderRegex, (full, id) =>
    knownIds.has(id) ? full : "",
  );
  // Track placed ids for manifest
  const placedIds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = placeholderRegex.exec(body.body)) !== null) {
    if (knownIds.has(m[1])) placedIds.add(m[1]);
  }
  placedIds.delete(service.hero_asset_id as string);
  const orderedBodyIds = Array.from(placedIds);

  // 9. Content guard
  const guard = await scanContent(body.title, body.body, siteName);
  const status = guard.pass ? (spec.status || "active") : "archived";

  // 10. Persist — UPDATE the existing services_v2 row (it was created during provisioning)
  const heroUrl = await getAssetStorageUrl(service.hero_asset_id as string);
  const schemaJsonld = buildArticleSchema({
    title: body.title,
    body: body.body,
    excerpt: body.excerpt,
    metaDescription: body.metaDescription,
    heroUrl,
    siteName,
    siteUrl,
  });
  const metadata: Record<string, unknown> = {
    schema_jsonld: schemaJsonld,
    cited_projects: citedProjects.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
  };
  if (!guard.pass && guard.flags.length > 0) {
    metadata.guard_flags = guard.flags;
  }

  const [row] = await sql`
    UPDATE services_v2
    SET name = ${body.title},
        description = ${body.excerpt},
        body = ${body.body},
        excerpt = ${body.excerpt},
        meta_title = ${body.metaTitle},
        meta_description = ${body.metaDescription},
        content_pillars = ${body.contentPillars.length ? body.contentPillars : []}::text[],
        content_tags = ${body.contentTags.length ? body.contentTags : []}::text[],
        status = ${status},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
        updated_at = NOW()
    WHERE id = ${spec.serviceId}
    RETURNING id, slug, name
  `;

  // Manifest — replace existing
  await sql`DELETE FROM service_assets WHERE service_id = ${spec.serviceId}`;
  await sql`INSERT INTO service_assets (service_id, media_asset_id, slot_index, role) VALUES (${spec.serviceId}, ${service.hero_asset_id}, 0, 'hero')`;
  let slot = 1;
  for (const id of orderedBodyIds) {
    await sql`INSERT INTO service_assets (service_id, media_asset_id, slot_index, role) VALUES (${spec.serviceId}, ${id}, ${slot}, 'body')`;
    slot++;
  }

  // Content kit — same as blog
  try {
    const kit = await generateContentKit({
      siteId: service.business_id as string,
      title: body.title,
      body: body.body,
      excerpt: body.excerpt,
      contentTags: body.contentTags,
    });
    await sql`UPDATE services_v2 SET content_kit = ${JSON.stringify(kit)}::jsonb WHERE id = ${spec.serviceId}`;
  } catch (err) {
    console.error(`Content kit generation failed for service ${spec.serviceId}:`, err instanceof Error ? err.message : err);
  }

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    assetsCount: 1 + orderedBodyIds.length,
    citedProjectsCount: citedProjects.length,
    status,
  };
}

function parseServiceBody(text: string): ServiceGeneratedBody {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "Untitled Service"),
      body: String(parsed.body || ""),
      excerpt: String(parsed.excerpt || ""),
      metaTitle: String(parsed.metaTitle || parsed.title || ""),
      metaDescription: String(parsed.metaDescription || parsed.excerpt || ""),
      contentPillars: Array.isArray(parsed.contentPillars) ? parsed.contentPillars.map(String) : [],
      contentTags: Array.isArray(parsed.contentTags) ? parsed.contentTags.map(String) : [],
    };
  } catch {
    return {
      title: "Untitled Service",
      body: cleaned,
      excerpt: cleaned.slice(0, 200),
      metaTitle: "",
      metaDescription: "",
      contentPillars: [],
      contentTags: [],
    };
  }
}

async function getAssetStorageUrl(assetId: string): Promise<string | null> {
  const [r] = await sql`SELECT storage_url FROM media_assets WHERE id = ${assetId}`;
  return (r?.storage_url as string | null) || null;
}
