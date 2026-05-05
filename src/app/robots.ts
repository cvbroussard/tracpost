import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = (h.get("host") || "").toLowerCase().split(":")[0];

  if (host === "preview.tracpost.com" || host === "staging.tracpost.com") {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  const origin = host === "localhost" ? "http://localhost:3000" : `https://${host}`;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/admin/", "/api/", "/reviewer/", "/reviewer"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
