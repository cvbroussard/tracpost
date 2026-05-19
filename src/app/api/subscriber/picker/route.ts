import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET  /api/subscriber/picker?site_id=...&kind=project
 *   Returns the subscriber's currently-selected entity for the given
 *   picker kind on the given site. Used by the upload bar to default
 *   its picker to the last picked value across refresh + device.
 *
 *   Response: { entity_id: string | null, updated_at: string | null }
 *
 * PUT  /api/subscriber/picker
 *   Body: { site_id, picker_kind, entity_id (UUID or null) }
 *   Upserts the subscriber's picker state. Null entity_id clears the
 *   pick (explicit "no project" mode).
 *
 * picker_kind constrained to 'project' | 'persona' (per migration 128).
 *
 * Authorization: subscriber must own the site_id (via session.sites).
 * No further authorization on entity_id — caller is responsible for
 * passing a valid ID; bad IDs will simply not match anything at upload
 * time and the asset_projects insert will silently no-op.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = req.nextUrl.searchParams.get("site_id");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!siteId || !kind) {
    return NextResponse.json({ error: "site_id and kind required" }, { status: 400 });
  }
  if (!session.sites.some((s) => s.id === siteId)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }

  const [row] = await sql`
    SELECT entity_id, updated_at FROM subscriber_pickers
    WHERE user_id = ${session.userId}
      AND site_id = ${siteId}
      AND picker_kind = ${kind}
  `;
  return NextResponse.json({
    entity_id: row?.entity_id || null,
    updated_at: row?.updated_at || null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { site_id?: string; picker_kind?: string; entity_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { site_id, picker_kind, entity_id } = body;
  if (!site_id || !picker_kind) {
    return NextResponse.json({ error: "site_id and picker_kind required" }, { status: 400 });
  }
  if (!session.sites.some((s) => s.id === site_id)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }
  if (picker_kind !== "project" && picker_kind !== "persona") {
    return NextResponse.json({ error: "picker_kind must be 'project' or 'persona'" }, { status: 400 });
  }

  await sql`
    INSERT INTO subscriber_pickers (user_id, site_id, picker_kind, entity_id, updated_at)
    VALUES (${session.userId}, ${site_id}, ${picker_kind}, ${entity_id || null}, NOW())
    ON CONFLICT (user_id, site_id, picker_kind) DO UPDATE SET
      entity_id = ${entity_id || null},
      updated_at = NOW()
  `;
  return NextResponse.json({ ok: true });
}
