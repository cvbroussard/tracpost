/**
 * Generate Product + Offer structured data.
 * Uses data extracted from page HTML or passed from an ecommerce connector.
 */
export interface ProductData {
  name: string;
  description?: string;
  image?: string;
  url: string;
  price?: string;
  currency?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  brand?: string;
  sku?: string;
  rating?: { value: number; count: number };
}

export function generateProductSchema(
  data: ProductData
): Record<string, unknown>[] {
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: data.name,
    url: data.url,
  };

  if (data.description) product.description = data.description;
  if (data.image) product.image = data.image;
  if (data.brand) {
    product.brand = { "@type": "Brand", name: data.brand };
  }
  if (data.sku) product.sku = data.sku;

  if (data.price) {
    product.offers = {
      "@type": "Offer",
      price: data.price,
      priceCurrency: data.currency || "USD",
      availability: data.availability
        ? `https://schema.org/${data.availability}`
        : "https://schema.org/InStock",
      url: data.url,
    };
  }

  if (data.rating) {
    product.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: data.rating.value,
      reviewCount: data.rating.count,
    };
  }

  return [product];
}
