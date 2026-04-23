import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/brand?site_id=xxx
 * Returns brand playbook data for a site.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT s.id, s.name, s.url, s.business_type, s.location,
           s.brand_playbook, s.brand_voice, s.content_vibe, s.image_style,
           s.provisioning_status
    FROM sites s
    WHERE s.id = ${siteId}
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const playbook = (site.brand_playbook || {}) as Record<string, unknown>;
  const brandVoice = (site.brand_voice || {}) as Record<string, unknown>;
  const subscriberAngle = (brandVoice._subscriberAngle as string) || null;

  return NextResponse.json({
    siteId: site.id,
    siteName: site.name,
    url: site.url,
    businessType: site.business_type,
    location: site.location,
    contentVibe: site.content_vibe,
    imageStyle: site.image_style,
    provisioningStatus: site.provisioning_status,
    hasPlaybook: !!(playbook.offerCore),
    playbook,
    subscriberAngle,
  });
}
