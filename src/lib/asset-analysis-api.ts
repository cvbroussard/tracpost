import type { AssetAnalysisApi, InspectorTagGroup } from "@/hooks/use-asset-analysis";

/**
 * Subscriber-session data layer for asset analysis — hits the session-authed
 * /api/* routes. useAssetAnalysis takes this (or a sibling adapter) injected,
 * so the manager-side Media Production › Analysis surface can run the same
 * hook against the tp_admin /api/manage/* routes instead.
 */
export const subscriberAssetAnalysisApi: AssetAnalysisApi = {
  async suggestTags({ transcript, siteId, assetId }) {
    const res = await fetch("/api/auto-tag-suggest", {
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
      const res = await fetch(endpointByGroup[group], {
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
};
