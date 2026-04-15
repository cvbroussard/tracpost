import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { generateWebsiteCopy } from "@/lib/tenant-site/copy-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/sites/[siteId]/regenerate-copy
 *
 * Re-runs the website copy generator using the tenant's current
 * sharpened playbook + brand info, stores result in sites.website_copy.
 * Triggers revalidation of the tenant's marketing routes so the new
 * copy renders on next request.
 *
 * Takes ~30-60s due to the Anthropic call. Marked nodejs runtime + 60s
 * maxDuration since copy gen is a single Claude call (no cascade).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT name, blog_slug, business_type, location, brand_playbook
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  if (!site.brand_playbook) {
    return NextResponse.json({ error: "No brand playbook — sharpen first" }, { status: 400 });
  }

  const playbook = site.brand_playbook as Record<string, unknown>;
  const positioning = (playbook.brandPositioning as Record<string, unknown>) || {};
  const angle = ((positioning.selectedAngles as Array<Record<string, unknown>>) || [])[0] || {};
  const audience = (playbook.audienceResearch as Record<string, unknown>) || {};
  const langMap = (audience.languageMap as Record<string, string[]>) || {};
  const painPoints = ((audience.painPoints as Array<Record<string, unknown>>) || [])
    .map((p) => String(p.pain));
  const offerCore = (playbook.offerCore as Record<string, unknown>) || {};
  const offerStatement = (offerCore.offerStatement as Record<string, unknown>) || {};

  try {
    const copy = await generateWebsiteCopy({
      siteName: String(site.name || ""),
      businessType: String(site.business_type || "business"),
      location: String(site.location || ""),
      tagline: String(angle.tagline || ""),
      offer: String(offerStatement.finalStatement || ""),
      tone: String(angle.tone || ""),
      contentThemes: (angle.contentThemes as string[]) || [],
      painPoints,
      desirePhrases: langMap.desirePhrases || [],
    });

    await sql`
      UPDATE sites SET website_copy = ${JSON.stringify(copy)}::jsonb
      WHERE id = ${siteId}
    `;

    if (site.blog_slug) {
      revalidatePath(`/tenant/${site.blog_slug}`, "layout");
    }

    return NextResponse.json({
      ok: true,
      preview: {
        heroTitle: copy.home?.heroTitle,
        heroSubtitle: copy.home?.heroSubtitle?.slice(0, 100),
        ctaText: copy.home?.ctaText,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copy generation failed" },
      { status: 500 },
    );
  }
}
