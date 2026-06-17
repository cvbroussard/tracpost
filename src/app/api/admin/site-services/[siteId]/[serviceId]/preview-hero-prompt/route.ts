/**
 * POST /api/admin/site-services/[siteId]/[serviceId]/preview-hero-prompt
 *
 * Builds the {image_prompt, alt} from service context + brand catalog
 * WITHOUT firing the image generation. Lets the UI show the prompt
 * preview panel before the operator commits to the ~$0.04 + 20-40s
 * generation cost.
 *
 * Returns the prompt, alt, catalog inputs used/missing for transparency
 * per the doctrine discussion (operator sees, doesn't edit).
 *
 * Cost: ~$0.002 (one Sonnet call). Fast (~5-10s).
 */
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { previewServiceHeroPrompt } from "@/lib/image-gen/generate-service-hero";

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
    const result = await previewServiceHeroPrompt(siteId, serviceId);
    return NextResponse.json({
      ok: true,
      service: {
        id: result.service.id,
        name: result.service.name,
        cluster_intent_label: result.service.cluster_intent_label,
        primary_category_name: result.service.primary_category_name,
      },
      prompt: result.prompt,
      alt: result.alt,
      aspectRatio: result.aspectRatio,
      catalogDescriptorsUsed: result.meta.catalog_descriptors_used,
      catalogDescriptorsMissing: result.meta.catalog_descriptors_missing,
      model: result.meta.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[service-hero preview] failed:", msg);
    return NextResponse.json(
      { ok: false, error: "preview_failed", message: msg },
      { status: 500 },
    );
  }
}
