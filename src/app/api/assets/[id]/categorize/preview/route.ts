import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { runStage1 } from "@/lib/categorization/stage1-extract";
import { runStage2 } from "@/lib/categorization/stage2-multimodal";
import { matchBrandsFromNer } from "@/lib/categorization/brand-match";
import { getAssetNarrative } from "@/lib/asset-narrative";

export const runtime = "nodejs";
export const maxDuration = 60; // Sonnet vision ~5s + Haiku NER ~1s + overhead

/**
 * POST /api/assets/[id]/categorize/preview
 *
 * Runs the two-stage cascade (NER + multimodal vision) and returns the
 * artifact WITHOUT persisting. Used by the asset modal's Auto-tag
 * affordance to show subscribers what would happen before they commit.
 *
 * Body (optional):
 *   { transcript?: string } — for the transient-recording case where
 *     subscriber just stopped recording but hasn't committed yet.
 *     If omitted, reads from getAssetNarrative (latest active recording).
 *
 * Response:
 *   { ok: true, stage1, stage2, brand_match: { matched, suggested_new } }
 *   or { ok: false, error, stage }
 *
 * brand_match shows what cascade-commit would link from the catalog and
 * what unmatched NER candidates the subscriber could promote to new
 * brands. Computed locally, no LLM cost.
 *
 * Cost: ~$0.025 per call (Haiku $0.005 + Sonnet vision $0.02).
 * Does NOT persist anything. Safe to fire multiple times.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  // Validate asset belongs to subscriber's site set
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  // Body — optional transient transcript override
  let body: { transcript?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine — default to reading from getAssetNarrative
  }

  // Resolve transcript — body wins (transient case), else getAssetNarrative
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

  // Load site categories + pillar options. Brand catalog is NOT loaded
  // here — Stage 2 doesn't see brands anymore (hallucination prevention);
  // brand matching happens via Stage 1 NER + the matcher below.
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

  // Full pillar+tag taxonomy — story_angles output is constrained to
  // tag IDs from this config (Option C per project_tracpost_asset
  // _analysis_cascade memory). suggested_pillar is a pillar ID from it.
  const pillarConfig = (siteRow[0]?.pillar_config || []) as Array<{
    id: string;
    label: string;
    description?: string;
    tags: Array<{ id: string; label: string; description?: string }>;
  }>;
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

  // Stage 1 — NER
  const s1 = await runStage1(transcript);
  if (s1.status === "error") {
    return NextResponse.json({ ok: false, error: s1.error, stage: "stage1" }, { status: 500 });
  }
  const stage1 = s1.status === "success" ? s1.result : null;

  // Stage 2 — multimodal vision
  const s2 = await runStage2({
    assetId,
    imageUrl,
    transcript,
    stage1,
    siteCategories: siteCategories as Array<{ gcid: string; name: string }>,
    brandDnaDigest,
    pillarConfig,
  });

  if (s2.status === "error") {
    return NextResponse.json({ ok: false, error: s2.error, stage: "stage2" }, { status: 500 });
  }
  if (s2.status === "skipped") {
    return NextResponse.json({ ok: false, error: `Stage 2 skipped: ${s2.reason}`, stage: "stage2" }, { status: 400 });
  }

  // Brand match preview — pure local, no LLM. Mirrors what commit will do.
  const nerBrandCandidates = stage1?.entities.brands.map((b) => ({
    name: b.text,
    context: b.context_excerpt,
  })) ?? [];
  const brandMatch = await matchBrandsFromNer(asset.site_id as string, nerBrandCandidates);

  return NextResponse.json({
    ok: true,
    stage1,
    stage2: s2.result,
    brand_match: brandMatch,
  });
}
