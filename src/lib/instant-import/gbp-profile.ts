/**
 * Instant Import — GBP location profile.
 *
 * One-time pull of business profile config (hours, address, categories,
 * description, phone, website) for an assigned GBP platform_asset.
 * Writes to sites.gbp_profile + business_phone/email/logo. Sets
 * platform_assets.imported_at on success so it doesn't re-run.
 *
 * Reference, not publishable. Used by site footer/contact/hours,
 * background composer for site config, and brand-DNA prompts that need
 * to know what category the business operates in.
 */
import "server-only";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export interface GbpImportResult {
  imported: boolean;
  reason?: string;
  fieldsWritten?: string[];
}

interface AssetRow {
  asset_id: string;
  platform_native_id: string;
  asset_metadata: Record<string, unknown>;
  access_token_encrypted: string;
  primary_site_id: string | null;
}

/**
 * Pull location detail from the read-side GBP API and persist to the
 * primary-assigned site. No-op if asset is unassigned or already imported.
 */
export async function importGbpProfile(asset: AssetRow): Promise<GbpImportResult> {
  if (!asset.primary_site_id) {
    return { imported: false, reason: "no primary site assigned" };
  }

  const accessToken = decrypt(asset.access_token_encrypted);
  const locationPart = asset.platform_native_id.startsWith("locations/")
    ? asset.platform_native_id
    : `locations/${asset.platform_native_id}`;

  // Read-side API: mybusinessbusinessinformation v1
  const readMask = [
    "name", "title", "phoneNumbers", "categories",
    "websiteUri", "regularHours", "specialHours",
    "storefrontAddress", "profile", "metadata",
  ].join(",");

  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationPart}?readMask=${encodeURIComponent(readMask)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GBP profile fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const loc = await res.json() as Record<string, unknown>;

  // Normalize what we care about
  const phoneNumbers = (loc.phoneNumbers || {}) as Record<string, unknown>;
  const primaryPhone = (phoneNumbers.primaryPhone as string) || null;
  const websiteUri = (loc.websiteUri as string) || null;
  const profile = (loc.profile || {}) as Record<string, unknown>;
  const description = (profile.description as string) || null;
  const categories = (loc.categories || {}) as Record<string, unknown>;
  const primaryCategory = (categories.primaryCategory as Record<string, unknown>)?.displayName as string | undefined;
  const additionalCategories = ((categories.additionalCategories as Array<Record<string, unknown>>) || [])
    .map(c => c.displayName as string)
    .filter(Boolean);
  const address = (loc.storefrontAddress || {}) as Record<string, unknown>;

  // gbp_profile carries the full normalized snapshot for downstream consumers
  const gbpProfile = {
    title: loc.title || asset.platform_native_id,
    primary_phone: primaryPhone,
    website_uri: websiteUri,
    description,
    primary_category: primaryCategory || null,
    additional_categories: additionalCategories,
    address: {
      address_lines: address.addressLines || [],
      locality: address.locality || null,
      administrative_area: address.administrativeArea || null,
      postal_code: address.postalCode || null,
      region_code: address.regionCode || null,
    },
    regular_hours: loc.regularHours || null,
    special_hours: loc.specialHours || null,
    imported_at: new Date().toISOString(),
    source: "gbp_v1_business_information",
  };

  const fieldsWritten: string[] = ["gbp_profile"];

  // Persist. Update sites.gbp_profile (always). Backfill business_phone if
  // currently empty so we don't clobber an explicit operator override.
  await sql`
    UPDATE businesses
    SET gbp_profile = ${JSON.stringify(gbpProfile)}::jsonb,
        business_phone = COALESCE(NULLIF(business_phone, ''), ${primaryPhone}),
        updated_at = NOW()
    WHERE id = ${asset.primary_site_id}
  `;
  if (primaryPhone) fieldsWritten.push("business_phone");

  // imported_at is set by the orchestrator after all importers for the
  // asset finish, so a partial-success doesn't permanently skip retries.
  return { imported: true, fieldsWritten };
}
