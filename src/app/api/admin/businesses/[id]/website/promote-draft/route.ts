import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-session";
import {
  promoteDraftToPublished,
  promoteLatestDraft,
} from "@/lib/website-gen/promote";

/**
 * POST /api/admin/businesses/[id]/website/promote-draft
 *   body: { draft_id?: string }
 *
 * If draft_id is provided, promotes that specific row. Otherwise
 * auto-picks the most recently generated draft for the home page.
 * Prior published row demoted to 'archived'. Atomic.
 *
 * Calls revalidatePath() on the tenant home so the ISR cache
 * (revalidate=3600 on tenant/[siteSlug]) flushes immediately instead
 * of holding stale render for up to an hour.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let draftId: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { draft_id?: string };
    draftId = body.draft_id;
  } catch {
    // empty body is allowed — we'll auto-pick latest draft
  }

  try {
    const result = draftId
      ? await promoteDraftToPublished({ business_id: id, draft_id: draftId })
      : await promoteLatestDraft({ business_id: id, page_key: "home" });

    // Look up the tenant slug so we can target the ISR cache. The
    // tenant homepage route is /tenant/[siteSlug] internally; the
    // public domain (b2construct.com) is served by Vercel's domain
    // mapping over the same route, so revalidating /tenant/<slug>
    // and / both helps.
    try {
      const [slugRow] = await sql`
        SELECT blog_slug FROM businesses WHERE id = ${id} LIMIT 1
      `;
      const slug = slugRow?.blog_slug as string | undefined;
      if (slug) {
        revalidatePath(`/tenant/${slug}`);
      }
      revalidatePath("/");
    } catch (cacheErr) {
      console.warn("[website-gen] revalidate failed:", cacheErr);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[website-gen] promote failed:", msg);
    return NextResponse.json(
      { ok: false, error: "promote_failed", message: msg },
      { status: 500 },
    );
  }
}
