import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET  /api/admin/sites/[siteId]/corrections — list active corrections
 * POST /api/admin/sites/[siteId]/corrections — add a new correction
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const corrections = await sql`
    SELECT * FROM content_corrections
    WHERE site_id = ${siteId}
    ORDER BY is_active DESC, created_at DESC
  `;

  return NextResponse.json({ corrections });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json();

  const { category, rule, scope, example_before, example_after, source_note } = body;

  if (!category || !rule) {
    return NextResponse.json({ error: "category and rule required" }, { status: 400 });
  }

  // Preview impact before saving
  if (body.preview_only) {
    const { previewImpact } = await import("@/lib/corrections");
    const terms = example_before ? [example_before] : rule.match(/"([^"]+)"/g)?.map((t: string) => t.replace(/"/g, "")) || [];
    const impact = await previewImpact(siteId, terms);
    return NextResponse.json({ impact });
  }

  const [correction] = await sql`
    INSERT INTO content_corrections (
      site_id, category, rule, scope,
      example_before, example_after, source_note, created_by
    ) VALUES (
      ${siteId}, ${category}, ${rule}, ${scope || "all"},
      ${example_before || null}, ${example_after || null},
      ${source_note || null}, 'admin'
    )
    RETURNING *
  `;

  return NextResponse.json({ correction });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`
    UPDATE content_corrections
    SET is_active = ${is_active ?? false}, updated_at = NOW()
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: true });
}
