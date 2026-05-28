import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/services/:id — update a service
 * Body: { name?, description?, price_range?, duration?, display_order?,
 *         hero_asset_id?, metadata?, source? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [service] = await sql`
    SELECT s.id FROM services s
    JOIN businesses si ON s.business_id = si.id
    WHERE s.id = ${id} AND si.billing_account_id = ${auth.subscriptionId}
  `;
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE services SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE services SET description = ${body.description || null} WHERE id = ${id}`;
  }
  if (body.price_range !== undefined) {
    await sql`UPDATE services SET price_range = ${body.price_range || null} WHERE id = ${id}`;
  }
  if (body.duration !== undefined) {
    await sql`UPDATE services SET duration = ${body.duration || null} WHERE id = ${id}`;
  }
  if (body.display_order !== undefined) {
    await sql`UPDATE services SET display_order = ${body.display_order} WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE services SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }
  if (body.metadata !== undefined) {
    const mj = typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {});
    await sql`UPDATE services SET metadata = ${mj}::jsonb WHERE id = ${id}`;
  }
  if (body.source !== undefined) {
    await sql`UPDATE services SET source = ${body.source} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, description, price_range, duration, display_order, hero_asset_id, metadata, source FROM services WHERE id = ${id}`;
  return NextResponse.json({ service: updated });
}

/**
 * DELETE /api/services/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  await sql`
    DELETE FROM services s
    USING businesses si
    WHERE s.business_id = si.id AND s.id = ${id} AND si.billing_account_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
