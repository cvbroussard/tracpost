import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext, tenantOgMetadata, loadAboutPage, loadPageMetadata, slotByKey } from "@/lib/tenant-site";
import { detectHostMode } from "@/lib/urls";
import MarketingShell from "@/components/marketing/marketing-shell";
import AboutSoloPractitioner from "@/components/marketing/variants/about-solo-practitioner";
import AboutFounder from "@/components/marketing/variants/about-founder";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "about");
  return {
    title: meta.title,
    description: meta.description,
    ...tenantOgMetadata(ctx),
  };
}

export default async function TenantAboutPage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();

  const slot = slotByKey(ctx.pageConfig, "about");
  if (!slot.enabled) notFound();

  const data = await loadAboutPage(ctx.siteId);
  const hostMode = await detectHostMode();
  const prefix = hostMode === "preview" ? `/${ctx.siteSlug}` : "";

  const variant = slot.variant;

  return (
    <MarketingShell ctx={ctx} activePage="about">
      {variant === "founder" ? (
        <AboutFounder data={data} prefix={prefix} />
      ) : (
        // solo_practitioner is the default — also handles team/studio/firm until those ship
        <AboutSoloPractitioner
          data={data}
          siteSlug={ctx.siteSlug}
          customDomain={ctx.customDomain}
        />
      )}
    </MarketingShell>
  );
}
