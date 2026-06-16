import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { generateHeroImageForBusiness } from "@/lib/image-gen/generate-hero-image";

/**
 * POST /api/admin/businesses/[id]/website/generate-hero-image
 *
 * Phase 2 of the website generator. Generates a brand-faithful hero
 * image via Nano Banana, persists to R2 + media_assets, and updates the
 * latest home-page draft's hero_image binding.
 *
 * Requires a Phase 1 draft to exist first (Phase 2 reads the hero
 * section's alt text as the prompt seed).
 */
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const result = await generateHeroImageForBusiness(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[website-gen] hero image gen failed:", msg);
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: msg },
      { status: 500 },
    );
  }
}
