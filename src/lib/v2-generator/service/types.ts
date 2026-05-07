/**
 * Service generator types.
 *
 * Service pages (services_v2) have a single content shape: authority
 * overview with cited project examples. Optional geo-scoping via
 * service_areas + service_radius_miles drives geo-aware copy.
 */

export interface ServiceGenerateSpec {
  serviceId: string;
  /** Optional override for status. Defaults to 'active'. */
  status?: "active" | "archived";
}

export interface ServiceGeneratedBody {
  title: string;
  body: string;          // markdown w/ {{asset:UUID}} placeholders
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  contentPillars: string[];
  contentTags: string[];
}

export interface ServiceGenerateResult {
  id: string;            // services_v2.id
  slug: string;
  name: string;
  assetsCount: number;
  citedProjectsCount: number;
  status: string;
}
