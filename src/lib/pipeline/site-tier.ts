import { sql } from "@/lib/db";

/**
 * Resolve a site's subscription tier for tier-gated render decisions.
 *
 * Joins media_assets-adjacent path: site → subscription → plan → tier.
 * Returns null if no active subscription / plan; caller treats that as
 * "no tier-gated features."
 *
 * Cached at the call-site level via the Map below — site tiers don't
 * change frequently, and renderTemplateVariant gets called many times
 * per briefing (once per template).
 */
const tierCache = new Map<string, { tier: string | null; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60s — fresh enough for an upgrade to propagate within a minute

export async function getSiteTier(siteId: string): Promise<string | null> {
  const cached = tierCache.get(siteId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tier;
  }

  const [row] = await sql`
    SELECT p.tier
    FROM businesses s
    LEFT JOIN accounts sub ON sub.id = s.billing_account_id
    LEFT JOIN plans p ON p.id = sub.plan_id
    WHERE s.id = ${siteId}
    LIMIT 1
  `;

  const tier = (row?.tier as string | null) || null;
  tierCache.set(siteId, { tier, cachedAt: Date.now() });
  return tier;
}

/**
 * Whether a site qualifies for Enterprise-tier features (Smart Rotate,
 * ads bundle, etc.). Per project_tracpost_smart_rotate_self_host.md:
 * Enterprise routes to Smart Rotate; mid-tier falls back to ffmpeg.
 */
export async function isEnterpriseTier(siteId: string): Promise<boolean> {
  const tier = await getSiteTier(siteId);
  return tier === "enterprise";
}
