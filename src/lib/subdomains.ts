/**
 * Subdomain classification and URL utilities.
 *
 * Three subdomains serve the same Next.js deployment:
 *   tracpost.com           → marketing (public pages)
 *   studio.tracpost.com    → subscriber dashboard
 *   platform.tracpost.com  → admin panel
 *
 * In development (localhost), all routes are accessed directly
 * without subdomain rewriting.
 */

export type SubdomainType = "marketing" | "studio" | "platform" | "blog";

/**
 * Classify a hostname into a subdomain type.
 * Returns "marketing" for unknown/local hosts.
 */
export function classifyHost(hostname: string): SubdomainType {
  // Strip port if present
  const host = hostname.split(":")[0];

  if (host === "studio.tracpost.com") return "studio";
  if (host === "platform.tracpost.com") return "platform";
  if (host === "blog.tracpost.com") return "blog";

  // Custom blog domains (e.g., blog.b2construct.com)
  if (host.startsWith("blog.")) return "blog";

  // Everything else: root domain, www, localhost
  return "marketing";
}

/** Whether the current environment uses subdomains (production). */
export function useSubdomains(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Studio (subscriber dashboard) base URL. */
export function studioUrl(path = ""): string {
  if (useSubdomains()) return `https://studio.tracpost.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3099"}/dashboard${path}`;
}

/** Platform (admin) base URL. */
export function platformUrl(path = ""): string {
  if (useSubdomains()) return `https://platform.tracpost.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3099"}/admin${path}`;
}

/** Marketing (public) base URL. */
export function marketingUrl(path = ""): string {
  if (useSubdomains()) return `https://tracpost.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3099"}${path}`;
}

/** Cookie domain — scoped to root domain in production for cross-subdomain sharing. */
export function cookieDomain(): string | undefined {
  return useSubdomains() ? ".tracpost.com" : undefined;
}
