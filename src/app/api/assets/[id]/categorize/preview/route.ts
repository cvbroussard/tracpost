import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { runCascade, type PillarConfigEntry } from "@/lib/categorization/cascade-analyze";
import { matchBrandsFromNer } from "@/lib/categorization/brand-match";
import { matchServiceAreas } from "@/lib/categorization/service-area-match";
import { getAssetNarrative } from "@/lib/asset-narrative";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/assets/[id]/categorize/preview
 *
 * Runs the cascade (NER + vision) and returns the artifact WITHOUT
 * persisting. Used by the asset modal's Auto-tag affordance to show
 * subscribers what would happen before they commit.
 *
 * Body (optional):
 *   { transcript?: string } — for the transient-recording case where
 *     subscriber just stopped recording but hasn't committed yet.
 *     If omitted, reads from getAssetNarrative (latest active recording).
 *
 * Response:
 *   { ok: true, analysis, brand_match: { matched, suggested_new } }
 *   or { ok: false, error, stage }
 *
 * brand_match shows what cascade-commit would link from the catalog and
 * what unmatched NER candidates the subscriber could promote to new
 * brands. Computed locally, no LLM cost.
 *
 * Cost: ~$0.025 per call (Haiku NER $0.005 + Sonnet vision $0.02).
 * Does NOT persist anything. Safe to fire multiple times.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id, gps_lat, gps_lng
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  let body: { transcript?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine
  }

  let transcript = body.transcript?.trim();
  if (!transcript) {
    const narrative = await getAssetNarrative(assetId);
    if (narrative.source === "empty" || !narrative.text.trim()) {
      return NextResponse.json(
        { ok: false, error: "No transcript available — record audio or type a context note first", stage: "precondition" },
        { status: 400 },
      );
    }
    transcript = narrative.text;
  }

  const [siteCategories, siteRow] = await Promise.all([
    sql`SELECT sgc.gcid, gc.name FROM site_gbp_categories sgc
        JOIN gbp_categories gc ON gc.gcid = sgc.gcid
        WHERE sgc.site_id = ${asset.site_id}
        ORDER BY sgc.is_primary DESC, gc.name`,
    sql`SELECT pillar_config, brand_dna FROM sites WHERE id = ${asset.site_id}`,
  ]);

  if (siteCategories.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Site has no GBP categories declared — complete categories coaching first", stage: "precondition" },
      { status: 400 },
    );
  }

  const pillarConfig = (siteRow[0]?.pillar_config || []) as PillarConfigEntry[];
  const brandDna = siteRow[0]?.brand_dna as Record<string, unknown> | null;
  const brandDnaDigest = brandDna
    ? "Site brand DNA available — voice + positioning signals present"
    : null;

  // Resolve image URL (video poster fallback)
  let imageUrl = asset.storage_url as string;
  if ((asset.media_type as string) === "video" && asset.poster_asset_id) {
    const [poster] = await sql`SELECT storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}`;
    imageUrl = (poster?.storage_url as string) || imageUrl;
  }

  const cascade = await runCascade({
    assetId,
    imageUrl,
    transcript,
    siteCategories: siteCategories as Array<{ gcid: string; name: string }>,
    pillarConfig,
    brandDnaDigest,
  });

  if (cascade.status === "error") {
    return NextResponse.json({ ok: false, error: cascade.error, stage: cascade.stage }, { status: 500 });
  }
  if (cascade.status === "skipped") {
    return NextResponse.json({ ok: false, error: `Cascade skipped: ${cascade.reason}`, stage: cascade.stage }, { status: 400 });
  }

  // Brand match preview — pure local, no LLM. Mirrors what commit will do.
  const nerBrandCandidates = cascade.result.entities.brands.map((b) => ({
    name: b.text,
    context: b.context_excerpt,
  }));

  // Service area match preview — pure local, no LLM. GBP-canonical
  // service areas matched against transcript substring + asset GPS
  // viewport containment (per project_tracpost_service_areas_gbp
  // _canonical memory). No persistence; orchestrator re-computes JIT
  // at gen time.
  const [brandMatch, serviceAreaMatch] = await Promise.all([
    matchBrandsFromNer(asset.site_id as string, nerBrandCandidates),
    matchServiceAreas(
      asset.site_id as string,
      transcript,
      asset.gps_lat as number | null,
      asset.gps_lng as number | null,
    ),
  ]);

  return NextResponse.json({
    ok: true,
    analysis: cascade.result,
    brand_match: brandMatch,
    service_area_match: serviceAreaMatch,
  });
}
