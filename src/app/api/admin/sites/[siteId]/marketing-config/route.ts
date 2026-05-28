import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";

/**
 * POST /api/admin/sites/[siteId]/marketing-config
 *
 * Patches marketing-site config fields on the sites row. Body may
 * include any subset of:
 *   - page_config: PageConfig (the 6-slot array)
 *   - work_content: WorkContent (variant + tiles/tiers)
 *   - hero_asset_id: UUID | null
 *
 * Each field is updated independently (only fields present in the body
 * are written). Triggers revalidation of the tenant's marketing routes
 * after save so the change shows up on the next request.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { page_config, work_content, hero_asset_id } = body as {
    page_config?: unknown;
    work_content?: unknown;
    hero_asset_id?: string | null;
  };

  const updates: string[] = [];

  if (page_config !== undefined) {
    if (!Array.isArray(page_config)) {
      return NextResponse.json({ error: "page_config must be an array" }, { status: 400 });
    }
    await sql`
      UPDATE businesses SET page_config = ${JSON.stringify(page_config)}::jsonb
      WHERE id = ${siteId}
    `;
    updates.push("page_config");
  }

  if (work_content !== undefined) {
    if (typeof work_content !== "object" || work_content === null) {
      return NextResponse.json({ error: "work_content must be an object" }, { status: 400 });
    }
    await sql`
      UPDATE businesses SET work_content = ${JSON.stringify(work_content)}::jsonb
      WHERE id = ${siteId}
    `;
    updates.push("work_content");
  }

  if (hero_asset_id !== undefined) {
    // Validate the asset belongs to this site (or is null to clear)
    if (hero_asset_id === null) {
      await sql`UPDATE businesses SET hero_asset_id = NULL WHERE id = ${siteId}`;
    } else {
      const [asset] = await sql`
        SELECT id FROM media_assets
        WHERE id = ${hero_asset_id} AND business_id = ${siteId}
      `;
      if (!asset) {
        return NextResponse.json({ error: "hero_asset_id not found on this site" }, { status: 404 });
      }
      await sql`
        UPDATE businesses SET hero_asset_id = ${hero_asset_id} WHERE id = ${siteId}
      `;
    }
    updates.push("hero_asset_id");
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Look up siteSlug so we can revalidate the tenant's routes
  const [site] = await sql`SELECT blog_slug FROM businesses WHERE id = ${siteId}`;
  if (site?.blog_slug) {
    revalidatePath(`/tenant/${site.blog_slug}`, "layout");
  }

  return NextResponse.json({ ok: true, updated: updates });
}
