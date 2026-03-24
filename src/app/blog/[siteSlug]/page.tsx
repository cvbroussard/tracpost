import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSiteBySlug, getBlogPosts } from "@/lib/blog";
import { sql } from "@/lib/db";
import { generateHubSchema } from "@/lib/blog/schema";
import HubHeader from "@/components/blog/hub-header";
import HubReviews from "@/components/blog/hub-reviews";
import HubSpotlights from "@/components/blog/hub-spotlights";
import HubArticles from "@/components/blog/hub-articles";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return {};

  const title = site.blogTitle || site.siteName;
  const description = site.blogDescription || `${site.siteName} — articles, reviews, and more`;
  const hubUrl = `https://blog.tracpost.com/${siteSlug}`;

  return {
    title,
    description,
    alternates: {
      canonical: hubUrl,
      types: { "application/rss+xml": `/blog/${siteSlug}/feed.xml` },
    },
    openGraph: {
      title,
      description,
      url: hubUrl,
      type: "website",
    },
  };
}

export default async function HubPage({ params }: Props) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) notFound();

  // Parallel data fetches
  const [
    posts,
    socialAccounts,
    reviewAgg,
    topReviews,
    spotlightSessions,
    gbpData,
    logoAsset,
    siteRow,
  ] = await Promise.all([
    getBlogPosts(site.siteId, 10),
    sql`
      SELECT sa.platform, sa.account_id, sa.account_name, sa.metadata
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${site.siteId}
    `,
    sql`
      SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1) AS avg_rating
      FROM inbox_reviews
      WHERE site_id = ${site.siteId} AND rating IS NOT NULL
    `,
    sql`
      SELECT reviewer_name, rating, body, created_at
      FROM inbox_reviews
      WHERE site_id = ${site.siteId} AND rating >= 4 AND body IS NOT NULL
      ORDER BY rating DESC, created_at DESC
      LIMIT 5
    `,
    sql`
      SELECT photo_url, customer_name, caption, completed_at
      FROM spotlight_sessions
      WHERE site_id = ${site.siteId}
        AND status = 'completed'
        AND photo_consent = true
        AND photo_url IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 6
    `,
    sql`
      SELECT gl.sync_data
      FROM social_accounts sa
      LEFT JOIN gbp_locations gl ON gl.account_id = sa.id
      WHERE sa.site_id = ${site.siteId} AND sa.platform = 'gbp'
      LIMIT 1
    `,
    sql`
      SELECT url FROM media_assets
      WHERE site_id = ${site.siteId}
        AND media_type LIKE 'image%'
        AND quality_score > 0.8
      ORDER BY quality_score DESC
      LIMIT 1
    `,
    sql`SELECT url, brand_voice, brand_playbook FROM sites WHERE id = ${site.siteId}`,
  ]);

  const siteInfo = siteRow[0] || {};
  const syncData = gbpData[0]?.sync_data as Record<string, unknown> | null;
  const address = syncData?.address as Record<string, string> | null;
  const location = address
    ? [address.locality, address.administrativeArea].filter(Boolean).join(", ")
    : null;
  const phone = (syncData?.phoneNumber || syncData?.phone) as string | null;
  const logoUrl = (logoAsset[0]?.url as string) || null;
  const websiteUrl = (siteInfo.url as string) || null;

  // Build description from playbook or blog description
  const playbook = siteInfo.brand_playbook as Record<string, unknown> | null;
  const playbookTagline = (playbook?.brandPositioning as Record<string, unknown>)?.selectedAngles;
  const taglineText = Array.isArray(playbookTagline) && playbookTagline[0]
    ? String((playbookTagline[0] as Record<string, unknown>).tagline || "")
    : "";
  const aboutText = site.blogDescription || taglineText || "";

  // Generate schema
  const schema = await generateHubSchema({
    siteId: site.siteId,
    siteName: site.siteName,
    siteUrl: websiteUrl || undefined,
    blogSlug: siteSlug,
    logoUrl,
  });

  const aggregate = {
    count: Number(reviewAgg[0]?.count) || 0,
    avgRating: Number(reviewAgg[0]?.avg_rating) || 0,
  };

  const articlePosts = posts.map((p) => ({
    slug: String(p.slug),
    title: String(p.title),
    excerpt: p.excerpt ? String(p.excerpt) : null,
    og_image_url: p.og_image_url ? String(p.og_image_url) : null,
    content_pillar: p.content_pillar ? String(p.content_pillar) : null,
    published_at: String(p.published_at),
  }));

  const socialAccountsData = socialAccounts.map((a) => ({
    platform: a.platform as string,
    account_id: a.account_id as string,
    account_name: a.account_name as string,
    metadata: a.metadata as Record<string, unknown> | null,
  }));

  const spotlightData = spotlightSessions.map((s) => ({
    photo_url: s.photo_url as string,
    customer_name: (s.customer_name as string) || null,
    caption: (s.caption as string) || null,
    completed_at: s.completed_at as string,
  }));

  const reviewData = topReviews.map((r) => ({
    reviewer_name: (r.reviewer_name as string) || null,
    rating: Number(r.rating),
    body: r.body as string,
    created_at: r.created_at as string,
  }));

  return (
    <div>
      {/* JSON-LD schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <HubHeader
        siteName={site.siteName}
        description={aboutText}
        location={location}
        phone={phone}
        websiteUrl={websiteUrl}
        logoUrl={logoUrl}
        socialAccounts={socialAccountsData}
      />

      <HubReviews aggregate={aggregate} reviews={reviewData} />

      <HubSpotlights sessions={spotlightData} />

      <HubArticles posts={articlePosts} siteSlug={siteSlug} />

      {/* RSS link */}
      <div style={{ textAlign: "center", paddingTop: 24 }}>
        <Link
          href={`/blog/${siteSlug}/feed.xml`}
          className="blog-muted"
          style={{ fontSize: 13, textDecoration: "none" }}
        >
          RSS Feed
        </Link>
      </div>
    </div>
  );
}
