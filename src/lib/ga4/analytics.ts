import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * GA4 Data API client — reads analytics data for tenant sites.
 *
 * Uses the Google Analytics Data API v1beta:
 *   POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
 *
 * Authentication: uses the GBP OAuth token (same Google account, analytics.readonly scope).
 */

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";

interface GA4Credentials {
  accessToken: string;
  propertyId: string;
}

async function getCredentials(siteId: string): Promise<GA4Credentials | null> {
  const [site] = await sql`SELECT ga4_property_id FROM sites WHERE id = ${siteId}`;
  const propertyId = site?.ga4_property_id as string;
  if (!propertyId) return null;

  // Use the GBP token (same Google OAuth, has analytics.readonly scope)
  const [gbpAccount] = await sql`
    SELECT sa.access_token_encrypted
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!gbpAccount) return null;

  return {
    accessToken: decrypt(gbpAccount.access_token_encrypted as string),
    propertyId,
  };
}

async function runReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`GA4 report failed (${res.status}):`, err.slice(0, 200));
    return null;
  }

  return res.json();
}

/**
 * Overview metrics — the morning dashboard numbers.
 */
export async function fetchOverview(siteId: string, days = 30): Promise<{
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number;
  bounceRate: number;
} | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    metrics: [
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
    ],
  });

  if (!data?.rows) return null;

  const values = ((data.rows as Array<Record<string, unknown>>)[0]?.metricValues as Array<{ value: string }>) || [];
  return {
    totalUsers: parseInt(values[0]?.value || "0"),
    newUsers: parseInt(values[1]?.value || "0"),
    sessions: parseInt(values[2]?.value || "0"),
    pageViews: parseInt(values[3]?.value || "0"),
    avgSessionDuration: parseFloat(values[4]?.value || "0"),
    bounceRate: parseFloat(values[5]?.value || "0"),
  };
}

/**
 * Traffic by source/channel — where visitors come from.
 */
export async function fetchAcquisition(siteId: string, days = 30): Promise<Array<{
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}> | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "newUsers" },
    ],
    orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
    limit: 10,
  });

  if (!data?.rows) return null;

  return (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    return {
      channel: dims[0]?.value || "Unknown",
      users: parseInt(vals[0]?.value || "0"),
      sessions: parseInt(vals[1]?.value || "0"),
      newUsers: parseInt(vals[2]?.value || "0"),
    };
  });
}

/**
 * Top pages — which pages get the most views.
 */
export async function fetchTopPages(siteId: string, days = 30): Promise<Array<{
  pagePath: string;
  pageViews: number;
  users: number;
  avgDuration: number;
}> | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "totalUsers" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 15,
  });

  if (!data?.rows) return null;

  return (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    return {
      pagePath: dims[0]?.value || "/",
      pageViews: parseInt(vals[0]?.value || "0"),
      users: parseInt(vals[1]?.value || "0"),
      avgDuration: parseFloat(vals[2]?.value || "0"),
    };
  });
}

/**
 * Traffic trend — daily users over time for chart rendering.
 */
export async function fetchTrafficTrend(siteId: string, days = 30): Promise<Array<{
  date: string;
  users: number;
  sessions: number;
  pageViews: number;
}> | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
  });

  if (!data?.rows) return null;

  return (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    const d = dims[0]?.value || "";
    return {
      date: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "",
      users: parseInt(vals[0]?.value || "0"),
      sessions: parseInt(vals[1]?.value || "0"),
      pageViews: parseInt(vals[2]?.value || "0"),
    };
  });
}

/**
 * Audience geography — top cities.
 */
export async function fetchGeography(siteId: string, days = 30): Promise<Array<{
  city: string;
  region: string;
  users: number;
}> | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "city" }, { name: "region" }],
    metrics: [{ name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
    limit: 15,
  });

  if (!data?.rows) return null;

  return (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    return {
      city: dims[0]?.value || "Unknown",
      region: dims[1]?.value || "",
      users: parseInt(vals[0]?.value || "0"),
    };
  });
}

/**
 * Device breakdown — mobile vs desktop vs tablet.
 */
export async function fetchDevices(siteId: string, days = 30): Promise<Array<{
  category: string;
  users: number;
  percentage: number;
}> | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
  });

  if (!data?.rows) return null;

  const rows = (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    return {
      category: dims[0]?.value || "Unknown",
      users: parseInt(vals[0]?.value || "0"),
      percentage: 0,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.users, 0);
  rows.forEach((r) => { r.percentage = total > 0 ? Math.round((r.users / total) * 100) : 0; });

  return rows;
}

/**
 * TracPost attribution — traffic from our UTM tags.
 */
export async function fetchTracPostAttribution(siteId: string, days = 30): Promise<{
  totalFromTracPost: number;
  byMedium: Array<{ medium: string; users: number }>;
} | null> {
  const creds = await getCredentials(siteId);
  if (!creds) return null;

  const data = await runReport(creds.accessToken, creds.propertyId, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "sessionMedium" }],
    metrics: [{ name: "totalUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionSource",
        stringFilter: { value: "tracpost", matchType: "EXACT" },
      },
    },
    orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
  });

  if (!data?.rows) return { totalFromTracPost: 0, byMedium: [] };

  const byMedium = (data.rows as Array<Record<string, unknown>>).map((row) => {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const vals = row.metricValues as Array<{ value: string }>;
    return {
      medium: dims[0]?.value || "unknown",
      users: parseInt(vals[0]?.value || "0"),
    };
  });

  return {
    totalFromTracPost: byMedium.reduce((sum, r) => sum + r.users, 0),
    byMedium,
  };
}
