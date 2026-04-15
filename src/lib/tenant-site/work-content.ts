/**
 * Work slot content shapes — the data each work-page variant renders.
 *
 * Stored on sites.work_content as JSONB with both variant payloads
 * preserved (so admin can switch variants without losing data). The
 * actively-rendered variant is determined by page_config[work].variant,
 * not by a top-level field here.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface ServiceTile {
  title: string;
  description: string;
  icon?: string;
  image?: string;
  cta?: {
    label: string;
    href: string;
  };
}

export interface PricingTier {
  title: string;
  description: string;
  price: string;
  features: string[];
  cta: {
    label: string;
    href: string;
    style?: "primary" | "outline";
  };
  highlight?: boolean;
}

export interface WorkContent {
  headline?: string;
  subheadline?: string;
  services_tiles?: ServiceTile[];
  pricing_tiers?: PricingTier[];
}

const EMPTY: WorkContent = {};

export async function loadWorkContent(siteId: string): Promise<WorkContent> {
  const [row] = await sql`SELECT work_content FROM sites WHERE id = ${siteId}`;
  if (!row?.work_content) return EMPTY;
  return row.work_content as WorkContent;
}

/**
 * Load service tiles from the `services` table — the primary source.
 * Tiles follow display_order. Each tile's CTA deep-links to the
 * service detail page (/services/[slug]). Returns empty when the
 * tenant has no services yet (auto-gen hasn't run or failed).
 */
export async function loadServiceTiles(siteId: string, prefix = ""): Promise<ServiceTile[]> {
  const rows = await sql`
    SELECT s.slug, s.name, s.description, s.price_range,
           ma.storage_url AS hero_url
    FROM services s
    LEFT JOIN media_assets ma ON ma.id = s.hero_asset_id
    WHERE s.site_id = ${siteId}
    ORDER BY s.display_order, s.created_at
  `;
  return rows.map((r) => {
    const priceRange = r.price_range ? ` · ${String(r.price_range)}` : "";
    return {
      title: String(r.name),
      description: String(r.description || "") + (priceRange || ""),
      image: r.hero_url ? String(r.hero_url) : undefined,
      cta: { label: "Learn more", href: `${prefix}/services/${String(r.slug)}` },
    };
  });
}

/**
 * Legacy fallback — synthesize tiles from website_copy.home.services
 * for tenants that haven't run service derivation yet. The primary
 * source is now loadServiceTiles; this kicks in when services table
 * is empty.
 */
export function defaultTilesFromCopy(
  homeServices?: Array<{ title: string; description: string }> | undefined,
): ServiceTile[] {
  if (!homeServices || homeServices.length === 0) return [];
  return homeServices.map((s) => ({ title: s.title, description: s.description }));
}

/**
 * Default pricing tiers placeholder when admin hasn't set any.
 */
export function defaultPricingTiers(): PricingTier[] {
  return [
    {
      title: "Starter",
      description: "Get started",
      price: "Contact us",
      features: ["Set up below — admin → Website → Work Page Content"],
      cta: { label: "Contact", href: "/contact", style: "outline" },
    },
    {
      title: "Pro",
      description: "Most popular",
      price: "Contact us",
      features: ["Set up below — admin → Website → Work Page Content"],
      cta: { label: "Contact", href: "/contact" },
      highlight: true,
    },
    {
      title: "Enterprise",
      description: "Custom",
      price: "Custom",
      features: ["Set up below — admin → Website → Work Page Content"],
      cta: { label: "Contact", href: "/contact", style: "outline" },
    },
  ];
}
