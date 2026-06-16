export type {
  Service,
  ServiceMetadata,
  GbpCategory,
  SiteGbpCategory,
} from "./types";

// categorizeForSite RETIRED 2026-06-16 — brand-identity-only GBP category
// generation replaced by CMA-driven category-coaching with shared intent
// clustering per [[gbp-categories-cma-authority]] second-pass refinement.
// CMA observing competitor categories in pass 1 (blind mode) is strictly
// stronger signal than keyword-matching brand identity against the gcid
// catalog. See category-coaching.ts for the canonical path.

export {
  deriveServicesForSite,
  generateServicesFromClusters,
  persistDerivedServices,
  type DerivedService,
  type PersistedService,
} from "./derive";
