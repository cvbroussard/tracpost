import type { SiteConfig } from "../types";

/**
 * Generate LocalBusiness + Service structured data from site config.
 */
export function generateLocalBusinessSchema(
  config: SiteConfig
): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];

  const business: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: config.name,
    url: config.url,
  };

  if (config.description) business.description = config.description;
  if (config.phone) business.telephone = config.phone;
  if (config.email) business.email = config.email;
  if (config.logo) {
    business.logo = config.logo;
    business.image = config.logo;
  }
  if (config.priceRange) business.priceRange = config.priceRange;

  if (config.address) {
    business.address = {
      "@type": "PostalAddress",
      ...(config.address.street && { streetAddress: config.address.street }),
      ...(config.address.city && { addressLocality: config.address.city }),
      ...(config.address.state && { addressRegion: config.address.state }),
      ...(config.address.zip && { postalCode: config.address.zip }),
      ...(config.address.country && { addressCountry: config.address.country }),
    };
  }

  if (config.openingHours && config.openingHours.length > 0) {
    business.openingHours = config.openingHours;
  }

  if (config.serviceArea) {
    business.areaServed = config.serviceArea;
  }

  if (config.socialLinks && config.socialLinks.length > 0) {
    business.sameAs = config.socialLinks;
  }

  schemas.push(business);

  // Generate individual Service schemas
  if (config.services && config.services.length > 0) {
    for (const svc of config.services) {
      const serviceSchema: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Service",
        name: svc.name,
        provider: {
          "@type": "LocalBusiness",
          name: config.name,
        },
      };
      if (svc.description) serviceSchema.description = svc.description;
      if (svc.url) serviceSchema.url = svc.url;
      schemas.push(serviceSchema);
    }
  }

  return schemas;
}
