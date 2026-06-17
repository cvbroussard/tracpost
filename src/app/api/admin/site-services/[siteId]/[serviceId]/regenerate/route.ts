/**
 * POST /api/admin/site-services/[siteId]/[serviceId]/regenerate
 *
 * Per-service regeneration. Refreshes ONLY name + description (and
 * price_range / duration when the playbook supports them) for the
 * specified service row. Stable identity preserved (id, slug,
 * primary_gcid, associated_gcids[], hero_asset_id, display_order).
 *
 * Per [[stable-service-identity]] doctrine: this is the granular,
 * non-destructive operator action. Use bulk regen only for strategic
 * refresh.
 *
 * Invalidates the tenant ISR cache so the change is visible on the
 * live site without waiting for revalidate window.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-session";
import { regenerateSingleService } from "@/lib/services/regenerate-single";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ siteId: string; serviceId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, serviceId } = await ctx.params;

  try {
    const refreshed = await regenerateSingleService({ siteId, serviceId });

    // Invalidate tenant ISR for the services strip.
    try {
      const [siteRow] = await sql`
        SELECT blog_slug FROM businesses WHERE id = ${siteId} LIMIT 1
      `;
      const slug = siteRow?.blog_slug as string | undefined;
      if (slug) {
        revalidatePath(`/tenant/${slug}/work`);
        revalidatePath(`/tenant/${slug}`);
      }
    } catch (cacheErr) {
      console.warn("[per-service regen] revalidate failed:", cacheErr);
    }

    return NextResponse.json({ ok: true, service: refreshed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[per-service regen] failed:", msg);
    return NextResponse.json(
      { ok: false, error: "regen_failed", message: msg },
      { status: 500 },
    );
  }
}
