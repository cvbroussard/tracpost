import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext, tenantOgMetadata, loadContactPage, loadPageMetadata, slotByKey } from "@/lib/tenant-site";
import MarketingShell from "@/components/marketing/marketing-shell";
import ContactForm from "@/components/marketing/variants/contact-form";
import ContactBookingDemo from "@/components/marketing/variants/contact-booking-demo";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "contact");
  return {
    title: meta.title,
    description: meta.description,
    ...tenantOgMetadata(ctx),
  };
}

export default async function TenantContactPage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();

  const slot = slotByKey(ctx.pageConfig, "contact");
  if (!slot.enabled) notFound();

  const data = await loadContactPage(ctx.siteId);
  const variant = slot.variant;

  return (
    <MarketingShell ctx={ctx} activePage="contact">
      {variant === "booking_demo" ? (
        <ContactBookingDemo data={data} ctx={ctx} />
      ) : (
        // form is the default — also handles multi_channel until that ships
        <ContactForm data={data} ctx={ctx} />
      )}
    </MarketingShell>
  );
}
