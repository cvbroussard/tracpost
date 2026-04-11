import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/website
 * Body: { site_id, action: "generate" }
 *
 * Generates a complete static website and deploys to Vercel.
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { site_id, action } = body;

  if (!site_id || action !== "generate") {
    return NextResponse.json({ error: "site_id and action='generate' required" }, { status: 400 });
  }

  try {
    const { spinWebsite } = await import("@/lib/website-spinner/generate");
    const result = await spinWebsite(site_id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
