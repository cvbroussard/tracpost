import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { commitCascade, type CommitCascadeInput } from "@/lib/categorization/cascade-commit";
import type { CascadeAnalysis } from "@/lib/categorization/cascade-analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/assets/[id]/categorize/commit
 *
 * Commits a previously-generated cascade preview. Persists the artifact
 * + brand match + R2 rename + metadata stamp, then fires the variant
 * render as a separate background fetch (own 60s budget).
 *
 * Two-function architecture (2026-05-17):
 *   - commitCascade: ~1-2s. Persists asset_analysis, asset_categories,
 *     asset_brands, R2 source rename, metadata stamp with
 *     variants_pending=true.
 *   - render-variants endpoint (separate): ~5-30s. Renders all
 *     applicable platform variants, clears variants_pending flag.
 *
 * Subscriber Save is released as soon as the first function returns —
 * typically inside 2 seconds. Background render runs independently;
 * if it fails or times out, variants_pending stays true and the
 * orchestrator pool query naturally skips the asset until variants
 * are ready (can be re-triggered by re-firing the render endpoint).
 *
 * Body:
 *   { analysis: CascadeAnalysis }
 *
 * Response:
 *   { ok: true, categoryRows, brandRows, suggestedNewBrandCount,
 *     slugApplied, renamed, variantCount, warnings, variantsScheduled }
 *
 * No LLM cost. SQL writes + R2 rename only in this function.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id: assetId } = await params;

  const [asset] = await sql`SELECT id, business_id FROM media_assets WHERE id = ${assetId}`;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const [owned] = await sql`
    SELECT id FROM businesses WHERE id = ${asset.site_id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!owned) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  let body: { analysis: CascadeAnalysis; approvals?: CommitCascadeInput["approvals"] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.analysis || !body.analysis.asset_categories?.primary?.gcid) {
    return NextResponse.json(
      { error: "Body must include analysis with asset_categories.primary" },
      { status: 400 },
    );
  }

  try {
    const result = await commitCascade({
      assetId,
      analysis: body.analysis,
      approvals: body.approvals,
    });

    // Fire variant render as a separate background function. waitUntil
    // ensures the fetch dispatches before this function exits. The
    // render endpoint runs as its own Vercel function with its own
    // 60s budget — subscriber's commit is decoupled from render
    // latency. Cookies forwarded so the render endpoint passes the
    // same session auth check.
    let variantsScheduled = false;
    try {
      const { waitUntil } = await import("@vercel/functions");
      const host = req.headers.get("host");
      const protocol = host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https";
      const cookie = req.headers.get("cookie") || "";
      waitUntil(
        fetch(`${protocol}://${host}/api/assets/${assetId}/render-variants?subscription_id=${auth.subscriptionId}`, {
          method: "POST",
          headers: { cookie },
        }).catch((err) => {
          console.error(`render-variants dispatch failed for ${assetId}:`, err);
        }),
      );
      variantsScheduled = true;
    } catch {
      // @vercel/functions unavailable (local dev) — caller can hit the
      // render endpoint manually or the next commit will retry.
    }

    return NextResponse.json({ ...result, variantsScheduled });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`commitCascade endpoint failed for ${assetId}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
