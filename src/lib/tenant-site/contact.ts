/**
 * Contact page data loader — minimal; most contact info comes from
 * the shared tenant context (phone, email, location). This loader
 * just adds page-specific copy.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

export interface ContactPageData {
  headline: string;
  subtitle: string;
}

export async function loadContactPage(siteId: string): Promise<ContactPageData> {
  const [site] = await sql`SELECT website_copy FROM sites WHERE id = ${siteId}`;
  const copy = (site?.website_copy as WebsiteCopy | null) || null;
  const contactCopy = copy?.contact;

  return {
    headline: contactCopy?.headline || "Get in Touch",
    subtitle:
      contactCopy?.subtitle ||
      "Tell us about your project and we'll get back to you soon.",
  };
}
