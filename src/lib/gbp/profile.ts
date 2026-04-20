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
  const metadata = gbpAccount.metadata as Record<string, unknown>;
  const locationPath = buildLocationPath(metadata, gbpAccount.account_id);

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
 * Update specific fields on the GBP profile.
 * Pushes to Google AND updates local cache.
 */
export async function updateProfile(
  siteId: string,
  updates: {
    description?: string;
    phoneNumber?: string;
    websiteUri?: string;
    regularHours?: GbpProfile["regularHours"];
  },
): Promise<{ success: boolean; error?: string }> {
  const creds = await getGbpCredentials(siteId);
  if (!creds) return { success: false, error: "No active GBP connection" };

  const updateMask: string[] = [];
  const body: Record<string, unknown> = {};

  if (updates.description !== undefined) {
    updateMask.push("profile.description");
    body.profile = { description: updates.description };
  }

  if (updates.phoneNumber !== undefined) {
    updateMask.push("phoneNumbers");
    body.phoneNumbers = { primaryPhone: updates.phoneNumber };
  }

  if (updates.websiteUri !== undefined) {
    updateMask.push("websiteUri");
    body.websiteUri = updates.websiteUri;
  }

  if (updates.regularHours !== undefined) {
    updateMask.push("regularHours");
    body.regularHours = {
      periods: updates.regularHours.map((h) => ({
        openDay: h.day,
        openTime: parseTime(h.openTime),
        closeDay: h.day,
        closeTime: parseTime(h.closeTime),
      })),
    };
  }

  if (updateMask.length === 0) {
    return { success: false, error: "No fields to update" };
  }

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
    console.error("GBP profile update failed:", err.slice(0, 200));
    return { success: false, error: `Update failed (${res.status})` };
  }

  // Re-sync from Google to update local cache with confirmed state
  await syncProfileFromGoogle(siteId);

  return { success: true };
}

function formatTime(time: Record<string, number> | undefined): string {
  if (!time) return "";
  return `${String(time.hours || 0).padStart(2, "0")}:${String(time.minutes || 0).padStart(2, "0")}`;
}

function parseTime(time: string): Record<string, number> {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}
