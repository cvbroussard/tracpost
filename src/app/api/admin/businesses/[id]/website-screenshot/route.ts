import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { captureBusinessWebsiteScreenshot } from "@/lib/capture/website-screenshot";
import { CaptureError } from "@/lib/capture/types";

/**
 * POST /api/admin/businesses/[id]/website-screenshot
 *
 * Captures the brand's homepage via headless Chrome, uploads to R2, and
 * writes the resulting URL to businesses.business_website_screenshot.
 * Returns the new URL on success or a typed error envelope on failure.
 *
 * Operator-authed. Manual trigger from the Infrastructure pipeline
 * Website card. Future iterations may add self-heal inside the PPA
 * action and/or auto-capture on business_info complete.
 */
export const maxDuration = 60; // seconds — chromium boot + render budget

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const result = await captureBusinessWebsiteScreenshot(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CaptureError) {
      const status =
        e.kind === "invalid_request"
          ? 400
          : e.kind === "navigation_failed" || e.kind === "render_timeout" || e.kind === "selector_not_found"
            ? 502
            : 500;
      return NextResponse.json(
        { ok: false, error: e.kind, message: e.message },
        { status },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "internal", message: msg },
      { status: 500 },
    );
  }
}
