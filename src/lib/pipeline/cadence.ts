/**
 * Cadence engine — evaluates whether NOW is the right time to
 * publish on a given platform for a given tenant. Checks all 5
 * dimensions: date, day of week, time of day, frequency, daily cap.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface PlatformCadence {
  frequency: number;
  frequency_unit: "day" | "week";
  max_per_day: number;
  active_days: string[];
  time_windows: string[];
  timezone: string;
}

export interface Campaign {
  label: string;
  start: string;
  end: string;
  boost_pillars: string[];
  frequency_multiplier: number;
}

export interface CadenceConfig {
  platforms: Record<string, PlatformCadence>;
  blackout_dates?: string[];
  blackout_ranges?: Array<{ start: string; end: string; reason?: string }>;
  campaigns?: Campaign[];
  content_triggers?: Record<string, { delay_hours: number; format: string }>;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Check if the current time falls within a time window string like "07:00-10:00".
 */
function isInTimeWindow(window: string, now: Date, timezone: string): boolean {
  const [startStr, endStr] = window.split("-");
  if (!startStr || !endStr) return false;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const currentTime = formatter.format(now);
  return currentTime >= startStr && currentTime <= endStr;
}

/**
 * Get the current day name in the tenant's timezone.
 */
function getDayName(now: Date, timezone: string): string {
  const dayIndex = new Date(
    now.toLocaleString("en-US", { timeZone: timezone }),
  ).getDay();
  return DAY_NAMES[dayIndex];
}

/**
 * Get today's date string in the tenant's timezone (YYYY-MM-DD).
 */
function getDateStr(now: Date, timezone: string): string {
  return new Date(
    now.toLocaleString("en-US", { timeZone: timezone }),
  ).toISOString().slice(0, 10);
}

/**
 * Check if today is a blackout date.
 */
function isBlackout(config: CadenceConfig, dateStr: string): boolean {
  if (config.blackout_dates?.includes(dateStr)) return true;
  if (config.blackout_ranges) {
    for (const range of config.blackout_ranges) {
      if (dateStr >= range.start && dateStr <= range.end) return true;
    }
  }
  return false;
}

/**
 * Find any active campaign for today.
 */
export function getActiveCampaign(config: CadenceConfig, dateStr: string): Campaign | null {
  if (!config.campaigns) return null;
  return config.campaigns.find(
    (c) => dateStr >= c.start && dateStr <= c.end,
  ) || null;
}

/**
 * Count posts published today for a site + platform.
 */
async function countPublishedToday(siteId: string, platform: string): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*)::int AS n
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId}
      AND sa.platform = ${platform}
      AND sp.status = 'published'
      AND sp.published_at >= CURRENT_DATE
  `;
  return (row?.n as number) || 0;
}

/**
 * Count posts published this week for a site + platform.
 */
async function countPublishedThisWeek(siteId: string, platform: string): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*)::int AS n
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId}
      AND sa.platform = ${platform}
      AND sp.status = 'published'
      AND sp.published_at >= DATE_TRUNC('week', CURRENT_DATE)
  `;
  return (row?.n as number) || 0;
}

/**
 * Main decision: should we publish to this platform right now?
 */
export async function shouldPublishNow(
  siteId: string,
  platform: string,
  config: CadenceConfig,
): Promise<{ publish: boolean; reason?: string }> {
  const now = new Date();
  const platConfig = config.platforms?.[platform];
  if (!platConfig) {
    return { publish: false, reason: "No cadence config for platform" };
  }

  const tz = platConfig.timezone || "America/New_York";
  const dateStr = getDateStr(now, tz);
  const dayName = getDayName(now, tz);

  // 1. Blackout check
  if (isBlackout(config, dateStr)) {
    return { publish: false, reason: `Blackout: ${dateStr}` };
  }

  // 2. Day of week check
  if (!platConfig.active_days.includes(dayName)) {
    return { publish: false, reason: `Inactive day: ${dayName}` };
  }

  // 3. Time window check
  if (platConfig.time_windows.length > 0) {
    const inWindow = platConfig.time_windows.some((w) => isInTimeWindow(w, now, tz));
    if (!inWindow) {
      return { publish: false, reason: "Outside time window" };
    }
  }

  // 4. Daily cap check
  const todayCount = await countPublishedToday(siteId, platform);
  if (todayCount >= platConfig.max_per_day) {
    return { publish: false, reason: `Daily cap reached: ${todayCount}/${platConfig.max_per_day}` };
  }

  // 5. Weekly frequency check
  if (platConfig.frequency_unit === "week") {
    const campaign = getActiveCampaign(config, dateStr);
    const effectiveFreq = campaign
      ? Math.ceil(platConfig.frequency * (campaign.frequency_multiplier || 1))
      : platConfig.frequency;

    const weekCount = await countPublishedThisWeek(siteId, platform);
    if (weekCount >= effectiveFreq) {
      return { publish: false, reason: `Weekly frequency reached: ${weekCount}/${effectiveFreq}` };
    }
  }

  return { publish: true };
}

/**
 * Load cadence config for a site, with sensible defaults.
 */
export async function loadCadenceConfig(siteId: string): Promise<CadenceConfig> {
  const [site] = await sql`
    SELECT cadence_config FROM businesses WHERE id = ${siteId}
  `;
  const stored = (site?.cadence_config || {}) as CadenceConfig;

  // Ensure defaults for any connected platform not explicitly configured
  if (!stored.platforms) stored.platforms = {};

  const accounts = await sql`
    SELECT sa.platform
    FROM social_accounts sa
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId} AND sa.status = 'active'
  `;

  for (const acct of accounts) {
    const plat = String(acct.platform);
    if (!stored.platforms[plat]) {
      stored.platforms[plat] = {
        frequency: 3,
        frequency_unit: "week",
        max_per_day: 2,
        active_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
        time_windows: ["08:00-11:00", "17:00-20:00"],
        timezone: "America/New_York",
      };
    }
  }

  return stored;
}
