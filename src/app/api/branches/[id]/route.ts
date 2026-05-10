import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/branches/:id — update a branch
 * Body: { name?, address?, city?, state?, description?, phone?, is_primary? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [branch] = await sql`
    SELECT b.id FROM branches b
    JOIN sites s ON b.site_id = s.id
    WHERE b.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE branches SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.address !== undefined) {
    await sql`UPDATE branches SET address = ${body.address || null} WHERE id = ${id}`;
  }
  if (body.city !== undefined) {
    await sql`UPDATE branches SET city = ${body.city || null} WHERE id = ${id}`;
  }
  if (body.state !== undefined) {
    await sql`UPDATE branches SET state = ${body.state || null} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE branches SET description = ${body.description || null} WHERE id = ${id}`;
  }
  if (body.phone !== undefined) {
    await sql`UPDATE branches SET phone = ${body.phone || null} WHERE id = ${id}`;
  }
  if (body.is_primary !== undefined) {
    await sql`UPDATE branches SET is_primary = ${!!body.is_primary} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, address, city, state, description, phone, is_primary FROM branches WHERE id = ${id}`;
  return NextResponse.json({ branch: updated });
}

/**
 * DELETE /api/branches/:id
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
    DELETE FROM branches b
    USING sites s
    WHERE b.site_id = s.id AND b.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
