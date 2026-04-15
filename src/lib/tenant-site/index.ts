/**
 * Tenant marketing site data loaders.
 *
 * Each marketing page (home, about, work, contact) has its own loader.
 * Every page calls loadTenantContext() for the shell (theme, nav, brand
 * identity) plus its page-specific loader in parallel.
 *
 * Server-only — these helpers query the DB and must not be imported
 * into client components.
 */
export { loadTenantContext } from "./context";
export type { TenantContext, TenantTheme } from "./context";

export {
  defaultPageConfig,
  normalizePageConfig,
  slotByKey,
} from "./page-config";
export type {
  PageConfig,
  PageSlot,
  SlotKey,
  HomeVariant,
  AboutVariant,
  WorkVariant,
  BlogVariant,
  ProjectsVariant,
  ContactVariant,
} from "./page-config";

export {
  loadWorkContent,
  defaultTilesFromCopy,
  defaultPricingTiers,
} from "./work-content";
export type {
  WorkContent,
  ServiceTile,
  PricingTier,
} from "./work-content";

export { loadHomePage } from "./home";
export type { HomePageData } from "./home";

export { loadAboutPage } from "./about";
export type { AboutPageData } from "./about";

export { loadWorkPage } from "./work";
export type { WorkPageData } from "./work";

export { loadContactPage } from "./contact";
export type { ContactPageData } from "./contact";

export { loadPageMetadata } from "./metadata";
export type { PageMetadata } from "./metadata";
