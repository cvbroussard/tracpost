import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveBlogSite } from "@/lib/blog";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  return {
    title: site?.blogTitle || site?.siteName || "Blog",
    description: site?.blogDescription || "Latest posts",
  };
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {children}
    </div>
  );
}
