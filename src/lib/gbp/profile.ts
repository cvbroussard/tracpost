import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

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
  synced_at?: string;
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

async function getGbpCredentials(siteId: string): Promise<{
  accessToken: string;
  locationPath: string;
  accountId: string;
} | null> {
  const [gbpAccount] = await sql`
    SELECT sa.id, sa.account_id, sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!gbpAccount) return null;

  const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
  // v1 Business Information API uses just "locations/{id}" — no accounts prefix
  const locationPath = gbpAccount.account_id as string;

  return { accessToken, locationPath, accountId: gbpAccount.id as string };
}

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
 * Pull profile from Google API, parse it, and store in local DB.
 * Called on initial connection, weekly integrity check, or manual refresh.
 */
export async function syncProfileFromGoogle(siteId: string): Promise<GbpProfile | null> {
  const creds = await getGbpCredentials(siteId);
  if (!creds) return null;

  const res = await fetch(
    `${BIZ_INFO_API}/${creds.locationPath}?readMask=${READ_MASK}`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("GBP profile fetch failed:", err.slice(0, 200));
    return null;
  }

  const data = await res.json();

  // Parse regular hours
  const regularHours: GbpProfile["regularHours"] = [];
  if (data.regularHours?.periods) {
    for (const period of data.regularHours.periods) {
      regularHours.push({
        day: period.openDay || "",
        openTime: formatTime(period.openTime),
        closeTime: formatTime(period.closeTime),
      });
    }
  }

  // Parse special hours
  const specialHours: GbpProfile["specialHours"] = [];
  if (data.specialHours?.specialHourPeriods) {
    for (const period of data.specialHours.specialHourPeriods) {
      specialHours.push({
        date: `${period.startDate?.year}-${String(period.startDate?.month).padStart(2, "0")}-${String(period.startDate?.day).padStart(2, "0")}`,
        openTime: formatTime(period.openTime),
        closeTime: formatTime(period.closeTime),
        isClosed: period.closed || false,
      });
    }
  }

  // Parse categories
  const primaryCategory = data.categories?.primaryCategory?.displayName || "";
  const additionalCategories = (data.categories?.additionalCategories || [])
    .map((c: Record<string, string>) => c.displayName || "");

  // Calculate completeness
  const missing: string[] = [];
  if (!data.title) missing.push("Business name");
  if (!data.profile?.description) missing.push("Description");
  if (!data.phoneNumbers?.primaryPhone) missing.push("Phone number");
  if (!data.websiteUri) missing.push("Website");
  if (!data.storefrontAddress) missing.push("Address");
  if (!data.regularHours?.periods?.length) missing.push("Business hours");
  if (!primaryCategory) missing.push("Primary category");
  if (!additionalCategories.length) missing.push("Additional categories");

  const totalFields = 8;
  const filledFields = totalFields - missing.length;
  const score = Math.round((filledFields / totalFields) * 100);

  const result: GbpProfile = {
    name: data.name || "",
    title: data.title || "",
    description: data.profile?.description || "",
    phoneNumber: data.phoneNumbers?.primaryPhone || "",
    websiteUri: data.websiteUri || "",
    address: {
      addressLines: data.storefrontAddress?.addressLines || [],
      locality: data.storefrontAddress?.locality || "",
      administrativeArea: data.storefrontAddress?.administrativeArea || "",
      postalCode: data.storefrontAddress?.postalCode || "",
      regionCode: data.storefrontAddress?.regionCode || "US",
    },
    regularHours,
    specialHours,
    categories: {
      primary: primaryCategory,
      additional: additionalCategories,
    },
    serviceArea: data.serviceArea || null,
    openingDate: data.openInfo?.openingDate
      ? `${data.openInfo.openingDate.year}-${String(data.openInfo.openingDate.month).padStart(2, "0")}-${String(data.openInfo.openingDate.day).padStart(2, "0")}`
      : null,
    metadata: {
      placeId: data.metadata?.placeId || null,
      mapsUri: data.metadata?.mapsUri || null,
      newReviewUri: data.metadata?.newReviewUri || null,
      hasVoiceOfMerchant: data.metadata?.hasVoiceOfMerchant || false,
      canModifyServiceList: data.metadata?.canModifyServiceList || false,
      canHaveFoodMenus: data.metadata?.canHaveFoodMenus || false,
    },
    completeness: { score, missing },
    synced_at: new Date().toISOString(),
  };

  // Cache in local DB
  await sql`
    UPDATE sites SET gbp_profile = ${JSON.stringify(result)}::jsonb WHERE id = ${siteId}
  `;

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
