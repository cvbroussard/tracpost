import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SeoDashboardClient } from "./seo-dashboard";

export const dynamic = "force-dynamic";

export default async function SeoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">SEO</h1>
        <p className="py-12 text-center text-sm text-muted">
          Add a site first.
        </p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [audits, contentRows, siteRows] = await Promise.all([
    sql`
      SELECT id, page_type, url, seo_score, issues, created_at
      FROM seo_audits
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    sql`
      SELECT id, page_type, page_id, meta_title, meta_description,
             og_title, og_description, structured_data, status, updated_at
      FROM seo_content
      WHERE site_id = ${siteId}
      ORDER BY updated_at DESC
      LIMIT 50
    `,
    sql`
      SELECT id, name, url FROM sites WHERE id = ${siteId}
    `,
  ]);

  const site = siteRows[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">SEO</h1>
      <p className="mb-8 text-sm text-muted">
        On-page SEO injection and audit results
      </p>

      <SeoDashboardClient
        siteId={siteId}
        siteName={(site?.name as string) || ""}
        siteUrl={(site?.url as string) || ""}
        audits={audits as AuditRow[]}
        content={contentRows as ContentRow[]}
      />
    </div>
  );
}

export interface AuditRow {
  id: string;
  page_type: string | null;
  url: string | null;
  seo_score: number | null;
  issues: string[] | null;
  created_at: string;
}

export interface ContentRow {
  id: string;
  page_type: string | null;
  page_id: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  structured_data: unknown;
  status: string | null;
  updated_at: string;
}
