/**
 * Operator-facing per-platform connection status for step 13
 * (integrations) in the provisioning drawer.
 *
 * Replaces the on-card expand/collapse list of 8 platform sub_tasks with
 * a drawer-side observability view. Per the 2026-06-11 audit:
 *
 *   - Operator is purely an observer for integrations — they don't
 *     authorize OAuth (only the tenant can, in the tenant's session).
 *   - The card's parent status is driven by GBP only (it's the sole
 *     integration that feeds brand identity via brand_categorization).
 *     The other 7 gate downstream publishing/orchestration, not
 *     provisioning, so they don't gate the card.
 *   - But the operator still benefits from seeing per-platform state for
 *     visibility. This component is that surface.
 *
 * Per the drawer doctrine ([[provisioning-drawer-console]]): heavy
 * editing surfaces hold a deep-link. The actual OAuth flow lives at
 * /dashboard/integrations (tenant) and is unchanged. This drawer reads
 * the same data (provisioning_sub_tasks rows already populated by the
 * recompute layer) for display.
 *
 * Sub_task rows are clickable → opens the existing platform-scoped
 * sub_task drawer with its PlatformConfig coaching content, preserving
 * the deep-dive affordance.
 */
"use client";

interface SubTaskInfo {
  sub_key: string;
  status: string;
}

const PLATFORM_ORDER = [
  "gbp",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "twitter",
] as const;

const PLATFORM_LABEL: Record<string, string> = {
  gbp: "Google Business",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
};

const PLATFORM_GATING: Record<string, "brand_identity" | "publishing"> = {
  gbp: "brand_identity",
  instagram: "publishing",
  facebook: "publishing",
  tiktok: "publishing",
  youtube: "publishing",
  pinterest: "publishing",
  linkedin: "publishing",
  twitter: "publishing",
};

export function IntegrationsStatusSummary({
  subTasks,
  onSubTaskClick,
}: {
  subTasks: SubTaskInfo[];
  /** Click a row → open the existing platform-scoped sub_task drawer
   *  (coaching content, no operator OAuth button per the audit). */
  onSubTaskClick: (subKey: string) => void;
}) {
  const byKey = new Map(subTasks.map((s) => [s.sub_key, s]));
  const connectedCount = subTasks.filter((s) => s.status === "complete").length;
  const totalCount = subTasks.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-md border border-border bg-card/40 px-3 py-2 text-[11px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Connected platforms</span>
          <span className="text-foreground font-mono">
            {connectedCount} / {totalCount}
          </span>
        </div>
        <p className="text-[10px] text-muted/80 mt-1 leading-snug">
          Only Google Business gates this card — it&apos;s the integration that
          feeds brand identity. The other 7 enable downstream publishing.
        </p>
      </div>

      {/* Platform list */}
      <div className="space-y-1">
        {PLATFORM_ORDER.map((key) => {
          const sub = byKey.get(key);
          const isConnected = sub?.status === "complete";
          const isGating = PLATFORM_GATING[key] === "brand_identity";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSubTaskClick(key)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-card/30 hover:bg-card/60 transition-colors"
            >
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                  isConnected ? "bg-green-500" : "bg-slate-400 dark:bg-slate-500"
                }`}
              />
              <span className="flex-1 text-xs text-foreground">
                {PLATFORM_LABEL[key]}
              </span>
              {isGating && (
                <span className="text-[9px] text-accent uppercase tracking-wide font-medium shrink-0">
                  gates card
                </span>
              )}
              <span
                className={`text-[10px] font-mono shrink-0 ${
                  isConnected
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted"
                }`}
              >
                {isConnected ? "connected" : "not connected"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
