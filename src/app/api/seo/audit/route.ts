import { sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { auditSite } from "@/lib/seo/audit";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/seo/audit — Trigger an on-demand audit for a site.
 * Body: { siteId: string }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  let body: { siteId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { siteId } = body;
  if (!siteId) {
    return NextResponse.json(
      { error: "siteId is required" },
      { status: 400 }
    );
  }

  // Verify site belongs to subscriber
  const siteRows = await sql`
    SELECT id, url FROM businesses
    WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;

  if (siteRows.length === 0) {
    return NextResponse.json(
      { error: "Site not found or not authorized" },
      { status: 404 }
    );
  }

  const siteUrl = siteRows[0].url as string;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "Site has no URL configured" },
      { status: 400 }
    );
  }

  try {
    const result = await auditSite(siteId, siteUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/seo/audit?siteId=X — Fetch latest audit results for a site.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json(
      { error: "siteId query param is required" },
      { status: 400 }
    );
  }

  // Verify site belongs to subscriber
  const siteRows = await sql`
    SELECT id FROM businesses
    WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;

  if (siteRows.length === 0) {
    return NextResponse.json(
      { error: "Site not found or not authorized" },
      { status: 404 }
    );
  }

  // Get the latest site_audit record
  const auditRows = await sql`
    SELECT id, page_type, url, audit_data, seo_score, issues, created_at
    FROM seo_audits
    WHERE business_id = ${siteId} AND page_type = 'site_audit'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (auditRows.length === 0) {
    return NextResponse.json({
      audit: null,
      message: "No audit found. Run an audit first.",
    });
  }

  const latest = auditRows[0];

  // Also get per-page results from the same time period
  const pageRows = await sql`
    SELECT page_type, url, seo_score, issues, audit_data, created_at
    FROM seo_audits
    WHERE business_id = ${siteId}
      AND page_type != 'site_audit'
      AND created_at >= ${latest.created_at}::timestamptz - INTERVAL '1 minute'
      AND created_at <= ${latest.created_at}::timestamptz + INTERVAL '5 minutes'
    ORDER BY seo_score ASC
    LIMIT 100
  `;

  return NextResponse.json({
    audit: {
      id: latest.id,
      overallScore: latest.seo_score,
      url: latest.url,
      auditData: latest.audit_data,
      issues: latest.issues,
      createdAt: latest.created_at,
    },
    pages: pageRows.map((r) => ({
      pageType: r.page_type,
      url: r.url,
      score: r.seo_score,
      issues: r.issues,
      auditData: r.audit_data,
    })),
  });
}
