import { sql } from "@/lib/db";
import { getSocialProfileUrl } from "./social-urls";

interface HubSchemaInput {
  siteId: string;
  siteName: string;
  siteUrl?: string;
  blogSlug: string;
  logoUrl?: string | null;
}

interface ArticleSchemaInput {
  title: string;
  excerpt?: string;
  ogImageUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  tags?: string[];
  siteSlug: string;
  articleSlug: string;
  siteName: string;
}

/**
 * Generate LocalBusiness JSON-LD schema for a hub page.
 * Aggregates social profiles, reviews, and GBP data.
 */
export async function generateHubSchema(input: HubSchemaInput): Promise<Record<string, unknown>> {
  const { siteId, siteName, siteUrl, blogSlug, logoUrl } = input;
  const hubUrl = `https://blog.tracpost.com/blog/${blogSlug}`;

  // Fetch social accounts for sameAs
  const socialAccounts = await sql`
    SELECT sa.platform, sa.account_id, sa.account_name, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
  `;

  const sameAs = socialAccounts
    .map((a) =>
      getSocialProfileUrl(
        a.platform as string,
        a.account_id as string,
        a.metadata as Record<string, unknown> | null
      )
    )
    .filter(Boolean);

  if (siteUrl) sameAs.unshift(siteUrl);

  // Fetch review aggregate
  const [reviewAgg] = await sql`
    SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1) AS avg_rating
    FROM inbox_reviews
    WHERE site_id = ${siteId} AND rating IS NOT NULL
  `;

  // Fetch top reviews
  const topReviews = await sql`
    SELECT reviewer_name, rating, body, created_at
    FROM inbox_reviews
    WHERE site_id = ${siteId} AND rating >= 4 AND body IS NOT NULL
    ORDER BY rating DESC, created_at DESC
    LIMIT 5
  `;

  // Fetch GBP location data
  const [gbpLocation] = await sql`
    SELECT gl.sync_data
    FROM gbp_locations gl
    WHERE gl.site_id = ${siteId}
    LIMIT 1
  `;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: siteName,
    url: siteUrl || hubUrl,
  };

  if (logoUrl) schema.logo = logoUrl;
  if (sameAs.length > 0) schema.sameAs = sameAs;

  // Address + geo from GBP
  const syncData = gbpLocation?.sync_data as Record<string, unknown> | null;
  if (syncData) {
    if (syncData.address) {
      const addr = syncData.address as Record<string, string>;
      schema.address = {
        "@type": "PostalAddress",
        streetAddress: addr.streetAddress || addr.addressLines?.[0],
        addressLocality: addr.locality,
        addressRegion: addr.administrativeArea,
        postalCode: addr.postalCode,
        addressCountry: addr.regionCode || "US",
      };
    }
    if (syncData.latlng || syncData.geo) {
      const geo = (syncData.latlng || syncData.geo) as Record<string, number>;
      schema.geo = {
        "@type": "GeoCoordinates",
        latitude: geo.latitude || geo.lat,
        longitude: geo.longitude || geo.lng,
      };
    }
    if (syncData.phoneNumber || syncData.phone) {
      schema.telephone = syncData.phoneNumber || syncData.phone;
    }
  }

  // Aggregate rating
  const reviewCount = Number(reviewAgg?.count) || 0;
  const avgRating = Number(reviewAgg?.avg_rating) || 0;
  if (reviewCount > 0 && avgRating > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avgRating,
      reviewCount,
      bestRating: 5,
    };
  }

  // Individual reviews
  if (topReviews.length > 0) {
    schema.review = topReviews.map((r) => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: r.reviewer_name || "Customer",
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
      },
      reviewBody: r.body,
      datePublished: r.created_at
        ? new Date(r.created_at as string).toISOString().split("T")[0]
        : undefined,
    }));
  }

  return schema;
}

/**
 * Generate Article JSON-LD schema for a blog post.
 */
export function generateArticleSchema(input: ArticleSchemaInput): Record<string, unknown> {
  const articleUrl = `https://blog.tracpost.com/blog/${input.siteSlug}/${input.articleSlug}`;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    mainEntityOfPage: articleUrl,
    author: {
      "@type": "Organization",
      name: input.siteName,
      url: `https://blog.tracpost.com/blog/${input.siteSlug}`,
    },
    publisher: {
      "@type": "Organization",
      name: "Tracpost",
      url: "https://tracpost.com",
      logo: {
        "@type": "ImageObject",
        url: "https://tracpost.com/logo.png",
      },
    },
  };

  if (input.publishedAt) {
    schema.datePublished = new Date(input.publishedAt).toISOString();
  }
  if (input.updatedAt) {
    schema.dateModified = new Date(input.updatedAt).toISOString();
  }
  if (input.ogImageUrl) {
    schema.image = input.ogImageUrl;
  }
  if (input.excerpt) {
    schema.description = input.excerpt;
  }
  if (input.tags && input.tags.length > 0) {
    schema.keywords = input.tags.join(", ");
  }

  return schema;
}
