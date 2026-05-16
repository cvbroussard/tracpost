import { sql } from "@/lib/db";
import { getGbpCredentials } from "./credentials";

/**
 * GBP Profile Management — read and update business profile data.
 *
 * Uses My Business Business Information API v1:
 *   GET  /v1/{location}?readMask=...
 *   PATCH /v1/{location}?updateMask=...
 */

const BIZ_INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";

export interface GbpProfile {
  name: string;
  title: string;
  description: string;
  phoneNumber: string;
  websiteUri: string;
  address: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  };
  regularHours: Array<{
    day: string;
    openTime: string;
    closeTime: string;
  }>;
  specialHours: Array<{
    date: string;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }>;
  categories: {
    primary: string;
    additional: string[];
  };
  serviceArea: Record<string, unknown> | null;
  openingDate: string | null;
  metadata: {
    placeId: string | null;
    mapsUri: string | null;
    newReviewUri: string | null;
    hasVoiceOfMerchant: boolean;
    canModifyServiceList: boolean;
    canHaveFoodMenus: boolean;
  };
  completeness: {
    score: number;
    missing: string[];
  };
  socialProfiles?: Array<{ platform: string; url: string }>;
  synced_at?: string;
}

/**
 * Platforms TracPost surfaces in the social profiles picker.
 * Each maps to Google's attribute name (attributes/url_<platform>).
 * Subscribers can add a URL for any platform regardless of whether
 * TracPost has an OAuth connection to it — these are independent.
 */
export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
  "youtube",
  "tiktok",
  "pinterest",
  "whatsapp",
] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];

const ATTR_PREFIX = "attributes/url_";

function parseAttributesResponse(data: Record<string, unknown>): Array<{ platform: string; url: string }> {
  const attrs = (data.attributes || []) as Array<Record<string, unknown>>;
  const result: Array<{ platform: string; url: string }> = [];
  for (const attr of attrs) {
    const name = attr.name as string | undefined;
    if (!name?.startsWith(ATTR_PREFIX)) continue;
    const platform = name.slice(ATTR_PREFIX.length);
    const uriValues = (attr.uriValues || []) as Array<{ uri?: string }>;
    const uri = uriValues[0]?.uri;
    if (uri) result.push({ platform, url: uri });
  }
  return result;
}

const READ_MASK = [
  "name", "title", "phoneNumbers", "storefrontAddress", "websiteUri",
  "regularHours", "specialHours", "categories", "profile",
  "serviceArea", "openInfo", "metadata", "latlng",
].join(",");

function buildLocationPath(accountMetadata: Record<string, unknown>, platformAccountId: string): string {
  const gbpAccountId = (accountMetadata?.account_id as string) || "";
  return gbpAccountId && platformAccountId
    ? `${gbpAccountId}/${platformAccountId}`
    : platformAccountId;
}

// getGbpCredentials moved to ./credentials.ts as the single source of
// truth for all GBP-touching code paths.

/**
 * Get the GBP profile — reads from local DB cache first.
 * Falls back to live API call if cache is empty.
 */
export async function fetchProfile(siteId: string): Promise<GbpProfile | null> {
  // Try local cache first
  const [site] = await sql`SELECT gbp_profile FROM sites WHERE id = ${siteId}`;
  const cached = (site?.gbp_profile || {}) as Record<string, unknown>;

  if (cached.title && cached.completeness) {
    return cached as unknown as GbpProfile;
  }

  // Cache empty — pull from Google and store
  return syncProfileFromGoogle(siteId);
}

/**
 * Parse a Google Business Information API location resource into our
 * GbpProfile shape. Used both for initial sync (GET response) and for
 * post-push refresh (PATCH response — Google returns the updated
 * location, which captures any server-side normalization like phone
 * formatting and address geocoding).
 */
function parseLocationResponse(data: Record<string, unknown>): GbpProfile {
  const regularHours: GbpProfile["regularHours"] = [];
  const rh = data.regularHours as Record<string, unknown> | undefined;
  const periods = rh?.periods as Array<Record<string, unknown>> | undefined;
  if (periods) {
    for (const period of periods) {
      regularHours.push({
        day: (period.openDay as string) || "",
        openTime: formatTime(period.openTime as Record<string, number> | undefined),
        closeTime: formatTime(period.closeTime as Record<string, number> | undefined),
      });
    }
  }

  const specialHours: GbpProfile["specialHours"] = [];
  const sh = data.specialHours as Record<string, unknown> | undefined;
  const shPeriods = sh?.specialHourPeriods as Array<Record<string, unknown>> | undefined;
  if (shPeriods) {
    for (const period of shPeriods) {
      const startDate = period.startDate as Record<string, number> | undefined;
      specialHours.push({
        date: `${startDate?.year}-${String(startDate?.month).padStart(2, "0")}-${String(startDate?.day).padStart(2, "0")}`,
        openTime: formatTime(period.openTime as Record<string, number> | undefined),
        closeTime: formatTime(period.closeTime as Record<string, number> | undefined),
        isClosed: (period.closed as boolean) || false,
      });
    }
  }

  const cats = data.categories as Record<string, unknown> | undefined;
  const primaryCat = cats?.primaryCategory as Record<string, string> | undefined;
  const primaryCategory = primaryCat?.displayName || "";
  const additionalCategories = ((cats?.additionalCategories || []) as Array<Record<string, string>>)
    .map((c) => c.displayName || "");

  const profile = data.profile as Record<string, string> | undefined;
  const phoneNumbers = data.phoneNumbers as Record<string, string> | undefined;
  const storefrontAddress = data.storefrontAddress as Record<string, unknown> | undefined;
  const openInfo = data.openInfo as Record<string, unknown> | undefined;
  const openingDate = openInfo?.openingDate as Record<string, number> | undefined;
  const metadata = data.metadata as Record<string, unknown> | undefined;

  const missing: string[] = [];
  if (!data.title) missing.push("Business name");
  if (!profile?.description) missing.push("Description");
  if (!phoneNumbers?.primaryPhone) missing.push("Phone number");
  if (!data.websiteUri) missing.push("Website");
  if (!storefrontAddress) missing.push("Address");
  if (!periods?.length) missing.push("Business hours");
  if (!primaryCategory) missing.push("Primary category");
  if (!additionalCategories.length) missing.push("Additional categories");

  const totalFields = 8;
  const filledFields = totalFields - missing.length;
  const score = Math.round((filledFields / totalFields) * 100);

  return {
    name: (data.name as string) || "",
    title: (data.title as string) || "",
    description: profile?.description || "",
    phoneNumber: phoneNumbers?.primaryPhone || "",
    websiteUri: (data.websiteUri as string) || "",
    address: {
      addressLines: (storefrontAddress?.addressLines as string[]) || [],
      locality: (storefrontAddress?.locality as string) || "",
      administrativeArea: (storefrontAddress?.administrativeArea as string) || "",
      postalCode: (storefrontAddress?.postalCode as string) || "",
      regionCode: (storefrontAddress?.regionCode as string) || "US",
    },
    regularHours,
    specialHours,
    categories: { primary: primaryCategory, additional: additionalCategories },
    serviceArea: (data.serviceArea as Record<string, unknown>) || null,
    openingDate: openingDate
      ? `${openingDate.year}-${String(openingDate.month).padStart(2, "0")}-${String(openingDate.day).padStart(2, "0")}`
      : null,
    metadata: {
      placeId: (metadata?.placeId as string) || null,
      mapsUri: (metadata?.mapsUri as string) || null,
      newReviewUri: (metadata?.newReviewUri as string) || null,
      hasVoiceOfMerchant: (metadata?.hasVoiceOfMerchant as boolean) || false,
      canModifyServiceList: (metadata?.canModifyServiceList as boolean) || false,
      canHaveFoodMenus: (metadata?.canHaveFoodMenus as boolean) || false,
    },
    completeness: { score, missing },
    socialProfiles: [],
    synced_at: new Date().toISOString(),
  };
}

/**
 * Pull profile from Google API and store in local DB.
 *
 * Initial sync (no cached profile): full write — Google is source of truth.
 * Re-sync (cached profile exists): safe merge — only updates read-only
 * metadata fields (placeId, mapsUri, reviewUri, verification status).
 * Never overwrites operator-editable fields (title, description, phone,
 * website, hours, address, categories, opening date).
 */
export async function syncProfileFromGoogle(siteId: string): Promise<GbpProfile | null> {
  const creds = await getGbpCredentials(siteId);
  if (!creds) return null;

  // Fire Location.get + attributes.list in parallel — attributes lives on a
  // separate endpoint and holds social profile URLs (url_facebook, etc.)
  // that the Location.readMask doesn't expose.
  const auth = { Authorization: `Bearer ${creds.accessToken}` };
  const [res, attrRes] = await Promise.all([
    fetch(`${BIZ_INFO_API}/${creds.locationPath}?readMask=${READ_MASK}`, { headers: auth }),
    fetch(`${BIZ_INFO_API}/${creds.locationPath}/attributes`, { headers: auth }),
  ]);

  if (!res.ok) {
    const err = await res.text();
    console.error("GBP profile fetch failed:", err.slice(0, 200));
    return null;
  }

  const data = await res.json();
  const result = parseLocationResponse(data);

  // Merge socialProfiles from the attributes endpoint (best-effort — if
  // the call fails we still have the rest of the profile).
  if (attrRes.ok) {
    try {
      const attrData = await attrRes.json();
      result.socialProfiles = parseAttributesResponse(attrData);
    } catch { /* skip */ }
  }

  // Check if this is initial sync or re-sync
  const [existingSite] = await sql`SELECT gbp_profile FROM sites WHERE id = ${siteId}`;
  const existing = (existingSite?.gbp_profile || {}) as Record<string, unknown>;
  const isInitialSync = !existing.title;

  if (isInitialSync) {
    // Initial sync — full write, Google is source of truth.
    // Reset dirty state too: by definition there are no local-side edits
    // pending push when we just pulled fresh from Google.
    await sql`
      UPDATE sites
      SET gbp_profile = ${JSON.stringify(result)}::jsonb,
          gbp_sync_dirty = false,
          gbp_dirty_fields = '{}'
      WHERE id = ${siteId}
    `;
  } else {
    // Re-sync — only update read-only metadata fields
    const safeUpdate = {
      ...existing,
      metadata: result.metadata,
      completeness: result.completeness,
      synced_at: result.synced_at,
      // Backfill socialProfiles from Google if local cache doesn't have
      // it yet (legacy cache from before this field existed). Once set,
      // local is canonical and subscriber edits survive re-sync.
      socialProfiles: existing.socialProfiles !== undefined
        ? existing.socialProfiles
        : result.socialProfiles,
    };
    await sql`
      UPDATE sites SET gbp_profile = ${JSON.stringify(safeUpdate)}::jsonb WHERE id = ${siteId}
    `;
  }

  // Categories sync: align site_gbp_categories with Google's snapshot.
  // The page reads from this relational store, not from gbp_profile.categories
  // JSONB. Google is canonical on each sync; replaces existing rows for
  // this site (including the primary flag). Subscriber-side edits push to
  // Google via pushCategoriesToGoogle and survive the next round-trip.
  type RawCategory = { name?: string; displayName?: string };
  const rawCats: Array<{ raw: RawCategory; isPrimary: boolean }> = [];
  if (data.categories?.primaryCategory) {
    rawCats.push({ raw: data.categories.primaryCategory, isPrimary: true });
  }
  for (const c of (data.categories?.additionalCategories || []) as RawCategory[]) {
    rawCats.push({ raw: c, isPrimary: false });
  }
  const parsedCats = rawCats
    .map(({ raw, isPrimary }) => {
      const name = raw.name || "";
      let gcid: string | null = null;
      if (name.startsWith("categories/")) gcid = name.slice("categories/".length);
      else if (name.startsWith("gcid:")) gcid = name;
      return gcid ? { gcid, displayName: raw.displayName || gcid, isPrimary } : null;
    })
    .filter((c): c is { gcid: string; displayName: string; isPrimary: boolean } => c !== null);

  if (parsedCats.length > 0) {
    // Ensure each gcid exists in gbp_categories (FK requirement)
    for (const c of parsedCats) {
      await sql`
        INSERT INTO gbp_categories (gcid, name)
        VALUES (${c.gcid}, ${c.displayName})
        ON CONFLICT (gcid) DO UPDATE SET name = EXCLUDED.name
      `;
    }
    // Replace site_gbp_categories rows — Google's snapshot wins on sync
    await sql`DELETE FROM site_gbp_categories WHERE site_id = ${siteId}`;
    for (const c of parsedCats) {
      await sql`
        INSERT INTO site_gbp_categories (site_id, gcid, is_primary, chosen_at, chosen_by)
        VALUES (${siteId}, ${c.gcid}, ${c.isPrimary}, NOW(), 'gbp_sync')
      `;
    }
  }

  // Defensive enrichment sweep: any place_id appearing in the pulled GBP
  // data that we don't already have enriched in service_areas_canonical
  // gets enriched in the background. Picker-driven enrichment is the
  // primary path; this catches places added directly in Google's UI.
  const placeInfos = (data.serviceArea?.places?.placeInfos || []) as Array<{ placeId?: string; placeName?: string }>;
  const placeIds = placeInfos.map((p) => p.placeId).filter((id): id is string => Boolean(id));
  if (placeIds.length > 0) {
    const known = await sql`
      SELECT place_id FROM service_areas_canonical
      WHERE place_id = ANY(${placeIds}::text[]) AND viewport IS NOT NULL
    `;
    const knownIds = new Set(known.map((r) => r.place_id as string));
    const toEnrich = placeInfos.filter((p) => p.placeId && !knownIds.has(p.placeId));
    if (toEnrich.length > 0) {
      try {
        const { waitUntil } = await import("@vercel/functions");
        const { enrichPlace } = await import("./enrich-place");
        waitUntil((async () => {
          for (const p of toEnrich) {
            try { await enrichPlace(p.placeId!, p.placeName || ""); } catch { /* skip */ }
          }
        })());
      } catch { /* @vercel/functions unavailable */ }
    }
  }

  // Return the merged result for the UI
  if (!isInitialSync) {
    return { ...(existing as unknown as GbpProfile), metadata: result.metadata, completeness: result.completeness, synced_at: result.synced_at };
  }

  return result;
}

/**
 * Update profile fields locally. Saves to DB cache + marks dirty for nightly sync.
 * No Google API call — changes push to Google via the nightly GBP sync cron.
 */
export async function updateProfile(
  siteId: string,
  updates: {
    title?: string;
    description?: string;
    phoneNumber?: string;
    websiteUri?: string;
    openingDate?: string;
    regularHours?: GbpProfile["regularHours"];
    serviceArea?: GbpProfile["serviceArea"];
    address?: GbpProfile["address"];
    socialProfiles?: GbpProfile["socialProfiles"];
  },
): Promise<{ success: boolean; error?: string }> {
  // Read current cached profile
  const [site] = await sql`SELECT gbp_profile FROM sites WHERE id = ${siteId}`;
  const cached = (site?.gbp_profile || {}) as Record<string, unknown>;

  if (!cached.title) {
    return { success: false, error: "No profile cached — sync from Google first" };
  }

  // Apply updates to local cache + track which fields changed
  const changedFields: string[] = [];
  if (updates.title !== undefined) { cached.title = updates.title; changedFields.push("title"); }
  if (updates.description !== undefined) { cached.description = updates.description; changedFields.push("profile.description"); }
  if (updates.phoneNumber !== undefined) { cached.phoneNumber = updates.phoneNumber; changedFields.push("phoneNumbers"); }
  if (updates.websiteUri !== undefined) { cached.websiteUri = updates.websiteUri; changedFields.push("websiteUri"); }
  if (updates.openingDate !== undefined) { cached.openingDate = updates.openingDate; changedFields.push("openInfo"); }
  if (updates.regularHours !== undefined) { cached.regularHours = updates.regularHours; changedFields.push("regularHours"); }
  if (updates.serviceArea !== undefined) { cached.serviceArea = updates.serviceArea; changedFields.push("serviceArea"); }
  if (updates.address !== undefined) { cached.address = updates.address; changedFields.push("storefrontAddress"); }
  if (updates.socialProfiles !== undefined) { cached.socialProfiles = updates.socialProfiles; changedFields.push("socialProfiles"); }

  cached.synced_at = new Date().toISOString();

  // Save locally + append dirty fields (deduped)
  await sql`
    UPDATE sites
    SET gbp_profile = ${JSON.stringify(cached)}::jsonb,
        gbp_sync_dirty = true,
        gbp_dirty_fields = (
          SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(gbp_dirty_fields, '{}') || ${changedFields}::text[]))
        )
    WHERE id = ${siteId}
  `;

  return { success: true };
}

/**
 * Push all pending profile + category changes to Google.
 * Called by nightly cron for dirty sites, or manually via admin.
 */
export async function pushProfileToGoogle(siteId: string): Promise<{ success: boolean; error?: string; pushed?: string[] }> {
  const creds = await getGbpCredentials(siteId);
  if (!creds) return { success: false, error: "No active GBP connection" };

  const [site] = await sql`SELECT gbp_profile, gbp_dirty_fields FROM sites WHERE id = ${siteId}`;
  const profile = (site?.gbp_profile || {}) as Record<string, unknown>;
  const dirtyFields = new Set((site?.gbp_dirty_fields || []) as string[]);

  if (!profile.title) return { success: false, error: "No profile data to push" };

  // If no specific dirty fields tracked, check for categories only
  const hasDirtyProfile = dirtyFields.size > 0;

  const updateMask: string[] = [];
  const body: Record<string, unknown> = {};

  // Only push fields that actually changed
  if (dirtyFields.has("title") && profile.title) {
    updateMask.push("title");
    body.title = profile.title;
  }
  if (dirtyFields.has("profile.description") && profile.description) {
    updateMask.push("profile.description");
    body.profile = { description: profile.description };
  }
  if (dirtyFields.has("phoneNumbers") && profile.phoneNumber) {
    updateMask.push("phoneNumbers");
    body.phoneNumbers = { primaryPhone: profile.phoneNumber };
  }
  if (dirtyFields.has("websiteUri") && profile.websiteUri) {
    updateMask.push("websiteUri");
    body.websiteUri = profile.websiteUri;
  }
  if (dirtyFields.has("regularHours") && (profile.regularHours as unknown[])?.length) {
    updateMask.push("regularHours");
    body.regularHours = {
      periods: (profile.regularHours as GbpProfile["regularHours"]).map((h) => ({
        openDay: h.day,
        openTime: parseTime(h.openTime),
        closeDay: h.day,
        closeTime: parseTime(h.closeTime),
      })),
    };
  }
  if (dirtyFields.has("openInfo") && profile.openingDate) {
    const [year, month, day] = (profile.openingDate as string).split("-").map(Number);
    if (year && month && day) {
      updateMask.push("openInfo");
      body.openInfo = { openingDate: { year, month, day }, status: "OPEN" };
    }
  }
  if (dirtyFields.has("storefrontAddress")) {
    const address = profile.address as GbpProfile["address"] | undefined;
    const hasAddress = address?.addressLines?.some((l) => l.trim()) || address?.locality?.trim();
    if (hasAddress) {
      updateMask.push("storefrontAddress");
      body.storefrontAddress = {
        addressLines: address!.addressLines.filter((l) => l.trim()),
        locality: address!.locality,
        administrativeArea: address!.administrativeArea,
        postalCode: address!.postalCode,
        regionCode: address!.regionCode || "US",
      };
    }
  }

  if (dirtyFields.has("serviceArea") && profile.serviceArea) {
    // Push the serviceArea object as-is — the shape we cache locally
    // (places.placeInfos[], regionCode, businessType) matches Google's
    // Business Information API contract.
    updateMask.push("serviceArea");
    body.serviceArea = profile.serviceArea;
  }

  // Also check if categories are dirty
  if (dirtyFields.has("categories")) {
    // Categories pushed separately via pushCategoriesToGoogle
  }

  if (updateMask.length > 0) {
    console.log("GBP push to:", `${BIZ_INFO_API}/${creds.locationPath}`);
    console.log("GBP push fields:", updateMask.join(", "));
    console.log("GBP push body:", JSON.stringify(body).slice(0, 500));
    const res = await fetch(
      `${BIZ_INFO_API}/${creds.locationPath}?updateMask=${updateMask.join(",")}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      const isQuota = err.includes("429") || err.includes("quota") || err.includes("rateLimitExceeded");
      console.error("GBP profile push failed:", err.slice(0, 300));
      console.error("GBP push attempted fields:", updateMask.join(", "));
      // Keep dirty flag on ALL errors so user can retry
      return { success: false, error: isQuota ? "Quota exceeded — will retry" : `Push failed (${res.status}). Fields: ${updateMask.join(", ")}. Google: ${err.slice(0, 100)}` };
    }

    // Pull-after-push: parse Google's PATCH response (the updated location
    // resource) and overwrite the cache. Captures any server-side normalization
    // (phone formatting, address geocoding) so local matches Google exactly.
    try {
      const patched = await res.json();
      const refreshed = parseLocationResponse(patched);
      // Preserve socialProfiles — the Location PATCH doesn't include them.
      refreshed.socialProfiles = (profile.socialProfiles as GbpProfile["socialProfiles"]) || [];
      await sql`
        UPDATE sites SET gbp_profile = ${JSON.stringify(refreshed)}::jsonb WHERE id = ${siteId}
      `;
    } catch (err) {
      console.warn("GBP push: failed to parse PATCH response, cache will reflect what we sent:", err instanceof Error ? err.message : err);
    }
  }

  // Push social profiles (separate /attributes endpoint).
  // Note: this endpoint uses `attributeMask` as the query param — NOT
  // `updateMask` (the Location endpoint's name). attributeMask lists
  // ALL platforms we support so removed entries get cleared on Google's
  // side too. Body only contains entries the subscriber currently has —
  // Google interprets "in mask, not in body" as deletion.
  if (dirtyFields.has("socialProfiles")) {
    const socialProfiles = (profile.socialProfiles as GbpProfile["socialProfiles"]) || [];
    const allMaskNames = SOCIAL_PLATFORMS.map((p) => `attributes/url_${p}`).join(",");
    const attrBody = {
      name: `${creds.locationPath}/attributes`,
      attributes: socialProfiles.map((sp) => ({
        name: `attributes/url_${sp.platform}`,
        valueType: "URL",
        uriValues: [{ uri: sp.url }],
      })),
    };
    const attrRes = await fetch(
      `${BIZ_INFO_API}/${creds.locationPath}/attributes?attributeMask=${encodeURIComponent(allMaskNames)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(attrBody),
      }
    );
    if (!attrRes.ok) {
      const err = await attrRes.text();
      console.error("GBP attributes push failed:", err.slice(0, 300));
      return { success: false, error: `Social profiles push failed (${attrRes.status}). Google: ${err.slice(0, 100)}` };
    }

    // Pull-after-push for socialProfiles: parse Google's response and
    // sync the cache. Google echoes the full updated attributes set,
    // so this captures any server-side normalization.
    try {
      const attrPatched = await attrRes.json();
      const refreshedSocial = parseAttributesResponse(attrPatched);
      await sql`
        UPDATE sites
        SET gbp_profile = jsonb_set(COALESCE(gbp_profile, '{}'::jsonb), '{socialProfiles}', ${JSON.stringify(refreshedSocial)}::jsonb)
        WHERE id = ${siteId}
      `;
    } catch (err) {
      console.warn("GBP attributes push: failed to parse response:", err instanceof Error ? err.message : err);
    }
  }

  // Also push categories if dirty
  if (dirtyFields.has("categories")) {
    const catResult = await pushCategoriesToGoogle(siteId);
    if (!catResult.success && catResult.error?.includes("Quota")) {
      return { success: false, error: "Quota exceeded on categories — will retry" };
    }
  }

  // Clear dirty flag + dirty fields on full success
  await sql`UPDATE sites SET gbp_sync_dirty = false, gbp_dirty_fields = '{}' WHERE id = ${siteId}`;

  return { success: true, pushed: updateMask.length > 0 ? updateMask : ["categories"] };
}

/**
 * Nightly sync: push all dirty sites to Google.
 * Called by cron job.
 */
export async function syncDirtySites(): Promise<{ pushed: number; failed: number }> {
  const dirtySites = await sql`
    SELECT id, name FROM sites WHERE gbp_sync_dirty = true AND is_active = true
  `;

  let pushed = 0;
  let failed = 0;

  for (const site of dirtySites) {
    const result = await pushProfileToGoogle(site.id as string);
    if (result.success) {
      pushed++;
      console.log(`GBP sync: pushed ${site.name}`);
    } else {
      failed++;
      console.error(`GBP sync failed for ${site.name}: ${result.error}`);
    }
  }

  return { pushed, failed };
}

function formatTime(time: Record<string, number> | undefined): string {
  if (!time) return "";
  return `${String(time.hours || 0).padStart(2, "0")}:${String(time.minutes || 0).padStart(2, "0")}`;
}

function parseTime(time: string): Record<string, number> {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Push TracPost's categories to Google Business Profile.
 * TracPost is the source of truth — Google is the consumer.
 */
export async function pushCategoriesToGoogle(siteId: string): Promise<{ success: boolean; error?: string }> {
  const creds = await getGbpCredentials(siteId);
  if (!creds) return { success: false, error: "No active GBP connection" };

  const categories = await sql`
    SELECT sgc.gcid, sgc.is_primary, gc.name
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC
  `;

  if (categories.length === 0) {
    return { success: false, error: "No categories configured" };
  }

  const primary = categories.find((c) => c.is_primary);
  const additional = categories.filter((c) => !c.is_primary);

  const body: Record<string, unknown> = {
    categories: {
      primaryCategory: primary
        ? { name: primary.gcid, displayName: primary.name }
        : undefined,
      additionalCategories: additional.map((c) => ({
        name: c.gcid,
        displayName: c.name,
      })),
    },
  };

  const res = await fetch(
    `${BIZ_INFO_API}/${creds.locationPath}?updateMask=categories`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("GBP category push failed:", err.slice(0, 200));
    return { success: false, error: `Push failed (${res.status})` };
  }

  return { success: true };
}
