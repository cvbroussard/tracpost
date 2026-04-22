import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MonitoringClient } from "./monitoring-client";

export const dynamic = "force-dynamic";

export default async function SeoMonitoringPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">SEO Monitoring</h1>
        <p className="py-12 text-center text-sm text-muted">
          Add a site first.
        </p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  // Fetch latest site audit
  const [auditRows, siteRows] = await Promise.all([
    sql`
      SELECT id, page_type, url, audit_data, seo_score, issues, created_at
      FROM seo_audits
      WHERE site_id = ${siteId} AND page_type = 'site_audit'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    sql`
      SELECT id, name, url FROM sites WHERE id = ${siteId}
    `,
  ]);

  const site = siteRows[0];
  const latestAudit = auditRows[0] || null;

  // If we have an audit, fetch per-page results from that audit run
  let pageAudits: PageAuditRow[] = [];
  if (latestAudit) {
    const pageRows = await sql`
      SELECT page_type, url, seo_score, issues, audit_data, created_at
      FROM seo_audits
      WHERE site_id = ${siteId}
        AND page_type != 'site_audit'
        AND created_at >= ${latestAudit.created_at}::timestamptz - INTERVAL '1 minute'
        AND created_at <= ${latestAudit.created_at}::timestamptz + INTERVAL '5 minutes'
      ORDER BY seo_score ASC
      LIMIT 100
    `;
    pageAudits = pageRows as PageAuditRow[];
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="mb-1 text-lg font-semibold">SEO Monitoring</h1>
      <p className="mb-8 text-sm text-muted">
        Site health, issues, and Core Web Vitals
      </p>

      <MonitoringClient
        siteId={siteId}
        siteName={(site?.name as string) || ""}
        siteUrl={(site?.url as string) || ""}
        latestAudit={
          latestAudit
            ? {
                id: latestAudit.id as string,
                overallScore: latestAudit.seo_score as number,
                url: latestAudit.url as string,
                auditData: latestAudit.audit_data as AuditData,
                issues: latestAudit.issues as IssueRow[],
                createdAt: latestAudit.created_at as string,
              }
            : null
        }
        pageAudits={pageAudits}
      />
    </div>
  );
}

export interface IssueRow {
  category: string;
  severity: string;
  url: string;
  message: string;
}

export interface AuditData {
  totalPages?: number;
  cwvSummary?: {
    url: string;
    lcp: { value: number; unit: string; status: string } | null;
    inp: { value: number; unit: string; status: string } | null;
    cls: { value: number; unit: string; status: string } | null;
    fcp: { value: number; unit: string; status: string } | null;
    performanceScore: number | null;
    error?: string;
  } | null;
  pages?: Array<{
    url: string;
    score: number;
    title: string | null;
    pageType: string;
    issueCount: number;
  }>;
}

export interface PageAuditRow {
  page_type: string | null;
  url: string | null;
  seo_score: number | null;
  issues: IssueRow[] | null;
  audit_data: Record<string, unknown> | null;
  created_at: string;
}
