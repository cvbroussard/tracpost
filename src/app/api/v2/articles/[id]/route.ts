import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * PATCH /api/v2/articles/[id]
 *
 * Updates a v2 blog article. Today: status changes only.
 * Body: { status: "draft" | "published" | "flagged" | "archived" }
 *
 * Allowed transitions:
 *   draft → published       (sets published_at = NOW())
 *   draft → archived
 *   published → archived
 *   published → draft       (un-publish; clears published_at)
 *   archived → draft
 *
 * Scoped to the active site only — operators can't update articles
 * on sites they're not on.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const { id } = await params;
  const body = await req.json();
  const status = body.status as string | undefined;

  const VALID = new Set(["draft", "published", "flagged", "archived"]);
  if (!status || !VALID.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify ownership before update
  const [existing] = await sql`
    SELECT id, status FROM blog_posts_v2
    WHERE id = ${id} AND business_id = ${session.activeSiteId}
  `;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const setPublishedAt = status === "published" && existing.status !== "published";
  const clearPublishedAt = status !== "published" && existing.status === "published";

  if (setPublishedAt) {
    await sql`
      UPDATE blog_posts_v2
      SET status = ${status}, published_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
    `;
  } else if (clearPublishedAt) {
    await sql`
      UPDATE blog_posts_v2
      SET status = ${status}, published_at = NULL, updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE blog_posts_v2
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  return NextResponse.json({ id, status, ok: true });
}

/**
 * DELETE /api/v2/articles/[id]
 *
 * Soft delete via status='archived'. Hard delete is intentionally not
 * supported here — operator scripts handle hard cleanup if needed.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const { id } = await params;
  const [existing] = await sql`
    SELECT id FROM blog_posts_v2
    WHERE id = ${id} AND business_id = ${session.activeSiteId}
  `;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`
    UPDATE blog_posts_v2
    SET status = 'archived', updated_at = NOW()
    WHERE id = ${id}
  `;
  return NextResponse.json({ id, status: "archived", ok: true });
}
