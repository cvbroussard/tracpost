import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/brands/:id — update a brand
 * Body: { name?, url?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [brand] = await sql`
    SELECT b.id FROM brands b
    JOIN sites s ON b.site_id = s.id
    WHERE b.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE brands SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.url !== undefined) {
    await sql`UPDATE brands SET url = ${body.url || null} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE brands SET description = ${body.description || null} WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE brands SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`
    SELECT b.id, b.name, b.slug, b.url, b.description, b.hero_asset_id,
           ma.storage_url AS hero_url
    FROM brands b
    LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
    WHERE b.id = ${id}
  `;
  return NextResponse.json({ brand: updated });
}

/**
 * DELETE /api/brands/:id
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
    DELETE FROM brands b
    USING sites s
    WHERE b.site_id = s.id AND b.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
