import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/projects/:id — update a project
 * Body: { name?, status?, start_date?, end_date?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [project] = await sql`
    SELECT p.id FROM projects p
    JOIN businesses s ON p.business_id = s.id
    WHERE p.id = ${id} AND s.billing_account_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE projects SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.status !== undefined) {
    await sql`UPDATE projects SET status = ${body.status} WHERE id = ${id}`;
  }
  if (body.start_date !== undefined) {
    await sql`UPDATE projects SET start_date = ${body.start_date || null} WHERE id = ${id}`;
  }
  if (body.end_date !== undefined) {
    await sql`UPDATE projects SET end_date = ${body.end_date || null} WHERE id = ${id}`;
  }
  if (body.address !== undefined) {
    await sql`UPDATE projects SET address = ${body.address || null} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE projects SET description = ${body.description || null} WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE projects SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }
  if (body.metadata !== undefined) {
    const mj = typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {});
    await sql`UPDATE projects SET metadata = ${mj}::jsonb WHERE id = ${id}`;
  }
  if (body.caption_mode !== undefined) {
    await sql`UPDATE projects SET caption_mode = ${body.caption_mode} WHERE id = ${id}`;
  }
  // place_id / gps_lat / gps_lng come together from the LocationPicker.
  // We accept them independently for flexibility but they should normally
  // arrive as a set when the subscriber picks an address.
  if (body.place_id !== undefined) {
    await sql`UPDATE projects SET place_id = ${body.place_id || null} WHERE id = ${id}`;
  }
  if (body.gps_lat !== undefined) {
    await sql`UPDATE projects SET gps_lat = ${body.gps_lat ?? null} WHERE id = ${id}`;
  }
  if (body.gps_lng !== undefined) {
    await sql`UPDATE projects SET gps_lng = ${body.gps_lng ?? null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, status, start_date, end_date, address, description, hero_asset_id, metadata, caption_mode, manual_caption_count, place_id, gps_lat, gps_lng FROM projects WHERE id = ${id}`;

  // Format dates as YYYY-MM-DD for client consumption
  return NextResponse.json({
    project: {
      ...updated,
      start_date: updated.start_date ? new Date(updated.start_date as string).toISOString().slice(0, 10) : null,
      end_date: updated.end_date ? new Date(updated.end_date as string).toISOString().slice(0, 10) : null,
    },
  });
}

/**
 * DELETE /api/projects/:id
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
    DELETE FROM projects p
    USING businesses s
    WHERE p.business_id = s.id AND p.id = ${id} AND s.billing_account_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
