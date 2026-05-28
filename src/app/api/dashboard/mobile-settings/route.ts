import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/dashboard/mobile-settings
 * Get mobile app settings for the active site.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT mobile_settings FROM businesses WHERE id = ${session.activeSiteId}
  `;

  const defaults = {
    auto_handle_compliments: false,
    veto_window_hours: 4,
    notify_pipeline: true,
    notify_reviews: true,
    notify_comments: true,
    notify_veto: true,
    notify_blog: true,
    capture_default_pillar: null,
    capture_max_video_seconds: 60,
  };

  const settings = { ...defaults, ...((site?.mobile_settings as Record<string, unknown>) || {}) };

  return NextResponse.json({ settings });
}

/**
 * POST /api/dashboard/mobile-settings
 * Update mobile app settings.
 * Body: partial settings object
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const body = await req.json();

  // Merge with existing
  const [site] = await sql`
    SELECT mobile_settings FROM businesses WHERE id = ${session.activeSiteId}
  `;

  const current = (site?.mobile_settings as Record<string, unknown>) || {};
  const updated = { ...current, ...body };

  await sql`
    UPDATE businesses
    SET mobile_settings = ${JSON.stringify(updated)}::jsonb, updated_at = NOW()
    WHERE id = ${session.activeSiteId}
  `;

  return NextResponse.json({ settings: updated });
}
