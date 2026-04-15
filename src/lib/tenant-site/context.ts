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
  theme: TenantTheme;
  pageConfig: PageConfig;
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

/**
 * Load shared context for a tenant's marketing site.
 * Returns null if the site doesn't exist or is inactive.
 */
export async function loadTenantContext(siteSlug: string): Promise<TenantContext | null> {
  const [row] = await sql`
    SELECT s.id, s.name, s.blog_slug, s.business_type, s.location, s.url,
           s.business_phone, s.business_email, s.business_logo, s.business_favicon,
           s.brand_playbook, s.page_config,
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
    mutedColor: rawTheme.mutedColor || DEFAULT_THEME.mutedColor,
    borderColor: rawTheme.borderColor || DEFAULT_THEME.borderColor,
    fontFamily: rawTheme.fontFamily || DEFAULT_THEME.fontFamily,
    headingFontFamily:
      rawTheme.headingFontFamily || rawTheme.fontFamily || DEFAULT_THEME.headingFontFamily,
    borderRadius: rawTheme.borderRadius || DEFAULT_THEME.borderRadius,
  };

  const businessType = (row.business_type as string) || null;
  const pageConfig = normalizePageConfig(row.page_config, businessType);

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
    theme,
    pageConfig,
  };
}
