import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveBlogSite } from "@/lib/blog";
import { sql } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "";

  // For blog.tracpost.com discovery hub — use TracPost branding
  if (blogHost === "blog.tracpost.com" || !blogHost) {
    return {
      title: "TracPost Blog",
      description: "Stories from businesses powered by TracPost",
      robots: "index, follow",
    };
  }

  const site = await resolveBlogSite(blogHost);
  const title = site?.blogTitle || site?.siteName || "Blog";
  const description = site?.blogDescription || "Latest posts";

  return {
    title,
    description,
    robots: "index, follow",
    alternates: {
      types: { "application/rss+xml": "/blog/feed.xml" },
    },
  };
}

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {children}
    </div>
  );
}
