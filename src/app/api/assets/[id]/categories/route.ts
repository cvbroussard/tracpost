import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { matchServiceAreas } from "@/lib/categorization/service-area-match";
import { matchBrandsFromNer } from "@/lib/categorization/brand-match";
import { getAssetNarrative } from "@/lib/asset-narrative";

export const runtime = "nodejs";

/**
 * GET /api/assets/[id]/categories
 *   Returns the asset's categorization (primary + secondaries) PLUS
 *   the site's full 10-category list so the operator can pick from
 *   them when manually adjusting.
 *
 *   Response: {
 *     asset: { id, hasTranscript },
 *     siteCategories: [{ gcid, name }],
 *     assignments: [{ gcid, name, is_primary, confidence, assigned_by, reasoning, assigned_at }],
 *     committed: {
 *       scene_types, story_angles, url_slug, suggested_pillar,
 *       brands: [{ name, slug }],
 *       service_areas: [{ name, source: "transcript"|"gps" }]
 *     } | null
 *   }
 *
 *   `committed` surfaces the rest of the cascade artifact (the same
 *   fields shown in the preview) so the Auto-tag card can render the
 *   full picture after Save, not just the category pills. Null when
 *   the cascade has never committed for this asset.
 *
 *   Service areas are NOT persisted per-asset (per bd4a90d JIT-at-gen-
 *   time decision); we re-compute them on each GET via matchServiceAreas
 *   against the asset's transcript + GPS. Pure local matcher, no LLM cost.
 *
 * POST /api/assets/[id]/categories
 *   Operator/subscriber edit. Body: { action, gcid }
 *   action: 'add' | 'remove' | 'set_primary'
 *   Writes are recorded as assigned_by='operator' (or 'subscriber') so
 *   they're preserved by the auto-categorizer on re-run.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.business_id,
      ma.ai_analysis, ma.gps_lat, ma.gps_lng,
      (EXISTS(SELECT 1 FROM recordings WHERE source_asset_id = ma.id AND transcript IS NOT NULL AND transcript <> '' AND archived_at IS NULL)
        OR (ma.context_note IS NOT NULL AND ma.context_note <> '')) AS has_transcript
    FROM media_assets ma WHERE ma.id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const [owned] = await sql`
    SELECT id FROM businesses WHERE id = ${asset.site_id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!owned) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const siteCategories = await sql`
    SELECT sgc.gcid, gc.name
    FROM business_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${asset.site_id}
    ORDER BY sgc.is_primary DESC, gc.name
  `;

  const assignments = await sql`
    SELECT ac.gcid, gc.name, ac.is_primary, ac.confidence, ac.assigned_by, ac.reasoning, ac.assigned_at
    FROM asset_categories ac JOIN gbp_categories gc ON gc.gcid = ac.gcid
    WHERE ac.asset_id = ${assetId}
    ORDER BY ac.is_primary DESC, ac.confidence DESC NULLS LAST
  `;

  // Surface the rest of the committed cascade artifact + brand links
  // + JIT-computed service area matches so the Auto-tag card can
  // render the full picture (same fields shown during preview).
  const analysis = asset.ai_analysis as Record<string, unknown> | null;
  let committed: Record<string, unknown> | null = null;
  if (analysis) {
    const narrative = await getAssetNarrative(assetId);
    const transcript = narrative.text.trim();
    // Recompute matchers at read time. Same approach as the preview
    // route — cheap (pure SQL + token math, no LLM), gives the
    // JsonViewer a uniform shape across preview and committed states.
    // Brand results also live in asset_brands but the matcher form
    // (matched + suggested_new) is what callers expect to inspect.
    // Project matching retired 2026-05-18 — projects are deliberate
    // subscriber buckets, not cascade output.
    const nerEntities = (analysis.entities ?? {}) as {
      brands?: Array<{ text: string; context_excerpt: string }>;
    };
    const nerBrandCandidates = (nerEntities.brands ?? []).map((b) => ({
      name: b.text,
      context: b.context_excerpt,
    }));

    const [brandRows, projectRows, brandMatch, serviceAreaMatch] = await Promise.all([
      sql`
        SELECT b.name, b.slug
        FROM asset_brands ab JOIN brands b ON b.id = ab.brand_id
        WHERE ab.asset_id = ${assetId}
        ORDER BY b.name
      `,
      sql`
        SELECT p.name, p.slug
        FROM asset_projects ap JOIN projects p ON p.id = ap.project_id
        WHERE ap.asset_id = ${assetId}
        ORDER BY p.name
      `,
      matchBrandsFromNer(asset.site_id as string, nerBrandCandidates),
      transcript.length > 0
        ? matchServiceAreas(
            asset.site_id as string,
            transcript,
            asset.gps_lat as number | null,
            asset.gps_lng as number | null,
          )
        : Promise.resolve({ matched: [] }),
    ]);
    committed = {
      scene_types: analysis.scene_types ?? [],
      story_angles: analysis.story_angles ?? [],
      url_slug: analysis.url_slug ?? "",
      suggested_pillar: analysis.suggested_pillar ?? null,
      brands: brandRows.map((r) => ({ name: r.name, slug: r.slug })),
      projects: projectRows.map((r) => ({ name: r.name, slug: r.slug })),
      service_areas: serviceAreaMatch.matched.map((m) => ({
        name: m.name,
        source: m.source,
      })),
      // Raw cascade artifact — powers the JsonViewer inspector.
      raw_analysis: analysis,
      raw_brand_match: brandMatch,
      raw_service_area_match: serviceAreaMatch,
    };
  }

  return NextResponse.json({
    asset: { id: asset.id, hasTranscript: asset.has_transcript },
    siteCategories,
    assignments,
    committed,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id: assetId } = await params;
  let body: { action?: string; gcid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  const gcid = body.gcid;
  if (!action || !gcid) return NextResponse.json({ error: "action and gcid required" }, { status: 400 });

  const [asset] = await sql`SELECT business_id FROM media_assets WHERE id = ${assetId}`;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const [owned] = await sql`
    SELECT id FROM businesses WHERE id = ${asset.site_id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!owned) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  // Validate gcid is in site's catalog
  const [valid] = await sql`
    SELECT 1 FROM business_gbp_categories WHERE business_id = ${asset.site_id} AND gcid = ${gcid}
  `;
  if (!valid) return NextResponse.json({ error: "gcid not in site's category set" }, { status: 400 });

  const assignedBy = auth.actingAsAdmin ? "operator" : "subscriber";

  if (action === "add") {
    const [existing] = await sql`
      SELECT 1 FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}
    `;
    if (existing) return NextResponse.json({ ok: true, note: "already assigned" });
    // Insert as non-primary; operator can promote separately
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, assigned_by)
      VALUES (${assetId}, ${gcid}, false, ${assignedBy})
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}`;
    return NextResponse.json({ ok: true });
  }

  if (action === "set_primary") {
    // Clear existing primary, then set this one (and ensure it exists)
    await sql`
      UPDATE asset_categories SET is_primary = false WHERE asset_id = ${assetId}
    `;
    const [existing] = await sql`
      SELECT 1 FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}
    `;
    if (existing) {
      await sql`
        UPDATE asset_categories
        SET is_primary = true, assigned_by = ${assignedBy}
        WHERE asset_id = ${assetId} AND gcid = ${gcid}
      `;
    } else {
      await sql`
        INSERT INTO asset_categories (asset_id, gcid, is_primary, assigned_by)
        VALUES (${assetId}, ${gcid}, true, ${assignedBy})
      `;
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
