import type { AssetAnalysisApi, InspectorTagGroup } from "@/hooks/use-asset-analysis";

/**
 * The data layer for asset analysis. The subscriber surface and the manager
 * (operator-session) surface differ only by a query-string suffix — the manager
 * appends ?subscription_id=<id> so authenticateRequest's admin-acting-on-
 * behalf path (src/lib/auth.ts Path 3) resolves the right subscriber context.
 */
function makeAnalysisApi(query: string): AssetAnalysisApi {
  return {
    async suggestTags({ transcript, siteId, assetId }) {
      const res = await fetch(`/api/auto-tag-suggest${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          site_id: siteId,
          source_asset_id: assetId,
        }),
      });
      if (!res.ok) {
        console.warn("Auto-tag suggest HTTP", res.status, await res.text().catch(() => ""));
        return null;
      }
      return res.json();
    },

    async createEntity({ group, name, siteId, seedSource, seedRecordingId, seedAssetId }) {
      const endpointByGroup: Record<InspectorTagGroup, string> = {
        brand: "/api/brands",
        service: "/api/services",
        project: "/api/projects",
        persona: "/api/personas",
        branch: "/api/branches",
      };
      try {
        const res = await fetch(`${endpointByGroup[group]}${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            site_id: siteId,
            seed_source: seedSource,
            seed_recording_id: seedRecordingId,
            seed_asset_id: seedAssetId,
          }),
        });
        if (!res.ok) {
          console.warn(`${group} confirm HTTP ${res.status}`);
          return null;
        }
        const data = await res.json();
        // Response shape varies per endpoint — extract the entity defensively.
        const created = data.brand || data.service || data.project ||
          data.persona || data.branch || data;
        if (!created?.id) return null;
        return {
          id: created.id,
          name: created.name,
          slug: created.slug,
          url: created.url ?? null,
        };
      } catch (err) {
        console.warn(`${group} confirm failed:`, err);
        return null;
      }
    },

    async fetchCategories(assetId) {
      return fetch(`/api/assets/${assetId}/categories${query}`);
    },

    async cascadePreview(assetId, body) {
      return fetch(`/api/assets/${assetId}/categorize/preview${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    },

    async cascadeCommit(assetId, body) {
      return fetch(`/api/assets/${assetId}/categorize/commit${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}

/** Subscriber-session adapter — hits the session-authed /api/* routes. */
export const subscriberAssetAnalysisApi: AssetAnalysisApi = makeAnalysisApi("");

/**
 * Manager adapter — appends ?subscription_id so the operator's
 * request resolves to the subscriber's context (authenticateRequest Path 3).
 */
export function makeManageAnalysisApi(subscriptionId: string): AssetAnalysisApi {
  return makeAnalysisApi(`?subscription_id=${encodeURIComponent(subscriptionId)}`);
}
