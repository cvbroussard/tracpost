import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * GBP Performance API — fetch business metrics.
 *
 * Uses Business Profile Performance API:
 *   GET https://businessprofileperformance.googleapis.com/v1/{location}/searchkeywords/impressions/monthly
 *   GET https://businessprofileperformance.googleapis.com/v1/{location}:getDailyMetricsTimeSeries
 *
 * Metrics available:
 *   - WEBSITE_CLICKS, CALL_CLICKS, DIRECTION_REQUESTS
 *   - BUSINESS_IMPRESSIONS_DESKTOP_MAPS, BUSINESS_IMPRESSIONS_DESKTOP_SEARCH
 *   - BUSINESS_IMPRESSIONS_MOBILE_MAPS, BUSINESS_IMPRESSIONS_MOBILE_SEARCH
 *   - BUSINESS_CONVERSATIONS, BUSINESS_BOOKINGS
 */

const PERF_API = "https://businessprofileperformance.googleapis.com/v1";

export interface DailyMetric {
  date: string;
  value: number;
}

export interface PerformanceData {
  websiteClicks: DailyMetric[];
  callClicks: DailyMetric[];
  directionRequests: DailyMetric[];
  searchImpressions: DailyMetric[];
  mapsImpressions: DailyMetric[];
  searchKeywords: Array<{ keyword: string; impressions: number }>;
}

function buildLocationPath(accountMetadata: Record<string, unknown>, platformAccountId: string): string {
  const gbpAccountId = (accountMetadata?.account_id as string) || "";
  return gbpAccountId && platformAccountId
    ? `${gbpAccountId}/${platformAccountId}`
    : platformAccountId;
}

async function fetchDailyMetric(
  accessToken: string,
  locationPath: string,
  metric: string,
  startDate: string,
  endDate: string,
): Promise<DailyMetric[]> {
  const params = new URLSearchParams({
    "dailyMetric": metric,
    "dailyRange.startDate.year": startDate.split("-")[0],
    "dailyRange.startDate.month": startDate.split("-")[1],
    "dailyRange.startDate.day": startDate.split("-")[2],
    "dailyRange.endDate.year": endDate.split("-")[0],
    "dailyRange.endDate.month": endDate.split("-")[1],
    "dailyRange.endDate.day": endDate.split("-")[2],
  });

  const url = `${PERF_API}/${locationPath}:getDailyMetricsTimeSeries?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`GBP Performance ${metric} failed:`, err.slice(0, 200));
    return [];
  }

  const data = await res.json();
  const series = data.timeSeries?.datedValues || [];

  return series.map((entry: Record<string, unknown>) => {
    const date = entry.date as Record<string, number>;
    return {
      date: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`,
      value: parseInt(String(entry.value || "0"), 10),
    };
  });
}

async function fetchSearchKeywords(
  accessToken: string,
  locationPath: string,
  year: number,
  month: number,
): Promise<Array<{ keyword: string; impressions: number }>> {
  const url = `${PERF_API}/${locationPath}/searchkeywords/impressions/monthly?monthlyRange.startMonth.year=${year}&monthlyRange.startMonth.month=${month}&monthlyRange.endMonth.year=${year}&monthlyRange.endMonth.month=${month}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("GBP search keywords failed:", err.slice(0, 200));
    return [];
  }

  const data = await res.json();
  const keywords = data.searchKeywordsCounts || [];

  return keywords
    .map((k: Record<string, unknown>) => ({
      keyword: (k.searchKeyword as string) || "",
      impressions: parseInt(String((k.insightsValue as Record<string, string>)?.value || "0"), 10),
    }))
    .sort((a: { impressions: number }, b: { impressions: number }) => b.impressions - a.impressions)
    .slice(0, 20);
}

/**
 * Fetch full performance data for a site's GBP location.
 * Returns 30 days of daily metrics + top search keywords.
 */
export async function fetchPerformance(siteId: string): Promise<PerformanceData | null> {
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

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const [websiteClicks, callClicks, directionRequests, searchDesktop, searchMobile, mapsDesktop, mapsMobile, searchKeywords] =
    await Promise.all([
      fetchDailyMetric(accessToken, locationPath, "WEBSITE_CLICKS", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "CALL_CLICKS", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "DIRECTION_REQUESTS", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", startStr, endStr),
      fetchDailyMetric(accessToken, locationPath, "BUSINESS_IMPRESSIONS_MOBILE_MAPS", startStr, endStr),
      fetchSearchKeywords(accessToken, locationPath, endDate.getFullYear(), endDate.getMonth() + 1),
    ]);

  // Combine desktop + mobile impressions
  const searchImpressions = mergeMetrics(searchDesktop, searchMobile);
  const mapsImpressions = mergeMetrics(mapsDesktop, mapsMobile);

  return {
    websiteClicks,
    callClicks,
    directionRequests,
    searchImpressions,
    mapsImpressions,
    searchKeywords,
  };
}

function mergeMetrics(a: DailyMetric[], b: DailyMetric[]): DailyMetric[] {
  const map = new Map<string, number>();
  for (const m of a) map.set(m.date, (map.get(m.date) || 0) + m.value);
  for (const m of b) map.set(m.date, (map.get(m.date) || 0) + m.value);
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
