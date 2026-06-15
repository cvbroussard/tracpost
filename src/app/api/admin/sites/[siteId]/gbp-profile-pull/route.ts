import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { syncProfileFromGoogle } from "@/lib/gbp/profile";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/sites/[siteId]/gbp-profile-pull
 *
 * Manual GBP profile re-sync. Pulls everything except photos from Google's
 * Business Information API and overwrites our local cache. Use when the
 * owner edits GBP directly on Google (e.g., description rewrite) and PPA
 * needs to observe the live state.
 *
 * Photos are a separate sync flow (POST /api/admin/sites/[siteId]/photos
 * { action: "pull" }).
 *
 * Categories handling unchanged — TracPost stays canonical for categories
 * per the locked GBP field categorization doctrine.
 *
 * Returns before/after description for visual confirmation.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await ctx.params;
  try {
    const [before] = await sql`
      SELECT gbp_profile->>'description' AS description FROM businesses WHERE id = ${siteId}
    `;
    const result = await syncProfileFromGoogle(siteId, "tenant", {
      forceOverwrite: true,
    });
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "no_credentials_or_fetch_failed", message: "Could not fetch profile from Google" },
        { status: 502 },
      );
    }
    const [after] = await sql`
      SELECT gbp_profile->>'description' AS description FROM businesses WHERE id = ${siteId}
    `;
    return NextResponse.json({
      ok: true,
      description_changed: (before?.description ?? null) !== (after?.description ?? null),
      description_before: before?.description ?? null,
      description_after: after?.description ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gbp-profile-pull] failed:", msg);
    return NextResponse.json(
      { ok: false, error: "internal", message: msg },
      { status: 500 },
    );
  }
}
