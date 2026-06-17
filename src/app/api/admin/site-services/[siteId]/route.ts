/**
 * GET /api/admin/site-services/[siteId]
 *
 * Returns the current services for a site, each annotated with:
 *   - primary_gcid + resolved name (the canonical N:1 anchor)
 *   - associated_gcids[] + resolved name array (the cluster's full
 *     curated category set for breadth-tolerant surfaces, per
 *     [[stable-service-identity]])
 *
 * Drives the Services tab on /ops/categories-services.
 */
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

interface ServiceHeroData {
  asset_id: string;
  url: string;
  alt: string | null;
  prompt: string | null;
  generated_at: string | null;
  catalog_descriptors_used: string[];
  catalog_descriptors_missing: string[];
}

interface SiteServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_range: string | null;
  duration: string | null;
  display_order: number;
  source: string;
  metadata: Record<string, unknown> | null;
  primary_gcid: string | null;
  primary_category_name: string | null;
  associated_gcids: string[];
  associated_category_names: Array<{ gcid: string; name: string }>;
  hero_asset_id: string | null;
  hero: ServiceHeroData | null;
  created_at: string;
  updated_at: string;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await ctx.params;

  // Three-step: services, gbp_category name resolution, hero asset
  // resolution. Each in one batch.
  const services = await sql`
    SELECT
      s.id, s.name, s.slug, s.description, s.price_range, s.duration,
      s.display_order, s.source, s.metadata, s.primary_gcid,
      s.associated_gcids,
      s.hero_asset_id,
      gc.name AS primary_category_name,
      s.created_at, s.updated_at
    FROM services s
    LEFT JOIN gbp_categories gc ON gc.gcid = s.primary_gcid
    WHERE s.business_id = ${siteId}
    ORDER BY s.display_order, s.name
  `;

  const allReferencedGcids = Array.from(
    new Set(
      services.flatMap((r) => (r.associated_gcids as string[] | null) ?? []),
    ),
  );
  const nameRows =
    allReferencedGcids.length > 0
      ? await sql`
          SELECT gcid, name FROM gbp_categories
          WHERE gcid = ANY(${allReferencedGcids}::text[])
        `
      : [];
  const nameByGcid = new Map(nameRows.map((r) => [r.gcid as string, r.name as string]));

  const heroAssetIds = Array.from(
    new Set(
      services.map((r) => r.hero_asset_id as string | null).filter((id): id is string => Boolean(id)),
    ),
  );
  const heroRows =
    heroAssetIds.length > 0
      ? await sql`
          SELECT id, storage_url, context_note, metadata
          FROM media_assets
          WHERE id = ANY(${heroAssetIds}::uuid[])
        `
      : [];
  const heroByAssetId = new Map(
    heroRows.map((r) => {
      const meta = (r.metadata as Record<string, unknown> | null) ?? {};
      return [
        r.id as string,
        {
          asset_id: r.id as string,
          url: r.storage_url as string,
          alt: (meta.alt_text as string | undefined) ?? (r.context_note as string | undefined) ?? null,
          prompt: (meta.prompt_full as string | undefined) ?? null,
          generated_at: (meta.generated_at as string | undefined) ?? null,
          catalog_descriptors_used: (meta.catalog_descriptors_used as string[] | undefined) ?? [],
          catalog_descriptors_missing: (meta.catalog_descriptors_missing as string[] | undefined) ?? [],
        } satisfies ServiceHeroData,
      ];
    }),
  );

  const enriched = services.map((r) => {
    const associated = (r.associated_gcids as string[] | null) ?? [];
    const heroAssetId = r.hero_asset_id as string | null;
    return {
      ...r,
      associated_gcids: associated,
      associated_category_names: associated.map((gcid) => ({
        gcid,
        name: nameByGcid.get(gcid) ?? gcid,
      })),
      hero_asset_id: heroAssetId,
      hero: heroAssetId ? heroByAssetId.get(heroAssetId) ?? null : null,
    };
  });

  return NextResponse.json({
    services: enriched as unknown as SiteServiceRow[],
    count: enriched.length,
  });
}
