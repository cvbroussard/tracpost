/**
 * Shared tenant-site context — the data every marketing page needs for
 * the shell (nav, footer, theme). Pulled once per request; each page
 * combines this with its own page-specific data.
 *
 * Server-only — not importable from client components.
 */
import "server-only";
import { sql } from "@/lib/db";
import { normalizePageConfig, type PageConfig } from "./page-config";

export interface TenantTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: string;
  headingFontFamily: string;
  borderRadius: string;
}

export interface BrandAssets {
  logo: string | null;
  favicon: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}

export interface TenantContext {
  siteId: string;
  siteSlug: string;
  siteName: string;
  businessType: string | null;
  tagline: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  websiteUrl: string | null;
  customDomain: string | null;
  ga4MeasurementId: string | null;
  gscVerificationToken: string | null;
  brandAssets: BrandAssets;
  theme: TenantTheme;
  pageConfig: PageConfig;
}

function ensureContrast(hex: string): string {
  // Darken muted colors that don't meet WCAG AA 4.5:1 on white.
  // Light grays like #6b7280 (4.56:1) barely pass — clamp to #4b5563 (7.15:1).
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance > 0.4) return "#4b5563";
  return hex;
}

const DEFAULT_THEME: TenantTheme = {
  primaryColor: "#1a1a1a",
  accentColor: "#3b82f6",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  mutedColor: "#6b7280",
  borderColor: "#e5e7eb",
  fontFamily: "system-ui, sans-serif",
  headingFontFamily: "system-ui, sans-serif",
  borderRadius: "6px",
};

export function tenantOgMetadata(ctx: TenantContext): Record<string, unknown> {
  const a = ctx.brandAssets;
  const domain = ctx.customDomain || `${ctx.siteSlug}.tracpost.com`;
  return {
    icons: ctx.faviconUrl ? { icon: ctx.faviconUrl } : undefined,
    openGraph: {
      title: a.ogTitle || ctx.siteName,
      description: a.ogDescription || ctx.tagline || undefined,
      siteName: ctx.siteName,
      type: "website",
      url: `https://${domain}`,
      ...(a.ogImage ? { images: [{ url: a.ogImage, width: 1200, height: 630 }] } : {}),
    },
  };
}

/**
 * Load shared context for a tenant's marketing site.
 * Returns null if the site doesn't exist or is inactive.
 */
export async function loadTenantContext(siteSlug: string): Promise<TenantContext | null> {
  const [row] = await sql`
    SELECT s.id, s.name, s.blog_slug, s.business_type, s.location, s.url,
           s.business_phone, s.business_email, s.business_logo, s.business_favicon,
           s.brand_playbook, s.brand_assets, s.page_config, s.ga4_measurement_id, s.gsc_verification_token,
           bs.custom_domain, bs.theme
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.blog_slug = ${siteSlug} AND s.is_active = true
  `;

  if (!row) return null;

  // Extract tagline from the sharpened playbook's first selected angle.
  const playbook = (row.brand_playbook || {}) as Record<string, unknown>;
  const positioning = (playbook.brandPositioning as Record<string, unknown>) || {};
  const angles = (positioning.selectedAngles as Array<Record<string, unknown>>) || [];
  const tagline = String(angles[0]?.tagline || "");

  const rawTheme = (row.theme as Record<string, string>) || {};
  const theme: TenantTheme = {
    primaryColor: rawTheme.primaryColor || DEFAULT_THEME.primaryColor,
    accentColor: rawTheme.accentColor || DEFAULT_THEME.accentColor,
    backgroundColor: rawTheme.backgroundColor || DEFAULT_THEME.backgroundColor,
    textColor: rawTheme.textColor || DEFAULT_THEME.textColor,
    mutedColor: ensureContrast(rawTheme.mutedColor || DEFAULT_THEME.mutedColor),
    borderColor: rawTheme.borderColor || DEFAULT_THEME.borderColor,
    fontFamily: rawTheme.fontFamily || DEFAULT_THEME.fontFamily,
    headingFontFamily:
      rawTheme.headingFontFamily || rawTheme.fontFamily || DEFAULT_THEME.headingFontFamily,
    borderRadius: rawTheme.borderRadius || DEFAULT_THEME.borderRadius,
  };

  const businessType = (row.business_type as string) || null;
  const pageConfig = normalizePageConfig(row.page_config, businessType);
  const rawAssets = (row.brand_assets || {}) as Record<string, unknown>;
  const brandAssets: BrandAssets = {
    logo: (rawAssets.logo as string) || (row.business_logo as string) || null,
    favicon: (rawAssets.favicon as string) || (row.business_favicon as string) || null,
    ogImage: (rawAssets.ogImage as string) || null,
    ogTitle: (rawAssets.ogTitle as string) || null,
    ogDescription: (rawAssets.ogDescription as string) || null,
  };

  return {
    siteId: row.id as string,
    siteSlug: (row.blog_slug as string) || siteSlug,
    siteName: (row.name as string) || "",
    businessType,
    tagline,
    location: (row.location as string) || null,
    phone: (row.business_phone as string) || null,
    email: (row.business_email as string) || null,
    logoUrl: (row.business_logo as string) || null,
    faviconUrl: (row.business_favicon as string) || null,
    websiteUrl: (row.url as string) || null,
    customDomain: (row.custom_domain as string) || null,
    ga4MeasurementId: (row.ga4_measurement_id as string) || null,
    gscVerificationToken: (row.gsc_verification_token as string) || null,
    brandAssets,
    theme,
    pageConfig,
  };
}
