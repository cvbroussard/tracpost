/**
 * Brand logo URL construction — Pattern C renderer helper.
 *
 * When `brand.brandfetch_domain` is set, render variants directly
 * from Brandfetch's CDN with the appropriate type/theme/size for
 * the surface. When unset, fall back to the R2-cached `hero_url`.
 * When neither, callers render a letter-avatar.
 *
 * Pure function — no env access, no I/O. Caller passes the client ID
 * (from `process.env.BRANDFETCH_CLIENT_ID` server-side or
 * `process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` client-side).
 */

export type BrandLogoVariant = "icon" | "logo" | "symbol";
export type BrandLogoTheme = "light" | "dark";

export interface BrandLogoOpts {
  type?: BrandLogoVariant;
  theme?: BrandLogoTheme;
  height?: number;
  width?: number;
}

/**
 * Construct a Brandfetch CDN URL with variant params. Returns null when
 * the domain or client ID is missing — callers fall through to their
 * R2 fallback in that case.
 */
export function brandfetchLogoUrl(
  domain: string | null | undefined,
  clientId: string | null | undefined,
  opts: BrandLogoOpts = {},
): string | null {
  if (!domain || !clientId) return null;
  const params = new URLSearchParams({ c: clientId, fallback: "404" });
  if (opts.type) params.set("type", opts.type);
  if (opts.theme) params.set("theme", opts.theme);
  if (opts.height) params.set("h", String(opts.height));
  if (opts.width) params.set("w", String(opts.width));
  return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}?${params.toString()}`;
}

/**
 * Resolve the best available logo URL for a brand:
 *   1. Brandfetch CDN with the requested variant (if domain + client ID set)
 *   2. R2-cached hero_url (resilience safety net)
 *   3. null — caller renders letter-avatar
 */
export function resolveBrandLogo(
  brand: { brandfetch_domain?: string | null; hero_url?: string | null },
  clientId: string | null | undefined,
  opts: BrandLogoOpts = {},
): string | null {
  return (
    brandfetchLogoUrl(brand.brandfetch_domain, clientId, opts) ||
    brand.hero_url ||
    null
  );
}
