import { sql } from "@/lib/db";
import { SeoAdminClient } from "./seo-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  const sites = await sql`
    SELECT s.id, s.name, s.gsc_property, s.gsc_verification_token,
           bs.custom_domain,
           (SELECT COUNT(*)::int FROM page_scores WHERE business_id = s.id) AS score_count,
           (SELECT COUNT(*)::int FROM search_performance WHERE business_id = s.id) AS search_count
    FROM businesses s
    LEFT JOIN blog_settings bs ON bs.business_id = s.id
    WHERE s.is_active = true
    ORDER BY s.name ASC
  `;

  return (
    <SeoAdminClient
      sites={sites.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        customDomain: (s.custom_domain as string) || null,
        gscProperty: (s.gsc_property as string) || null,
        gscVerificationToken: (s.gsc_verification_token as string) || null,
        scoreCount: (s.score_count as number) || 0,
        searchCount: (s.search_count as number) || 0,
      }))}
    />
  );
}
