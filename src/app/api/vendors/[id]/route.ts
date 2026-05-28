import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/vendors/:id — update a vendor
 * Body: { name?, url? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const body = await req.json();
  const { name, url } = body;

  // Verify ownership
  const [vendor] = await sql`
    SELECT id FROM entities WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  if (name !== undefined) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE entities SET name = ${name}, slug = ${slug} WHERE id = ${id}`;
  }
  if (url !== undefined) {
    await sql`UPDATE entities SET url = ${url || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, url FROM entities WHERE id = ${id}`;
  return NextResponse.json({ vendor: updated });
}

/**
 * DELETE /api/vendors/:id — delete a vendor
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
    DELETE FROM entities WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
