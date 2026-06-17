/**
 * Load the full input state for a website-content generation event.
 *
 * Reads the four input sources locked by the contract:
 *  - business_info (origin facts)
 *  - brand catalog (the identity authority)
 *  - gbp_profile (operational facts for cross-surface alignment)
 *  - brand_assets (logo + bound assets, owner-uploaded or AI-generated)
 *
 * The returned shape is what the prompt builders + snapshot capture
 * both consume.
 */
import { sql } from "@/lib/db";
import type {
  GeneratorInput,
  GeneratorInputCatalog,
  DescriptorSlot,
  BrandAsset,
} from "./types";

export async function loadInput(businessId: string): Promise<GeneratorInput> {
  // ── business_info ────────────────────────────────────────────────
  const [biz] = await sql`
    SELECT id, name, business_type, location, url,
           business_logo, business_favicon, gbp_profile, tagline,
           legal_entity_name, brand_name, brand_short_form
    FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  if (!biz) throw new Error(`website-gen: business ${businessId} not found`);

  // ── brand catalog ────────────────────────────────────────────────
  // catalog_version is a doctrinal label per [[brand-identity-v1-rc]], not
  // a DB column. Hardcoded to the locked rc; bumps when v1.0 seals.
  const CATALOG_VERSION = "1.0-rc";
  const [identity] = await sql`
    SELECT id
    FROM brand_identity WHERE business_id = ${businessId} LIMIT 1
  `;
  const catalogVersion = CATALOG_VERSION;

  const descRows = identity
    ? await sql`
        SELECT domain, key, declared, metadata, status
        FROM brand_descriptor
        WHERE brand_identity_id = ${identity.id}
      `
    : [];

  const catalog: GeneratorInputCatalog = {
    catalog_version: catalogVersion,
    verbal: {},
    visual: {},
    strategic: {},
    sonic: {},
  };
  for (const row of descRows) {
    const domain = row.domain as keyof Omit<GeneratorInputCatalog, "catalog_version">;
    if (!catalog[domain]) continue;
    catalog[domain][row.key as string] = {
      observed: null, // observed lives on substrate, not on brand_descriptor; not needed for gen
      declared: row.declared ?? null,
      status: (row.status as string | null) ?? null,
    } as DescriptorSlot;
  }

  // ── gbp_profile ──────────────────────────────────────────────────
  const gbpRaw = biz.gbp_profile as Record<string, unknown> | undefined;
  let gbp_profile: GeneratorInput["gbp_profile"] = null;
  if (gbpRaw && Object.keys(gbpRaw).length > 0) {
    const addr = (gbpRaw.address as Record<string, unknown> | undefined) ?? null;
    const places = (((gbpRaw.serviceArea as Record<string, unknown> | undefined)?.places as Record<string, unknown> | undefined)
      ?.placeInfos as Array<Record<string, unknown>> | undefined) ?? [];
    gbp_profile = {
      description: typeof gbpRaw.description === "string" ? gbpRaw.description : null,
      phoneNumber: typeof gbpRaw.phoneNumber === "string" ? gbpRaw.phoneNumber : null,
      address: addr
        ? {
            addressLines: (addr.addressLines as string[] | undefined) ?? [],
            locality: typeof addr.locality === "string" ? addr.locality : null,
            administrativeArea: typeof addr.administrativeArea === "string" ? addr.administrativeArea : null,
          }
        : null,
      regularHours: ((gbpRaw.regularHours as Array<Record<string, unknown>> | undefined) ?? [])
        .map((h) => ({
          day: String(h.day ?? h.dayOfWeek ?? ""),
          openTime: String(h.openTime ?? ""),
          closeTime: String(h.closeTime ?? ""),
        }))
        .filter((h) => h.day),
      serviceAreaPlaces: places.map((p) => String(p.placeName ?? "")).filter(Boolean),
      reviewCount:
        typeof gbpRaw.reviewCount === "number" ? gbpRaw.reviewCount :
        typeof gbpRaw.userRatingCount === "number" ? gbpRaw.userRatingCount : null,
      averageRating:
        typeof gbpRaw.averageRating === "number" ? gbpRaw.averageRating :
        typeof gbpRaw.rating === "number" ? gbpRaw.rating : null,
    };
  }

  // ── brand_assets ────────────────────────────────────────────────
  // Phase 1: only owner-uploaded logo is wired. bound_assets stays empty
  // until media_asset bindings are built. Future: pull from media_assets
  // where descriptor binding is non-null.
  const brand_assets: GeneratorInput["brand_assets"] = {
    logo:
      typeof biz.business_logo === "string" && biz.business_logo
        ? {
            asset_id: `logo-${biz.id}`,
            url: biz.business_logo,
            descriptor_key: "visual.logo",
            role: "brand_logo",
            provenance: "owner_uploaded" as const,
          }
        : null,
    bound_assets: [] as BrandAsset[],
  };

  return {
    business_info: {
      business_id: biz.id as string,
      name: (biz.name as string | null) ?? null,
      legal_entity_name: (biz.legal_entity_name as string | null) ?? null,
      brand_name: (biz.brand_name as string | null) ?? (biz.name as string | null) ?? null,
      brand_short_form: (biz.brand_short_form as string | null) ?? null,
      business_type: (biz.business_type as string | null) ?? null,
      location: (biz.location as string | null) ?? null,
      url: (biz.url as string | null) ?? null,
      logo_url: (biz.business_logo as string | null) ?? null,
      favicon_url: (biz.business_favicon as string | null) ?? null,
      tagline: (biz.tagline as string | null) ?? null,
    },
    catalog,
    gbp_profile,
    brand_assets,
  };
}
