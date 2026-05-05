"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import { PLATFORMS } from "./platform-config";

interface PlatformStatus {
  status: "connected" | "pending_assignment" | "not_connected";
  accountName: string | null;
  tokenExpiresAt: string | null;
  availableAssets?: number;
}

function usePrefix() {
  const isSubdomain = typeof window !== "undefined" && window.location.hostname === "studio.tracpost.com";
  return isSubdomain ? "" : "/dashboard";
}

function TileBody({
  platform,
  status,
  state,
  tokenUrgent,
  daysLeft,
  dotColor,
}: {
  platform: (typeof PLATFORMS)[number];
  status: PlatformStatus | undefined;
  state: "connected" | "pending_assignment" | "not_connected";
  tokenUrgent: boolean;
  daysLeft: number | null;
  dotColor: string;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-background shrink-0">
          <PlatformIcon platform={platform.key} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{platform.label}</h3>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          </div>
          {state === "connected" && status ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] text-success truncate">{status.accountName}</p>
              {tokenUrgent && (
                <p className="text-[10px] text-danger">Token expires in {daysLeft}d</p>
              )}
            </div>
          ) : state === "pending_assignment" ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] text-warning">Pending assignment</p>
              {status?.availableAssets && (
                <p className="text-[10px] text-muted">{status.availableAssets} asset{status.availableAssets !== 1 ? "s" : ""} available</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-muted">
              {platform.oauthReady ? "Not connected" : "Coming soon"}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-[10px] text-muted leading-relaxed line-clamp-2">
        {platform.why.split(".")[0]}.
      </p>
    </>
  );
}

export function ConnectionsOverview({
  statuses,
  hasNoSites = false,
  isEnterprise = false,
}: {
  statuses: Record<string, PlatformStatus>;
  hasNoSites?: boolean;
  isEnterprise?: boolean;
}) {
  const prefix = usePrefix();

  // Filter the legacy 'meta' combined-app entry; partition into two groups
  // by category. Ads-category platforms are gated to enterprise tier per
  // the brand-positioning rule (paid ads features invisible to mid-tier).
  const allVisible = PLATFORMS.filter((p) => p.key !== "meta");
  const publishingPlatforms = allVisible.filter((p) => (p.category ?? "publishing") === "publishing");
  const adsPlatforms = allVisible.filter((p) => p.category === "ads");

  const publishingConnected = publishingPlatforms.filter(
    (p) => statuses[p.key]?.status === "connected",
  ).length;
  const publishingPending = publishingPlatforms.filter(
    (p) => statuses[p.key]?.status === "pending_assignment",
  ).length;
  const adsConnected = adsPlatforms.filter(
    (p) => statuses[p.key]?.status === "connected",
  ).length;

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Integrations</h1>
        <p className="text-sm text-muted">
          {publishingConnected} of {publishingPlatforms.length} publishing platforms connected
          {publishingPending > 0 && ` · ${publishingPending} pending assignment`}
          {isEnterprise && ` · ${adsConnected} of ${adsPlatforms.length} ad accounts connected`}
        </p>
      </div>

      {hasNoSites && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h2 className="text-sm font-medium mb-1">Create your first business to enable integrations</h2>
          <p className="text-xs text-muted leading-relaxed">
            A business is where TracPost publishes your content — every integration links to a business. Create one first, then come back here to connect Facebook, Instagram, Google, and the rest.
          </p>
          <Link
            href={`${prefix}/entities`}
            className="mt-3 inline-flex items-center text-xs font-medium text-accent hover:underline"
          >
            Create a business →
          </Link>
        </div>
      )}

      {/* Publishing integrations — all tiers see this section */}
      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Publishing
          </h2>
          <span className="text-[10px] text-muted">organic reach to your audience</span>
        </div>
        <PlatformGrid
          platforms={publishingPlatforms}
          statuses={statuses}
          hasNoSites={hasNoSites}
          prefix={prefix}
        />
      </section>

      {/* Ads integrations — enterprise tier only */}
      {isEnterprise && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Ad accounts
            </h2>
            <span className="text-[10px] text-muted">paid amplification beyond your followers</span>
          </div>
          <PlatformGrid
            platforms={adsPlatforms}
            statuses={statuses}
            hasNoSites={hasNoSites}
            prefix={prefix}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Shared tile-grid renderer used by both the Publishing and Ads sections.
 * Uses the same tile chrome for both — the platform's `category` field
 * carries the meaning, the visual primitive is consistent.
 *
 * Future refactor (task #95): extract this into a DashboardTile primitive
 * with density variants + standardize the radius from rounded-xl to
 * rounded (4px) platform-wide.
 */
function PlatformGrid({
  platforms,
  statuses,
  hasNoSites,
  prefix,
}: {
  platforms: typeof PLATFORMS;
  statuses: Record<string, PlatformStatus>;
  hasNoSites: boolean;
  prefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {platforms.map((platform) => {
        const status = statuses[platform.key];
        const state = status?.status || "not_connected";
        const tokenExpires = status?.tokenExpiresAt ? new Date(status.tokenExpiresAt) : null;
        const daysLeft = tokenExpires ? Math.ceil((tokenExpires.getTime() - Date.now()) / 86400000) : null;
        const tokenUrgent = daysLeft !== null && daysLeft < 7;
        const targetSlug = platform.hubTargetSlug || platform.slug;

        const dotColor =
          state === "connected" ? "bg-success" :
          state === "pending_assignment" ? "bg-warning" :
          "bg-border";

        const tileBase = "group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors";
        const tileInteractive = "hover:border-accent/30";
        const tileDisabled = "opacity-50 cursor-not-allowed pointer-events-none";

        if (hasNoSites) {
          return (
            <div
              key={platform.key}
              aria-disabled="true"
              className={`${tileBase} ${tileDisabled}`}
            >
              <TileBody
                platform={platform}
                status={status}
                state={state}
                tokenUrgent={tokenUrgent}
                daysLeft={daysLeft}
                dotColor={dotColor}
              />
            </div>
          );
        }

        return (
          <Link
            key={platform.key}
            href={`${prefix}/accounts/${targetSlug}`}
            className={`${tileBase} ${tileInteractive}`}
          >
            <TileBody
              platform={platform}
              status={status}
              state={state}
              tokenUrgent={tokenUrgent}
              daysLeft={daysLeft}
              dotColor={dotColor}
            />
          </Link>
        );
      })}
    </div>
  );
}
