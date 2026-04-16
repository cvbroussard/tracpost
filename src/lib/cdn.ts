/**
 * Cloudflare cache-purge helper for the assets.tracpost.com zone.
 * Called after R2 writes when we need the new bytes visible immediately
 * (replace flow, delete flow). Without this, Cloudflare's edge caches
 * serve stale bytes for up to ~24h even when the origin has updated.
 *
 * Requires CLOUDFLARE_API_TOKEN (scoped to Cache Purge) and
 * CLOUDFLARE_ZONE_ID for the assets domain. Both absent → no-op with
 * a console warning; partial stale serve is preferable to a failed
 * request from the user's POV.
 */

interface PurgeResult {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
}

export async function purgeCdnCache(urls: string[]): Promise<PurgeResult> {
  if (urls.length === 0) return { success: true };

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!token || !zoneId) {
    console.warn(
      "[cdn] Cloudflare purge skipped — CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set. " +
      "Stale bytes may serve for up to 24h.",
    );
    return { success: false, errors: [{ code: 0, message: "credentials missing" }] };
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
      },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error("[cdn] purge failed:", data);
      return { success: false, errors: data.errors };
    }
    return { success: true };
  } catch (err) {
    console.error("[cdn] purge threw:", err);
    return {
      success: false,
      errors: [{ code: -1, message: err instanceof Error ? err.message : "unknown" }],
    };
  }
}
