import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/tagging/config?site_id=...
 * Returns tag group labels for a site (per-business custom names for the
 * 6 tag groups: brands, services, projects, personas, branches, service_areas).
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT brand_label, project_label, persona_label, branch_label, service_area_label
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json({
    labels: {
      brand_label: site.brand_label as string | null,
      project_label: site.project_label as string | null,
      persona_label: site.persona_label as string | null,
      branch_label: site.branch_label as string | null,
      service_area_label: site.service_area_label as string | null,
    },
  });
}

/**
 * PATCH /api/tagging/config
 * Body: { site_id, brand_label?, project_label?, persona_label?, branch_label?, service_area_label? }
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { site_id, brand_label, project_label, persona_label, branch_label, service_area_label } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET brand_label = ${brand_label ?? null},
        project_label = ${project_label ?? null},
        persona_label = ${persona_label ?? null},
        branch_label = ${branch_label ?? null},
        service_area_label = ${service_area_label ?? null}
    WHERE id = ${site_id}
  `;

  return NextResponse.json({ success: true });
}
