import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { generateHomePageHero } from "@/lib/website-gen/generate";
import { persistDraft } from "@/lib/website-gen/persist";

/**
 * POST /api/admin/businesses/[id]/website/generate-home
 *
 * Phase 1 of the website generator: generates the home-page hero section
 * from the brand catalog and persists as a draft row in website_content.
 *
 * Returns the generated content + draft id on success.
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
    const result = await generateHomePageHero(id);
    const persisted = await persistDraft({
      business_id: result.business_id,
      page_key: "home",
      content: result.content,
      generated_from_catalog_version: result.catalog_version,
      generated_from_catalog_snapshot_id: result.snapshot_id,
      generator_model: result.model,
      generator_prompt_version: result.prompt_version,
    });
    return NextResponse.json({
      ok: true,
      draft_id: persisted.id,
      generated_at: persisted.generated_at,
      snapshot_id: result.snapshot_id,
      content: result.content,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[website-gen] generate-home failed:", msg);
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: msg },
      { status: 500 },
    );
  }
}
