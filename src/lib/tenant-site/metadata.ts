/**
 * Per-page SEO metadata loader. Pulled from website_copy.meta when
 * available, with sensible fallbacks.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

type PageKey = "home" | "about" | "work" | "contact";

export interface PageMetadata {
  title: string;
  description: string;
}

export async function loadPageMetadata(
  siteId: string,
  page: PageKey,
): Promise<PageMetadata> {
  const [site] = await sql`
    SELECT website_copy, name, business_type, location
    FROM sites WHERE id = ${siteId}
  `;

  const copy = (site?.website_copy as WebsiteCopy | null) || null;
  const metaKey = `${page}Title` as keyof NonNullable<WebsiteCopy>["meta"];
  const descKey = `${page}Description` as keyof NonNullable<WebsiteCopy>["meta"];

  const siteName = String(site?.name || "");
  const businessType = String(site?.business_type || "");
  const location = String(site?.location || "");

  const fallbackTitle =
    page === "home"
      ? siteName
      : `${capitalize(page)} — ${siteName}`;
  const fallbackDescription = [businessType, location]
    .filter(Boolean)
    .join(" in ");

  return {
    title: (copy?.meta?.[metaKey] as string) || fallbackTitle,
    description: (copy?.meta?.[descKey] as string) || fallbackDescription,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
