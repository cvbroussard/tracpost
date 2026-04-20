import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET  /api/google/profile?site_id=xxx — fetch GBP profile data
 * POST /api/google/profile — update profile fields
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const { fetchProfile } = await import("@/lib/gbp/profile");
  const profile = await fetchProfile(siteId);

  if (!profile) {
    return NextResponse.json({ error: "No active GBP connection" }, { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { site_id, action, ...updates } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Manual refresh from Google
  if (action === "sync") {
    const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
    const profile = await syncProfileFromGoogle(site_id);
    return profile
      ? NextResponse.json(profile)
      : NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  const { updateProfile } = await import("@/lib/gbp/profile");
  const result = await updateProfile(site_id, updates);

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
