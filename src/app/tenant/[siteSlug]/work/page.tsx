import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  loadTenantContext,
  tenantOgMetadata,
  loadPageMetadata,
  loadWorkContent,
  loadServiceTiles,
  slotByKey,
  defaultTilesFromCopy,
  defaultPricingTiers,
  type ServiceTile,
  type PricingTier,
} from "@/lib/tenant-site";
import { sql } from "@/lib/db";
import { detectHostMode } from "@/lib/urls";
import MarketingShell from "@/components/marketing/marketing-shell";
import WorkServicesTiles from "@/components/marketing/variants/work-services-tiles";
import WorkPricingTiers from "@/components/marketing/variants/work-pricing-tiers";
import type { WebsiteCopy } from "@/lib/tenant-site/copy-generator";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "work");
  return {
    title: meta.title,
    description: meta.description,
    ...tenantOgMetadata(ctx),
  };
}

export default async function TenantWorkPage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();

  const slot = slotByKey(ctx.pageConfig, "work");
  if (!slot.enabled) notFound();

  // Load work content + a small slice of website_copy for fallbacks
  const workContent = await loadWorkContent(ctx.siteId);
  const [siteRow] = await sql`SELECT website_copy FROM sites WHERE id = ${ctx.siteId}`;
  const websiteCopy = (siteRow?.website_copy as WebsiteCopy | null) || null;

  const hostMode = await detectHostMode();
  const prefix = hostMode === "preview" ? `/${ctx.siteSlug}` : "";

  // Tile source priority: work_content override > services table > website_copy fallback.
  // The override lets admin pin a custom tile arrangement without losing
  // the services table as the canonical source for schema.org / blog prompts.
  let tiles: ServiceTile[] =
    workContent.services_tiles && workContent.services_tiles.length > 0
      ? workContent.services_tiles
      : await loadServiceTiles(ctx.siteId, prefix);
  if (tiles.length === 0) {
    tiles = defaultTilesFromCopy(websiteCopy?.home?.services);
  }

  const tiers: PricingTier[] =
    workContent.pricing_tiers && workContent.pricing_tiers.length > 0
      ? workContent.pricing_tiers
      : defaultPricingTiers();

  const headline =
    workContent.headline || websiteCopy?.work?.headline || slot.label || "Our Work";
  const subheadline = workContent.subheadline || websiteCopy?.work?.subtitle || "";

  // Dispatch by variant
  const variant = slot.variant;

  return (
    <MarketingShell ctx={ctx} activePage="work">
      {variant === "pricing_tiers" ? (
        <WorkPricingTiers headline={headline} subheadline={subheadline} tiers={tiers} />
      ) : (
        // services_tiles is the default — also handles "hybrid" until that variant exists
        <WorkServicesTiles headline={headline} subheadline={subheadline} tiles={tiles} />
      )}
    </MarketingShell>
  );
}
