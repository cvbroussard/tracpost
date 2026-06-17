/**
 * Website generator types — match the locked input/output contract.
 *
 * Section schemas correspond 1:1 to the locked contract. Adding a new
 * section type bumps schema_version major (1.0 → 2.0). Adding a new
 * optional field on an existing section bumps minor (1.0 → 1.1).
 */

export type PageKey = "home" | "about" | "services" | "blog" | "projects" | "contact";

export interface PageContent {
  page_key: PageKey;
  schema_version: string;
  sections: Section[];
  metadata: {
    seo: {
      title: string;
      description: string;
      og_image_asset_id: string | null;
    };
    canonical_path: string;
  };
}

export type Section =
  | HeroSection
  | TilesSection
  | NarrativeBlockSection
  | SocialProofSection
  | CtaBlockSection
  | ServicesListingSection
  | ProjectsGridSection
  | BlogListingSection
  | ContactFormSection
  | ContactMethodsSection;

export interface HeroSection {
  type: "hero";
  /** verbal.tagline if declared; null when generator chose to omit. */
  tagline: string | null;
  /** The hero headline. Required. */
  headline: string;
  /** Supporting subhead. Null when the headline carries the load alone. */
  subhead: string | null;
  primary_cta: { text: string; href: string };
  secondary_cta: { text: string; href: string } | null;
  /** Asset binding. Phase 1: asset_id remains null until Phase 2 wires image gen. */
  hero_image: { asset_id: string | null; url: string | null; alt: string } | null;
}

export interface TilesSection {
  type: "tiles";
  heading: string;
  subhead: string | null;
  layout: "3up" | "4up";
  tiles: Array<{
    title: string;
    description: string;
    icon_name: string | null;
    href: string | null;
  }>;
}

export interface NarrativeBlockSection {
  type: "narrative_block";
  heading: string | null;
  paragraphs: string[];
  /** Words from verbal.lexicon.use the renderer should emphasize. */
  emphasis_words: string[];
}

export interface SocialProofSection {
  type: "social_proof";
  heading: string;
  show_review_count: boolean;
  show_average_rating: boolean;
  testimonials_source: "inbox_reviews" | "manual" | "none";
  testimonial_max_count: number;
  fallback_copy: string | null;
}

export interface CtaBlockSection {
  type: "cta_block";
  heading: string;
  body: string | null;
  cta_text: string;
  cta_href: string;
  emphasis: "primary" | "secondary";
}

export interface ServicesListingSection {
  type: "services_listing";
  intro_heading: string;
  intro_copy: string;
  services: Array<{
    slug: string;
    title: string;
    description: string;
    bullet_points: string[];
    image_asset_id: string | null;
    closing_cta_text: string | null;
  }>;
  closing_cta: { text: string; href: string };
}

export interface ProjectsGridSection {
  type: "projects_grid";
  intro_heading: string;
  intro_copy: string;
  empty_state_copy: string;
}

export interface BlogListingSection {
  type: "blog_listing";
  intro_heading: string;
  intro_copy: string;
  empty_state_copy: string;
}

export interface ContactFormSection {
  type: "contact_form";
  heading: string;
  intro_copy: string;
  form_fields: Array<{
    name: string;
    label: string;
    type: "text" | "email" | "tel" | "textarea";
    required: boolean;
  }>;
  submit_button_text: string;
}

export interface ContactMethodsSection {
  type: "contact_methods";
  heading: string;
  methods_visible: Array<"phone" | "email" | "address" | "hours" | "service_area">;
}

// ── Generator input shape (loaded fresh per generation) ────────────────────

export interface GeneratorInputBusinessInfo {
  business_id: string;
  /** Operator-facing system label (signup-typed name). NOT a marketing
   *  source of truth — generators must read brand_name instead per
   *  [[brand-naming-policy]]. Kept here for backward-compat. */
  name: string | null;
  /** Registered LLC/corporate name. Compliance contexts only — never
   *  marketing copy. Nullable until owner provides. */
  legal_entity_name: string | null;
  /** CANONICAL public-facing marketing name. Used by every customer-
   *  facing surface. Required for any generation prompt producing
   *  customer-facing copy. Per [[brand-naming-policy]]. */
  brand_name: string | null;
  /** Declared abbreviation/nickname (e.g., "B2" for "B2 Construction").
   *  Permissible in casual contexts ONLY when set. Blank = forbidden
   *  to abbreviate. Per [[brand-naming-policy]]. */
  brand_short_form: string | null;
  business_type: string | null;
  location: string | null;
  url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  /** Owner-canonical tagline. Null until owner declares (either by typing
   *  or picking an exemplar from the brand_descriptor suggestion picker).
   *  When present, generator uses this VERBATIM and ignores any tagline
   *  text in brand_descriptor.declared. */
  tagline: string | null;
}

export interface DescriptorSlot {
  observed: unknown;
  declared: unknown;
  status: string | null;
}

export interface GeneratorInputCatalog {
  catalog_version: string;
  verbal: Record<string, DescriptorSlot | null>;
  visual: Record<string, DescriptorSlot | null>;
  strategic: Record<string, DescriptorSlot | null>;
  sonic: Record<string, DescriptorSlot | null>;
}

export interface GeneratorInputGbpProfile {
  description: string | null;
  phoneNumber: string | null;
  address: { addressLines: string[]; locality: string | null; administrativeArea: string | null } | null;
  regularHours: Array<{ day: string; openTime: string; closeTime: string }>;
  serviceAreaPlaces: string[];
  reviewCount: number | null;
  averageRating: number | null;
}

export interface BrandAsset {
  asset_id: string;
  url: string;
  descriptor_key: string | null;
  role: string | null;
  provenance: "owner_uploaded" | "ai_generated_v1";
}

export interface GeneratorInput {
  business_info: GeneratorInputBusinessInfo;
  catalog: GeneratorInputCatalog;
  gbp_profile: GeneratorInputGbpProfile | null;
  brand_assets: { logo: BrandAsset | null; bound_assets: BrandAsset[] };
}
