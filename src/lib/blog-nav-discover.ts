/**
 * Discover nav links from a tenant's website.
 *
 * Fetches the site's HTML, extracts links from <nav> elements or common
 * header patterns, and stores them in blog_settings.nav_links.
 */
import { sql } from "@/lib/db";
import { blogHubUrl } from "@/lib/urls";

interface NavLink {
  label: string;
  href: string;
}

/**
 * Fetch a tenant's website and extract navigation links.
 * Falls back to sensible defaults if scraping fails.
 */
export async function discoverNavLinks(
  siteId: string,
  websiteUrl: string,
  siteName: string
): Promise<NavLink[]> {
  let discovered: NavLink[] = [];

  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": "TracPost-Bot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Extract links from <nav> elements
    const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
    if (navMatch) {
      discovered = extractLinks(navMatch[1], websiteUrl);
    }

    // Fallback: look for header links
    if (discovered.length === 0) {
      const headerMatch = html.match(/<header[^>]*>([\s\S]*?)<\/header>/i);
      if (headerMatch) {
        discovered = extractLinks(headerMatch[1], websiteUrl);
      }
    }

    // Filter to reasonable nav links (skip anchors, skip external)
    const baseHost = new URL(websiteUrl).hostname;
    discovered = discovered.filter((link) => {
      if (!link.label || !link.href) return false;
      if (link.label.length > 30) return false;
      try {
        const url = new URL(link.href);
        return url.hostname === baseHost || url.hostname === "";
      } catch {
        // Relative URL — keep it
        return !link.href.startsWith("#") && !link.href.startsWith("javascript");
      }
    });

    // Limit to 8 links
    discovered = discovered.slice(0, 8);
  } catch {
    // Scraping failed — use defaults
  }

  // Get the blog slug + custom domain for the Blog link
  const [bs] = await sql`
    SELECT bs.subdomain, bs.custom_domain, s.blog_slug
    FROM blog_settings bs
    JOIN sites s ON s.id = bs.site_id
    WHERE bs.site_id = ${siteId}
  `;
  const slug = (bs?.blog_slug as string) || (bs?.subdomain as string) || "";
  const customDomain = (bs?.custom_domain as string) || null;
  const blogPath = slug ? blogHubUrl(slug, customDomain) : "/blog";

  // Build final nav: always include Home + Blog, merge discovered
  const navLinks: NavLink[] = [
    { label: "Home", href: websiteUrl },
  ];

  // Add discovered links (skip home/index duplicates)
  for (const link of discovered) {
    const label = link.label.trim();
    const lower = label.toLowerCase();
    if (lower === "home" || lower === siteName.toLowerCase()) continue;
    if (lower === "blog") continue; // We add our own
    navLinks.push({ label, href: link.href });
  }

  // If no discovered links, add common defaults
  if (discovered.length === 0) {
    navLinks.push({ label: "About", href: `${websiteUrl}/about` });
    navLinks.push({ label: "Contact", href: `${websiteUrl}/contact` });
  }

  // Always add Blog last
  navLinks.push({ label: "Blog", href: blogPath });

  // Store in blog_settings
  await sql`
    UPDATE blog_settings
    SET nav_links = ${JSON.stringify(navLinks)}::jsonb, updated_at = NOW()
    WHERE site_id = ${siteId}
  `;

  return navLinks;
}

/**
 * Extract anchor links from an HTML fragment.
 */
function extractLinks(html: string, baseUrl: string): NavLink[] {
  const links: NavLink[] = [];
  const regex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    // Strip HTML tags from label text
    const label = match[2].replace(/<[^>]+>/g, "").trim();

    if (!label || !href) continue;

    // Resolve relative URLs
    let fullHref = href;
    if (href.startsWith("/")) {
      try {
        fullHref = new URL(href, baseUrl).toString();
      } catch {
        fullHref = href;
      }
    }

    links.push({ label, href: fullHref });
  }

  return links;
}
