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
 * Default tiles synthesized from website_copy.home.services when admin
 * hasn't customized work_content yet. Lets the work page render
 * meaningful content from day one.
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
