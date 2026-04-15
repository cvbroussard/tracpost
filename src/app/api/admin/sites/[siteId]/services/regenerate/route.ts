import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { categorizeForSite } from "@/lib/services/categorize";
import { deriveServicesForSite } from "@/lib/services/derive";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/sites/[siteId]/services/regenerate
 *
 * Actions:
 *   { step: "categorize" }     → classify GBP categories only
 *   { step: "derive" }         → regenerate services (requires existing categories)
 *   { step: "all" }            → categorize then derive (default)
 *
 * Always uses force=true for derive — admin invocation means they
 * want a fresh result, not a skip if services already exist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json().catch(() => ({}));
  const step: "categorize" | "derive" | "all" = body.step || "all";

  const [site] = await sql`SELECT blog_slug FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const result: Record<string, unknown> = {};

  try {
    if (step === "categorize" || step === "all") {
      const categorization = await categorizeForSite(siteId);
      result.categorization = {
        primary: categorization.primary,
        additional_count: categorization.additional.length,
      };
    }

    if (step === "derive" || step === "all") {
      const services = await deriveServicesForSite(siteId, { force: true });
      result.services = services;
    }

    if (site.blog_slug) {
      revalidatePath(`/tenant/${site.blog_slug}/work`, "page");
      revalidatePath(`/tenant/${site.blog_slug}/services/[serviceSlug]`, "page");
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
