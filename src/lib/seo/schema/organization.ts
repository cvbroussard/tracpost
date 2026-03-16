import type { SiteConfig } from "../types";

/**
 * Generate Organization + WebSite + SiteNavigationElement for homepages.
 */
export function generateOrganizationSchema(
  config: SiteConfig
): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];

  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.name,
    url: config.url,
  };

  if (config.description) org.description = config.description;
  if (config.logo) org.logo = config.logo;
  if (config.email) org.email = config.email;
  if (config.phone) org.telephone = config.phone;

  if (config.socialLinks && config.socialLinks.length > 0) {
    org.sameAs = config.socialLinks;
  }

  if (config.address) {
    org.address = {
      "@type": "PostalAddress",
      ...(config.address.street && { streetAddress: config.address.street }),
      ...(config.address.city && { addressLocality: config.address.city }),
      ...(config.address.state && { addressRegion: config.address.state }),
      ...(config.address.zip && { postalCode: config.address.zip }),
      ...(config.address.country && {
        addressCountry: config.address.country,
      }),
    };
  }

  schemas.push(org);

  // WebSite schema with SearchAction potential
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: config.name,
    url: config.url,
  });

  return schemas;
}
