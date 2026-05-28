import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/assets/reorder
 *
 * Reorder an asset by placing it between two neighbors.
 * Body: { asset_id, before_id?, after_id? }
 *
 * Calculates the midpoint sort_order between the two neighbors.
 * If only before_id: place after the last item (before_id.sort_order + 1)
 * If only after_id: place before the first item (after_id.sort_order - 1)
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { asset_id, before_id, after_id } = await req.json();

  if (!asset_id) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  // Verify ownership
  const [asset] = await sql`
    SELECT ma.id FROM media_assets ma
    JOIN businesses s ON ma.business_id = s.id
    WHERE ma.id = ${asset_id} AND s.billing_account_id = ${auth.subscriptionId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  let newSortOrder: number;

  if (before_id && after_id) {
    // Place between two assets
    const [before] = await sql`SELECT sort_order FROM media_assets WHERE id = ${before_id}`;
    const [after] = await sql`SELECT sort_order FROM media_assets WHERE id = ${after_id}`;
    const beforeOrder = (before?.sort_order as number) || 0;
    const afterOrder = (after?.sort_order as number) || 0;
    newSortOrder = (beforeOrder + afterOrder) / 2;
  } else if (before_id) {
    // Place after this asset (at the end)
    const [before] = await sql`SELECT sort_order FROM media_assets WHERE id = ${before_id}`;
    newSortOrder = ((before?.sort_order as number) || 0) + 1;
  } else if (after_id) {
    // Place before this asset (at the start)
    const [after] = await sql`SELECT sort_order FROM media_assets WHERE id = ${after_id}`;
    newSortOrder = ((after?.sort_order as number) || 0) - 1;
  } else {
    return NextResponse.json({ error: "before_id or after_id required" }, { status: 400 });
  }

  await sql`UPDATE media_assets SET sort_order = ${newSortOrder} WHERE id = ${asset_id}`;

  return NextResponse.json({ success: true, sort_order: newSortOrder });
}
