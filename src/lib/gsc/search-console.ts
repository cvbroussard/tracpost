/**
 * Google Search Console API client.
 * Fetches search analytics (queries, pages, impressions, clicks, CTR, position).
 */
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { refreshGoogleToken } from "@/lib/google";

const GSC_API = "https://www.googleapis.com/webmasters/v3";

interface SearchRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function getAccessToken(siteId: string): Promise<string | null> {
  const [account] = await sql`
    SELECT sa.access_token_encrypted, sa.refresh_token_encrypted, sa.token_expires_at
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sa.platform = 'gbp'
      AND sa.status = 'active'
    LIMIT 1
  `;

  if (!account) return null;

  const now = new Date();
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at as string) : null;

  if (expiresAt && expiresAt > now) {
    return decrypt(account.access_token_encrypted as string);
  }

  // Refresh
  const refreshToken = decrypt(account.refresh_token_encrypted as string);
  if (!refreshToken) return null;

  try {
    const { accessToken, expiresIn } = await refreshGoogleToken(refreshToken);
    const { encrypt } = await import("@/lib/crypto");
    const newExpiry = new Date(Date.now() + expiresIn * 1000);

    await sql`
      UPDATE social_accounts
      SET access_token_encrypted = ${encrypt(accessToken)},
          token_expires_at = ${newExpiry.toISOString()}
      WHERE id = (
        SELECT sa.id FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
        LIMIT 1
      )
    `;

    return accessToken;
  } catch {
    return null;
  }
}

function getPropertyUrl(customDomain: string): string {
  return `sc-domain:${customDomain}`;
}

/**
 * Fetch search analytics from Google Search Console.
 */
export async function fetchSearchAnalytics(
  siteId: string,
  days: number = 28,
): Promise<SearchRow[]> {
  const accessToken = await getAccessToken(siteId);
  if (!accessToken) return [];

  const [site] = await sql`
    SELECT bs.custom_domain, s.gsc_property
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  if (!site) return [];

  const customDomain = site.custom_domain as string | null;
  const gscProperty = site.gsc_property as string | null;

  // Prefer stored property URL, fall back to domain-based
  const property = gscProperty || (customDomain ? getPropertyUrl(customDomain) : null);
  if (!property) return [];

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC has 3-day delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const res = await fetch(
    `${GSC_API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        dimensions: ["query", "page"],
        rowLimit: 500,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.warn("GSC query failed:", res.status, text.slice(0, 200));
    return [];
  }

  const data = await res.json();
  return (data.rows || []).map((row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
    query: row.keys[0],
    page: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 1000) / 10,
    position: Math.round(row.position * 10) / 10,
  }));
}

/**
 * Pull and store search performance data for a site.
 */
export async function syncSearchPerformance(siteId: string, days: number = 28): Promise<number> {
  const rows = await fetchSearchAnalytics(siteId, days);
  if (rows.length === 0) return 0;

  // Use a date based on the middle of the range for daily storage
  const date = new Date();
  date.setDate(date.getDate() - 3);
  const dateStr = date.toISOString().split("T")[0];

  let stored = 0;
  for (const row of rows) {
    try {
      await sql`
        INSERT INTO search_performance (site_id, url, query, impressions, clicks, ctr, position, date)
        VALUES (${siteId}, ${row.page}, ${row.query}, ${row.impressions}, ${row.clicks}, ${row.ctr}, ${row.position}, ${dateStr})
        ON CONFLICT (site_id, url, query, date) DO UPDATE SET
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          ctr = EXCLUDED.ctr,
          position = EXCLUDED.position
      `;
      stored++;
    } catch { /* skip duplicates */ }
  }

  return stored;
}

/**
 * List available Search Console properties for the authenticated user.
 */
export async function listProperties(accessToken: string): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const res = await fetch(`${GSC_API}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.siteEntry || []).map((entry: { siteUrl: string; permissionLevel: string }) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
}
