import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext, tenantOgMetadata, loadHomePage, loadPageMetadata, slotByKey } from "@/lib/tenant-site";
import { detectHostMode } from "@/lib/urls";
import MarketingShell from "@/components/marketing/marketing-shell";
import HomeServiceBusiness from "@/components/marketing/variants/home-service-business";
import HomeSaasLanding from "@/components/marketing/variants/home-saas-landing";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "home");
  return {
    title: meta.title,
    description: meta.description,
    ...tenantOgMetadata(ctx),
  };
}

export default async function TenantHomePage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();

  const slot = slotByKey(ctx.pageConfig, "home");
  if (!slot.enabled) notFound();

  const data = await loadHomePage(ctx.siteId);
  const hostMode = await detectHostMode();
  const prefix = hostMode === "preview" ? `/${ctx.siteSlug}` : "";

  const variant = slot.variant;

  return (
    <MarketingShell ctx={ctx} activePage="home">
      {variant === "saas_landing" ? (
        <HomeSaasLanding data={data} prefix={prefix} />
      ) : (
        // service_business is the default — also handles coach/portfolio_forward until those ship
        <HomeServiceBusiness data={data} prefix={prefix} />
      )}
    </MarketingShell>
  );
}
