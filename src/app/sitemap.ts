import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";

const BASE_URL = "https://tracpost.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/pricing`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/pricing/compare`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contact`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/changelog`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/signup`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/tools/gbp-diagnostic`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const industries = [
    "contractors",
    "kitchen-bath",
    "interior-design",
    "real-estate",
    "restaurants",
    "salons",
    "coaches",
    "agencies",
  ];

  const industryPages: MetadataRoute.Sitemap = industries.map((slug) => ({
    url: `${BASE_URL}/for/${slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const posts = await sql`
      SELECT slug, published_at
      FROM blog_posts bp
      JOIN sites s ON s.id = bp.site_id
      WHERE s.blog_slug = 'tracpost' AND bp.status = 'published'
    `;
    blogPages = posts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.published_at
        ? new Date(String(post.published_at))
        : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // If the database is unavailable, return sitemap without blog posts
  }

  return [...staticPages, ...industryPages, ...blogPages];
}
