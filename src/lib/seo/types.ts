/** Page types that the classifier can detect. */
export type PageType =
  | "service"
  | "product"
  | "collection"
  | "blog"
  | "homepage"
  | "unknown";

/** Result of analyzing existing SEO elements on a page. */
export interface SeoAnalysis {
  url: string;
  pageType: PageType;
  existing: {
    metaTitle: string | null;
    metaDescription: string | null;
    canonical: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogUrl: string | null;
    ogType: string | null;
    jsonLdTypes: string[];
  };
  missing: {
    metaDescription: boolean;
    canonical: boolean;
    ogTitle: boolean;
    ogDescription: boolean;
    ogImage: boolean;
    ogUrl: boolean;
    jsonLd: boolean;
  };
}

/** The payload returned to the client script. */
export interface SeoPayload {
  schema: Record<string, unknown>[];
  meta: {
    description?: string;
    title?: string;
  };
  og: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
  };
  canonical: string | null;
}

/** Site configuration for schema generation. */
export interface SiteConfig {
  name: string;
  url: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  logo?: string;
  socialLinks?: string[];
  priceRange?: string;
  openingHours?: string[];
  serviceArea?: string;
  services?: Array<{ name: string; description?: string; url?: string }>;
}
