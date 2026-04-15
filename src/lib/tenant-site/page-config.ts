/**
 * Page config — the six-slot page model that every tenant's marketing
 * site follows. Config is stored in sites.page_config (JSONB) and read
 * by the render layer to decide which pages exist, what they're labeled,
 * and which content variant to render.
 *
 * Tenants with NULL page_config get the default config derived from
 * business_type. Admin overrides write to DB.
 */
import "server-only";

export type SlotKey = "home" | "about" | "work" | "blog" | "projects" | "contact";

export type HomeVariant = "service_business" | "saas_landing" | "coach" | "portfolio_forward";
export type AboutVariant = "solo_practitioner" | "team" | "founder" | "studio" | "firm";
export type WorkVariant = "services_tiles" | "pricing_tiers" | "hybrid";
export type BlogVariant = "journal" | "insights" | "news";
export type ProjectsVariant = "portfolio" | "case_studies" | "timeline";
export type ContactVariant = "form" | "booking_demo" | "multi_channel";

export type VariantFor<K extends SlotKey> =
  K extends "home" ? HomeVariant :
  K extends "about" ? AboutVariant :
  K extends "work" ? WorkVariant :
  K extends "blog" ? BlogVariant :
  K extends "projects" ? ProjectsVariant :
  K extends "contact" ? ContactVariant :
  string;

export interface PageSlot {
  id: number;         // stable integer 1-6
  key: SlotKey;       // template dispatch key
  enabled: boolean;   // hide from nav + 404 the route if false
  label: string;      // display name (nav, footer, breadcrumbs)
  path: string;       // URL segment (future: tenant-customizable)
  variant: string;    // which content variant renders in this slot
}

export type PageConfig = PageSlot[];

// Fixed paths for MVP (not tenant-customizable yet — schema has the
// path field for future use, but the router uses hardcoded paths).
const SLOT_PATHS: Record<SlotKey, string> = {
  home: "",
  about: "about",
  work: "work",
  blog: "blog",
  projects: "projects",
  contact: "contact",
};

/**
 * Default page_config for a tenant with no explicit override.
 * Variant defaults are picked from business_type as a first heuristic;
 * admin can override per slot after provisioning.
 */
export function defaultPageConfig(businessType: string | null): PageConfig {
  const bt = (businessType || "").toLowerCase();
  const isSaas = /saas|software|platform|content automation|automation|app$/i.test(bt);
  const isCoach = /coach|consulting|advisor|advisory/i.test(bt);

  return [
    {
      id: 1,
      key: "home",
      enabled: true,
      label: "Home",
      path: SLOT_PATHS.home,
      variant: isSaas ? "saas_landing" : isCoach ? "coach" : "service_business",
    },
    {
      id: 2,
      key: "about",
      enabled: true,
      label: "About",
      path: SLOT_PATHS.about,
      variant: isSaas ? "founder" : "solo_practitioner",
    },
    {
      id: 3,
      key: "work",
      enabled: true,
      label: isSaas ? "Pricing" : "Services",
      path: SLOT_PATHS.work,
      variant: isSaas || isCoach ? "pricing_tiers" : "services_tiles",
    },
    {
      id: 4,
      key: "blog",
      enabled: true,
      label: "Blog",
      path: SLOT_PATHS.blog,
      variant: "journal",
    },
    {
      id: 5,
      key: "projects",
      enabled: true,
      label: isSaas ? "Case Studies" : "Projects",
      path: SLOT_PATHS.projects,
      variant: isSaas ? "case_studies" : "portfolio",
    },
    {
      id: 6,
      key: "contact",
      enabled: true,
      label: "Contact",
      path: SLOT_PATHS.contact,
      variant: isSaas ? "booking_demo" : "form",
    },
  ];
}

/**
 * Normalize a page_config loaded from DB — fills in missing slots or
 * fields with defaults so render-side code doesn't have to handle
 * partial configs. Returned array is always length 6, ordered by id.
 */
export function normalizePageConfig(
  stored: unknown,
  businessType: string | null,
): PageConfig {
  const defaults = defaultPageConfig(businessType);
  if (!Array.isArray(stored)) return defaults;

  const byId = new Map<number, Partial<PageSlot>>();
  for (const raw of stored as Partial<PageSlot>[]) {
    if (raw && typeof raw === "object" && typeof raw.id === "number") {
      byId.set(raw.id, raw);
    }
  }

  return defaults.map((def) => {
    const override = byId.get(def.id) || {};
    return {
      id: def.id,
      key: (override.key as SlotKey) || def.key,
      enabled: typeof override.enabled === "boolean" ? override.enabled : def.enabled,
      label: typeof override.label === "string" && override.label.trim() ? override.label : def.label,
      path: typeof override.path === "string" ? override.path : def.path,
      variant: typeof override.variant === "string" && override.variant ? override.variant : def.variant,
    };
  });
}

/** Find a slot by key. Never returns null — falls back to defaults. */
export function slotByKey(config: PageConfig, key: SlotKey): PageSlot {
  const slot = config.find((s) => s.key === key);
  if (slot) return slot;
  // This shouldn't happen with normalized configs, but fail safe
  return defaultPageConfig(null).find((s) => s.key === key)!;
}
