/**
 * POST /api/admin/site-services/[siteId]/[serviceId]/generate-hero
 *
 * Full hero image generation for one service:
 *   1. Build prompt + alt from service + catalog (LLM)
 *   2. Render via Nano Banana
 *   3. Upload to R2, insert media_assets row
 *   4. UPDATE services.hero_asset_id
 *
 * Per [[manual-before-autopilot]]: operator explicitly triggers each
 * generation. ~$0.04 + 20-40s round-trip. Operator should see the
 * prompt preview first (via the preview endpoint) before committing.
 *
 * Invalidates tenant ISR for the services strip so the new hero
 * shows on the live site after generation.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-session";
import { generateServiceHero } from "@/lib/image-gen/generate-service-hero";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ siteId: string; serviceId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, serviceId } = await ctx.params;

  try {
    const result = await generateServiceHero(siteId, serviceId);

    // Invalidate tenant ISR so the new hero shows on the live site.
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
      console.warn("[service-hero generate] revalidate failed:", cacheErr);
    }

    return NextResponse.json({
      ok: true,
      serviceId: result.serviceId,
      assetId: result.assetId,
      url: result.url,
      alt: result.alt,
      prompt: result.prompt,
      durationMs: result.durationMs,
      bytesSize: result.bytesSize,
      catalogDescriptorsUsed: result.catalogDescriptorsUsed,
      catalogDescriptorsMissing: result.catalogDescriptorsMissing,
      model: result.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[service-hero generate] failed:", msg);
    return NextResponse.json(
      { ok: false, error: "generate_failed", message: msg },
      { status: 500 },
    );
  }
}
