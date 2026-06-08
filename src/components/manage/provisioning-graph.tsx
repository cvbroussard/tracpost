"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getPlatformByKey, type PlatformConfig } from "@/app/dashboard/integrations/platform-config";
import { BillingCard } from "@/app/admin/accounts/[id]/billing-card";
import { AccountGovernanceSection } from "@/components/manage/account-governance-section";
import { BusinessInfoForm } from "@/components/manage/business-info-form";

interface SubTask {
  sub_key: string;
  title: string;
  status: string;
}

interface Task {
  task_key: string;
  title: string;
  owner: string;
  depends_on: string[];
  status: string;
  milestone: string | null;
  step_label: string | null;
  completed_at: string | null;
  subTasks: SubTask[];
  subTotal: number;
  subComplete: number;
}

// ── Family taxonomy ─────────────────────────────────────────────────────────
// Each task_key maps to a family for color-coding. Families chunk the pipeline
// into visually-distinct phases.

type Family =
  | "infra"
  | "brand_observation"
  | "brand_strategic"
  | "brand_verbal"
  | "brand_visual"
  | "brand_sonic"
  | "brand_gate"
  | "connections"
  | "publishing"
  | "activation";

const TASK_FAMILY: Record<string, Family> = {
  checkout: "infra",
  business_info: "infra",

  brand_public_presence: "brand_observation",
  brand_cma: "brand_observation",
  brand_triage: "brand_observation",
  brand_readiness_findings: "brand_observation",
  brand_findings_resolved: "brand_observation",

  brand_strategic: "brand_strategic",
  brand_verbal: "brand_verbal",
  brand_visual: "brand_visual",
  brand_sonic: "brand_sonic",
  brand_identity_complete: "brand_gate",

  integrations: "connections",
  gbp_location: "connections",

  domain_provision: "infra",
  dns_config: "infra",
  search_console: "infra",

  first_upload: "publishing",
  first_content: "publishing",

  autopilot: "activation",
};

interface FamilyStyle {
  /** Tailwind classes for the card border + accent left bar */
  border: string;
  /** Tailwind classes for the card background */
  bg: string;
  /** Tailwind classes for the family tag label */
  tag: string;
  /** Human-readable family label (shown on first-of-family card) */
  label: string;
}

const FAMILY_STYLE: Record<Family, FamilyStyle> = {
  infra: {
    border: "border-slate-300 dark:border-slate-700",
    bg: "bg-slate-50 dark:bg-slate-900/30",
    tag: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    label: "Setup",
  },
  brand_observation: {
    border: "border-amber-300 dark:border-amber-700",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    tag: "bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300",
    label: "Brand observation",
  },
  brand_strategic: {
    border: "border-emerald-300 dark:border-emerald-700",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    tag: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300",
    label: "Strategic",
  },
  brand_verbal: {
    border: "border-blue-300 dark:border-blue-700",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    tag: "bg-blue-200 text-blue-800 dark:bg-blue-800/40 dark:text-blue-300",
    label: "Verbal",
  },
  brand_visual: {
    border: "border-violet-300 dark:border-violet-700",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    tag: "bg-violet-200 text-violet-800 dark:bg-violet-800/40 dark:text-violet-300",
    label: "Visual",
  },
  brand_sonic: {
    border: "border-teal-300 dark:border-teal-700",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    tag: "bg-teal-200 text-teal-800 dark:bg-teal-800/40 dark:text-teal-300",
    label: "Sonic",
  },
  brand_gate: {
    border: "border-slate-500 dark:border-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
    tag: "bg-slate-700 text-slate-100 dark:bg-slate-300 dark:text-slate-900",
    label: "Brand identity ready",
  },
  connections: {
    border: "border-orange-300 dark:border-orange-700",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    tag: "bg-orange-200 text-orange-800 dark:bg-orange-800/40 dark:text-orange-300",
    label: "Connections",
  },
  publishing: {
    border: "border-yellow-300 dark:border-yellow-700",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    tag: "bg-yellow-200 text-yellow-800 dark:bg-yellow-800/40 dark:text-yellow-300",
    label: "Publishing",
  },
  activation: {
    border: "border-green-400 dark:border-green-600",
    bg: "bg-green-50 dark:bg-green-900/20",
    tag: "bg-green-200 text-green-800 dark:bg-green-800/40 dark:text-green-300",
    label: "Activation",
  },
};

function familyOf(taskKey: string): Family {
  return TASK_FAMILY[taskKey] ?? "infra";
}

// ── Task actions (right-click context menu) ─────────────────────────────────

interface TaskAction {
  label: string;
  href?: string;
  action?: string;
  icon: string;
}

/**
 * Per-sub_task action map keyed by `${task_key}.${sub_key}`. Sub-task actions
 * render inline next to each sub_task row in the drawer.
 *
 * Per [[provisioning-drawer-console]] doctrine: actions migrate to JSONB on
 * `provisioning_sub_tasks.actions` once the shapes settle. For now they live
 * in code alongside TASK_ACTIONS.
 *
 * Platform OAuth endpoints (/api/auth/{platform}) are session-authed and
 * return a 302 to the platform's auth URL. Browser navigates, OAuth completes,
 * callback fires, user returns. The recompute on next /api/ops/provisioning
 * load marks the sub_task complete.
 */
const SUB_TASK_ACTIONS: Record<string, TaskAction[]> = {
  // integrations.{platform} — initiates the platform's OAuth flow via the
  // existing /api/auth/{platform} session-authed endpoint. The endpoint 302s
  // to the platform's OAuth authorization URL; browser navigates, OAuth
  // completes, callback fires, user returns. The recompute on next
  // /api/ops/provisioning load marks the sub_task complete.
  //
  // Instagram + Facebook share a single Meta endpoint (/api/auth/instagram)
  // because Meta OAuth covers both pages + IG accounts.
  "integrations.instagram": [
    { label: "Connect Instagram (Meta OAuth)", href: "/api/auth/instagram", icon: "▶" },
  ],
  "integrations.facebook": [
    { label: "Connect Facebook (Meta OAuth)", href: "/api/auth/instagram", icon: "▶" },
  ],
  "integrations.tiktok": [
    { label: "Connect TikTok", href: "/api/auth/tiktok", icon: "▶" },
  ],
  "integrations.youtube": [
    { label: "Connect YouTube", href: "/api/auth/youtube", icon: "▶" },
  ],
  "integrations.pinterest": [
    { label: "Connect Pinterest", href: "/api/auth/pinterest", icon: "▶" },
  ],
  "integrations.linkedin": [
    { label: "Connect LinkedIn", href: "/api/auth/linkedin", icon: "▶" },
  ],
  "integrations.twitter": [
    { label: "Connect X (Twitter)", href: "/api/auth/twitter", icon: "▶" },
  ],
  "integrations.gbp": [
    { label: "Connect Google Business", href: "/api/auth/google", icon: "▶" },
  ],

  // business_info.{sub_key} — for now, all sub_tasks deep-link to the
  // dashboard pages that hold the canonical edit form. Future iteration
  // can swap individual entries for inline editors per [[provisioning-drawer-console]].
  "business_info.basics": [
    { label: "Edit name, type, location", href: "/dashboard/business", icon: "→" },
  ],
  "business_info.commercial_tier": [
    { label: "Pick commercial tier", href: "/dashboard/business", icon: "→" },
  ],
  "business_info.contact": [
    { label: "Edit phone + email", href: "/dashboard/business", icon: "→" },
  ],
  "business_info.branding": [
    { label: "Upload logo + favicon", href: "/dashboard/business", icon: "→" },
  ],
  "business_info.web_identity": [
    { label: "Edit website + OG fields", href: "/dashboard/business", icon: "→" },
  ],
  "business_info.safeguard_faces": [
    { label: "Sign faces waiver", href: "/dashboard/business/content-safeguards", icon: "→" },
  ],
  "business_info.safeguard_minors": [
    { label: "Sign minor-face waiver", href: "/dashboard/business/content-safeguards", icon: "→" },
  ],
  "business_info.safeguard_identity": [
    { label: "Sign identity waiver", href: "/dashboard/business/content-safeguards", icon: "→" },
  ],
};

const TASK_ACTIONS: Record<string, TaskAction[]> = {
  checkout: [{ label: "View subscription", href: "/ops/billing", icon: "→" }],
  business_info: [{ label: "View site settings", href: "/ops/sites", icon: "→" }],

  brand_public_presence: [
    { label: "View observation", href: "/ops/brand-identity/observation", icon: "→" },
    { label: "Re-run analysis", action: "rerun_public_presence", icon: "⟳" },
  ],
  brand_cma: [
    { label: "Run Analysis", action: "rerun_cma", icon: "⟳" },
    { label: "View CMA", href: "/ops/competitive-analysis", icon: "→" },
  ],
  brand_triage: [{ label: "View brand identity", href: "/ops/brand-identity", icon: "→" }],
  brand_readiness_findings: [
    { label: "View findings", href: "/ops/brand-identity/readiness-findings", icon: "→" },
  ],
  brand_findings_resolved: [
    { label: "Resolve findings", href: "/ops/brand-identity/readiness-findings", icon: "→" },
  ],
  brand_strategic: [
    { label: "Edit strategic descriptors", href: "/ops/brand-identity", icon: "→" },
  ],
  brand_verbal: [
    { label: "Edit verbal descriptors", href: "/ops/brand-identity", icon: "→" },
  ],
  brand_visual: [
    { label: "Edit visual descriptors", href: "/ops/brand-identity", icon: "→" },
  ],
  brand_sonic: [
    { label: "Edit sonic descriptors", href: "/ops/brand-identity", icon: "→" },
  ],
  brand_identity_complete: [
    { label: "View brand identity", href: "/ops/brand-identity", icon: "→" },
  ],

  integrations: [
    { label: "Manage integrations", href: "/dashboard/integrations", icon: "→" },
    { label: "Send connection invite to tenant", action: "send_invite", icon: "✉" },
  ],
  gbp_location: [{ label: "Assign location", action: "gbp_assign", icon: "◎" }],
  domain_provision: [
    { label: "Manage domain", href: "/ops/website", icon: "→" },
    { label: "Provision domain", action: "provision_domain", icon: "◎" },
  ],
  dns_config: [
    { label: "Manage domain", href: "/ops/website", icon: "→" },
    { label: "Send DNS email to tenant", action: "send_dns_email", icon: "✉" },
  ],
  first_upload: [{ label: "View media", href: "/ops/media", icon: "→" }],
  first_content: [
    { label: "View pipeline", href: "/ops/pipeline", icon: "→" },
    { label: "Trigger generation", action: "trigger_generation", icon: "▶" },
  ],
  autopilot: [
    { label: "Manage autopilot", href: "/ops/autopilot", icon: "→" },
    { label: "Activate autopilot", action: "activate_autopilot", icon: "▶" },
  ],
  search_console: [
    { label: "View SEO", href: "/ops/seo", icon: "→" },
    { label: "Verify domain", action: "verify_gsc", icon: "✓" },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeDepths(tasks: Task[]): Map<string, number> {
  const taskMap = new Map(tasks.map((t) => [t.task_key, t]));
  const depths = new Map<string, number>();
  function depthOf(key: string): number {
    if (depths.has(key)) return depths.get(key)!;
    const task = taskMap.get(key);
    if (!task || task.depends_on.length === 0) {
      depths.set(key, 0);
      return 0;
    }
    const max = Math.max(...task.depends_on.map((d) => depthOf(d)));
    const d = max + 1;
    depths.set(key, d);
    return d;
  }
  for (const t of tasks) depthOf(t.task_key);
  return depths;
}

function statusBar(status: string, blocked: boolean): string {
  if (blocked) return "bg-red-500";
  if (status === "complete") return "bg-green-500";
  if (status === "in_progress") return "bg-blue-500";
  return "bg-slate-300 dark:bg-slate-600";
}

function statusLabel(status: string, blocked: boolean): string {
  if (blocked) return "blocked";
  return status;
}

/**
 * Strong outer ring/overlay treatment for terminal statuses (complete, blocked).
 * Family color stays as the bg/tint; the ring + checkmark badge call attention
 * to status state. In-progress and pending keep the neutral family-only look.
 */
function statusRingClass(status: string, blocked: boolean): string {
  if (blocked) return "ring-2 ring-red-500/70 shadow-red-200/50 dark:shadow-red-900/30";
  if (status === "complete") return "ring-2 ring-green-500/70 shadow-green-200/50 dark:shadow-green-900/30";
  return "";
}

function statusOverlayClass(status: string, blocked: boolean): string {
  if (blocked) return "bg-red-500/10 dark:bg-red-500/15";
  if (status === "complete") return "bg-green-500/10 dark:bg-green-500/15";
  return "";
}

// ── Task card component ─────────────────────────────────────────────────────

interface BlockerInfo {
  task_key: string;
  title: string;
  status: string;
}

function TaskCard({
  task,
  blocked,
  dependencies,
  expanded,
  isDomain,
  onClick,
  onContextMenu,
  onToggleExpand,
  onSubTaskClick,
}: {
  task: Task;
  blocked: boolean;
  /** All deps with their current status (regardless of complete/incomplete). */
  dependencies: BlockerInfo[];
  expanded: boolean;
  isDomain: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleExpand: () => void;
  /** Click a sub_task row in the expanded list → open drawer scoped to it. */
  onSubTaskClick: (subKey: string) => void;
}) {
  const family = familyOf(task.task_key);
  const style = FAMILY_STYLE[family];
  const bar = statusBar(task.status, blocked);
  const sLabel = statusLabel(task.status, blocked);
  const isComplete = task.status === "complete";
  const ring = statusRingClass(task.status, blocked);
  const overlay = statusOverlayClass(task.status, blocked);

  // Hover state is scoped to the status badge only (not the whole card).
  // Mouse-over the badge or the tooltip itself keeps it visible.
  const [tooltipHover, setTooltipHover] = useState(false);

  // Tooltip shows for any task that has dependencies, regardless of status.
  // Color cue inside the tooltip is per-dep (green check vs red dot).
  const showDependencyTooltip = dependencies.length > 0;
  // Per-dep status — drives row coloring inside the tooltip.
  const depPillColor = (status: string) => {
    if (status === "complete") return "text-green-600 dark:text-green-400";
    if (status === "in_progress") return "text-blue-600 dark:text-blue-400";
    return "text-red-600 dark:text-red-400";
  };
  const depDot = (status: string) => {
    if (status === "complete") return "bg-green-500";
    if (status === "in_progress") return "bg-blue-500";
    return "bg-slate-400 dark:bg-slate-500";
  };

  return (
    <div className="group relative w-56">
      <div
        className={`relative w-full rounded-lg border ${style.border} ${style.bg} shadow-sm overflow-hidden ${ring}`}
        onContextMenu={onContextMenu}
      >
      {/* Status accent bar (left edge) — bumped width for prominence */}
      <div className={`absolute inset-y-0 left-0 w-1.5 ${bar}`} />

      {/* Status overlay tint — applied for complete + blocked, makes status read instantly */}
      {overlay && <div className={`pointer-events-none absolute inset-0 ${overlay}`} />}

      <button
        type="button"
        onClick={onClick}
        className="relative z-[1] block w-full text-left px-3 py-2.5 pl-4 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${style.tag}`}>
            {task.step_label && <span className="opacity-70">{task.step_label}</span>}
            {style.label}
          </span>
          <span
            className={`text-[10px] font-medium ${showDependencyTooltip ? "cursor-help" : ""} ${isComplete ? "text-green-700 dark:text-green-400" : blocked ? "text-red-700 dark:text-red-400" : "text-muted"}`}
            onMouseEnter={() => showDependencyTooltip && setTooltipHover(true)}
            onMouseLeave={() => setTooltipHover(false)}
          >
            {sLabel}
          </span>
        </div>
        <p className="text-xs font-medium leading-tight text-foreground">{task.title}</p>
        {task.milestone && (
          <p className="mt-1 text-[10px] text-muted">→ {task.milestone}</p>
        )}
        {task.subTotal > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full ${isComplete ? "bg-green-500" : "bg-blue-500"} transition-all`}
                style={{ width: `${(task.subComplete / task.subTotal) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted shrink-0">
              {task.subComplete}/{task.subTotal}
            </span>
          </div>
        )}
        <span className="block mt-1 text-[9px] text-muted/70">
          {task.owner === "tenant" ? "owner: tenant" : "owner: platform"}
        </span>
      </button>

      {/* Domain expand toggle (only on domain rollup cards) */}
      {isDomain && task.subTotal > 0 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full px-3 py-1 text-[10px] text-muted border-t border-black/5 dark:border-white/5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] flex items-center justify-center gap-1"
        >
          <span>{expanded ? "Collapse" : "Show sub-tasks"}</span>
          <span className="text-[9px]">{expanded ? "▲" : "▼"}</span>
        </button>
      )}

      {/* Expanded sub-tasks panel — each row clickable to open drawer
          scoped to that sub_task (rich detail). Complete rows get a green
          checkmark + green text. The "Connect " verb prefix is stripped at
          render time because the surrounding sub_task title (stored as
          "Connect Instagram") is action-flavored — better to show the bare
          platform/descriptor name with the visual completion cue. */}
      {expanded && isDomain && task.subTasks.length > 0 && (
        <div className="px-3 py-2 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] space-y-0.5">
          {task.subTasks.map((st) => {
            const isSubComplete = st.status === "complete";
            const displayLabel = (st.title || st.sub_key).replace(/^Connect\s+/i, "");
            return (
              <button
                key={st.sub_key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSubTaskClick(st.sub_key);
                }}
                className="w-full flex items-center gap-2 text-[11px] rounded px-1.5 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
              >
                {isSubComplete ? (
                  <span className="inline-flex items-center justify-center w-3 h-3 shrink-0 text-green-600 dark:text-green-400 text-[11px] font-bold leading-none">
                    ✓
                  </span>
                ) : (
                  <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-slate-300 dark:bg-slate-600" />
                )}
                <span
                  className={`flex-1 ${
                    isSubComplete
                      ? "text-green-700 dark:text-green-400 font-medium"
                      : "text-muted"
                  }`}
                >
                  {displayLabel}
                </span>
                <span className="text-[9px] text-muted/70">→</span>
              </button>
            );
          })}
        </div>
      )}
      </div>

      {/* Dependency tooltip — appears on hover of the status badge only.
          Sits to the LEFT of the card, vertically aligned at top, so it
          doesn't push adjacent rows. Hovering the tooltip itself keeps it
          visible so the operator can move the mouse over to read it. */}
      {showDependencyTooltip && (
        <div
          className={`absolute top-0 w-56 z-20 transition-opacity duration-150 ${tooltipHover ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{ right: "calc(30%)" }}
          onMouseEnter={() => setTooltipHover(true)}
          onMouseLeave={() => setTooltipHover(false)}
        >
          <div className={`rounded-md border-2 ${blocked ? "border-red-500 dark:border-red-500" : "border-slate-500 dark:border-slate-400"} bg-white dark:bg-slate-900 shadow-xl px-3 py-2`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${blocked ? "text-red-700 dark:text-red-400" : "text-muted"}`}>
              {blocked ? "Blocked by:" : "Depends on:"}
            </p>
            <ul className="space-y-0.5">
              {dependencies.map((b) => (
                <li key={b.task_key} className="flex items-center gap-2 text-[10px]">
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${depDot(b.status)}`} />
                  <span className="font-medium text-foreground truncate flex-1">{b.title}</span>
                  <span className={`shrink-0 ${depPillColor(b.status)}`}>{b.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskDetailDrawer ────────────────────────────────────────────────────────
// Phase 1 of the drawer infrastructure per [[provisioning-drawer-design]] (TBD).
// Right-aside slide-in panel. Opens on card click; shows family + status +
// dependencies + sub-tasks + actions. Per-family content renderers come in
// Phase 2; this generic shape works for all tasks.

interface DepRow {
  task_key: string;
  title: string;
  status: string;
}

function TaskDetailDrawer({
  task,
  subTask,
  dependencies,
  blocked,
  isDomain,
  actions,
  subscriberId,
  businessId,
  onRefresh,
  runningAction,
  actionFeedback,
  onClose,
  onClearSubKey,
  onSelectSubKey,
  onNavigate,
  onAction,
  onStatusChange,
}: {
  task: Task | null;
  /** When set, drawer renders sub_task-scoped body (rich detail). */
  subTask: SubTask | null;
  dependencies: DepRow[];
  blocked: boolean;
  isDomain: boolean;
  actions: TaskAction[];
  /** billing_account_id for the current subscription — used by task-specific
   *  inline renderers that need to query subscription-scoped data (e.g.,
   *  the BillingCard for checkout). */
  subscriberId: string;
  /** business_id (siteId) for the active business — used by per-business
   *  inline editors (BusinessInfoForm for business_info, etc.). */
  businessId: string | null;
  /** Refetch the parent provisioning data after an inline edit so the
   *  pipeline status updates without page reload. */
  onRefresh: () => void;
  /** action_key currently running, or null. Drives Running… label + disable. */
  runningAction: string | null;
  /** Inline feedback after the last action completed, or null. */
  actionFeedback: { ok: boolean; message: string } | null;
  onClose: () => void;
  /** Clear sub_key (back to task scope). */
  onClearSubKey: () => void;
  /** Open the drawer scoped to a specific sub_task. */
  onSelectSubKey: (subKey: string) => void;
  onNavigate: (href: string) => void;
  onAction: (action: string) => void;
  onStatusChange: (status: string) => void;
}) {
  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && task) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const family = task ? familyOf(task.task_key) : "infra";
  const style = FAMILY_STYLE[family];
  const isComplete = task?.status === "complete";

  const statusTextClass = isComplete
    ? "text-green-700 dark:text-green-400"
    : blocked
      ? "text-red-700 dark:text-red-400"
      : "text-muted";

  const depDot = (status: string) => {
    if (status === "complete") return "bg-green-500";
    if (status === "in_progress") return "bg-blue-500";
    return "bg-slate-400 dark:bg-slate-500";
  };

  // Empty state — no task selected
  if (!task) {
    return (
      <div className="sticky top-4 rounded-xl border border-border bg-surface shadow-card flex items-center justify-center p-8 min-h-[200px]">
        <div className="text-center">
          <p className="text-xs text-muted leading-relaxed">
            Click any card in the pipeline to see its details, dependencies, and available actions here.
          </p>
        </div>
      </div>
    );
  }

  // ── Sub_task scope: rich detail for a selected sub_task ──
  // For integrations: render the per-platform coaching content (why, what we
  // do, prerequisites, resources) borrowed from the PlatformConfig catalog.
  if (subTask && task.task_key === "integrations") {
    const platform = getPlatformByKey(subTask.sub_key);
    const subAction = SUB_TASK_ACTIONS[`${task.task_key}.${subTask.sub_key}`]?.[0];
    const isSubComplete = subTask.status === "complete";

    return (
      <div className="sticky top-4 rounded-xl border border-border bg-surface shadow-card flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
        {/* Breadcrumb header */}
        <div className={`px-4 py-3 border-b ${style.border} ${style.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={onClearSubKey}
                className="text-[10px] text-muted hover:text-foreground inline-flex items-center gap-1 mb-1"
              >
                <span>← {task.title}</span>
              </button>
              <h2 className="text-base font-semibold text-foreground leading-tight">
                {platform?.label || subTask.title || subTask.sub_key}
              </h2>
              {platform && (
                <p className="mt-0.5 text-[11px] text-muted">{platform.accountType}</p>
              )}
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium ${
                    isSubComplete
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      isSubComplete ? "bg-green-500" : "bg-slate-400"
                    }`}
                  />
                  {isSubComplete ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-foreground text-lg leading-none shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {platform ? (
            <>
              {/* Why */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                  Why {platform.label}
                </h3>
                <p className="text-xs leading-relaxed text-foreground">{platform.why}</p>
              </section>

              {/* What TracPost does */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                  What TracPost does
                </h3>
                <ul className="space-y-1">
                  {platform.whatWeDoWithIt.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-green-600 dark:text-green-400 shrink-0 mt-0.5">✓</span>
                      <span className="text-foreground">{line}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Resources */}
              {platform.helpLinks.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Resources
                  </h3>
                  <ul className="space-y-1">
                    {platform.helpLinks.map((link, i) => (
                      <li key={i}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                        >
                          <span>→</span>
                          <span>{link.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Before you connect */}
              {platform.prerequisites.length > 0 && !isSubComplete && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Before you connect
                  </h3>
                  <ol className="space-y-1.5">
                    {platform.prerequisites.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-medium shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-foreground leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Connect action */}
              {!isSubComplete && subAction && (
                <section>
                  <button
                    type="button"
                    onClick={() => {
                      if (subAction.href) onNavigate(subAction.href);
                      else if (subAction.action) onAction(subAction.action);
                    }}
                    className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>{subAction.icon}</span>
                    <span>{subAction.label}</span>
                  </button>
                </section>
              )}

              {/* Phase 2 placeholders — Connected as / Token expires / Refresh / Disconnect.
                  Live connection metadata not yet plumbed; will land via API extension. */}
              {isSubComplete && (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Connection
                  </h3>
                  <p className="text-[11px] italic text-muted">
                    Live connection metadata (account name, token expiry, refresh/disconnect) is plumbed via
                    /dashboard/integrations/[platform] for now. Drawer-native rendering coming in Phase 2.
                  </p>
                </section>
              )}
            </>
          ) : (
            <p className="text-xs italic text-muted">
              No platform config found for sub_key &quot;{subTask.sub_key}&quot;.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-4 rounded-xl border border-border bg-surface shadow-card flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
      {(
        <>
          {/* Header */}
          <div className={`px-4 py-3 border-b ${style.border} ${style.bg} flex items-start justify-between gap-3`}>
            <div className="flex-1 min-w-0">
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${style.tag} mb-1.5`}>
                {task.step_label && <span className="opacity-70">{task.step_label}</span>}
                {style.label}
              </span>
              <h2 className="text-sm font-semibold text-foreground leading-tight">{task.title}</h2>
              {task.milestone && (
                <p className="mt-1 text-[11px] text-muted">→ {task.milestone}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-[11px] font-medium ${statusTextClass}`}>
                  {blocked ? "blocked" : task.status.replace("_", " ")}
                </span>
                <span className="text-[10px] text-muted">·</span>
                <span className="text-[10px] text-muted">owner: {task.owner}</span>
                {task.completed_at && (
                  <>
                    <span className="text-[10px] text-muted">·</span>
                    <span className="text-[10px] text-muted">
                      Completed{" "}
                      {new Date(task.completed_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-foreground text-lg leading-none shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Dependencies — always at the top for consistency across
                every task drawer, whether or not there's an inline body. */}
            {dependencies.length > 0 && (
              <section>
                <h3 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${blocked ? "text-red-700 dark:text-red-400" : "text-muted"}`}>
                  {blocked ? "Blocked by" : "Depends on"}
                </h3>
                <ul className="space-y-1">
                  {dependencies.map((d) => (
                    <li key={d.task_key} className="flex items-center gap-2 text-xs">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${depDot(d.status)}`} />
                      <span className="flex-1 text-foreground truncate">{d.title}</span>
                      <span className="text-[10px] text-muted shrink-0">{d.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Task-specific inline body — per the doctrine's inline_picker /
                view_detail action kinds, certain tasks render rich inline
                content directly in the drawer instead of clicking out. */}
            {task.task_key === "checkout" && (
              <>
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                    Subscription
                  </h3>
                  <BillingCard subscriptionId={subscriberId} />
                </section>
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                    Account governance
                  </h3>
                  <AccountGovernanceSection subscriptionId={subscriberId} />
                </section>
              </>
            )}

            {task.task_key === "business_info" && businessId && (
              <BusinessInfoForm businessId={businessId} onSaved={onRefresh} />
            )}

            {/* integrations task scope — coaching prompt pointing the operator
                to the card's auto-expanded sub_task list. The per-platform
                rich detail (coaching content + connect button + connection
                state) lives in the SUB_TASK scope drawer, opened by clicking
                a platform row in the card. */}
            {task.task_key === "integrations" && (
              <section className="rounded-md border border-dashed border-border bg-card/50 px-3 py-4 text-center">
                <p className="text-xs text-muted leading-relaxed">
                  Click one of the platforms listed at the bottom of the card to see more information about that connection.
                </p>
              </section>
            )}

            {/* Sub-tasks — rendered for tasks that don't have an inline body
                covering the sub_task status. Skipped for:
                - business_info (BusinessInfoForm IS the sub_task editor)
                - integrations (the card's auto-expanded list + per-platform
                  sub_task drawer scope IS the sub_task surface; rendering
                  the list here would duplicate the card affordance) */}
            {task.subTasks.length > 0 && task.task_key !== "business_info" && task.task_key !== "integrations" && (
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2 flex items-center justify-between">
                  <span>Sub-tasks</span>
                  <span className="font-mono text-muted/70">{task.subComplete}/{task.subTotal}</span>
                </h3>
                <ul className="space-y-2">
                  {task.subTasks.map((st) => {
                    const subActionKey = `${task.task_key}.${st.sub_key}`;
                    const subActions = SUB_TASK_ACTIONS[subActionKey] ?? [];
                    const isSubComplete = st.status === "complete";
                    return (
                      <li key={st.sub_key} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                              isSubComplete ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
                            }`}
                          />
                          <span className={`flex-1 ${isSubComplete ? "text-foreground" : "text-muted"}`}>
                            {st.title || st.sub_key}
                          </span>
                          <span className="text-[10px] text-muted shrink-0">{st.status}</span>
                        </div>
                        {subActions.length > 0 && !isSubComplete && (
                          <div className="mt-1 ml-4 space-y-1">
                            {subActions.map((a, i) => {
                              const isRunning = a.action !== undefined && a.action === runningAction;
                              const isDisabled = runningAction !== null && !isRunning;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  disabled={isRunning || isDisabled}
                                  onClick={() => {
                                    if (a.href) onNavigate(a.href);
                                    else if (a.action) onAction(a.action);
                                  }}
                                  className={`w-full text-left rounded border border-border bg-card px-2 py-1.5 text-[11px] transition-colors flex items-center gap-2 ${
                                    isRunning
                                      ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30 cursor-wait"
                                      : isDisabled
                                        ? "opacity-50 cursor-not-allowed"
                                        : "hover:bg-surface-hover hover:border-accent/40"
                                  }`}
                                >
                                  <span className="text-[11px] w-4 text-center shrink-0">
                                    {isRunning ? (
                                      <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                    ) : (
                                      a.icon
                                    )}
                                  </span>
                                  <span className="flex-1">{isRunning ? "Running…" : a.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Actions */}
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Actions</h3>
              {actions.length === 0 ? (
                <p className="text-[11px] italic text-muted">No actions defined for this task yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {actions.map((a, i) => {
                    const isRunning = a.action !== undefined && a.action === runningAction;
                    const isDisabled = runningAction !== null && !isRunning;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={isRunning || isDisabled}
                        onClick={() => {
                          if (a.href) onNavigate(a.href);
                          else if (a.action) onAction(a.action);
                        }}
                        className={`w-full text-left rounded border border-border bg-card px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                          isRunning
                            ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30 cursor-wait"
                            : isDisabled
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-surface-hover hover:border-accent/40"
                        }`}
                      >
                        <span className="text-[12px] w-5 text-center shrink-0">
                          {isRunning ? (
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                          ) : (
                            a.icon
                          )}
                        </span>
                        <span className="flex-1 font-medium">{isRunning ? "Running…" : a.label}</span>
                        <span className="text-[10px] text-muted shrink-0">{a.href ? "→" : "▶"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {actionFeedback && (
                <p
                  className={`mt-2 text-[10px] ${
                    actionFeedback.ok
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {actionFeedback.message}
                </p>
              )}
            </section>

            {/* Status override (operator) */}
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Set status manually</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {["pending", "in_progress", "complete", "blocked"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusChange(s)}
                    className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      task.status === s
                        ? "border-accent/60 bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </section>

            {/* Debug / dev info */}
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Task identifier</h3>
              <code className="block text-[10px] font-mono text-muted bg-surface-hover rounded px-2 py-1.5 break-all">
                {task.task_key}
              </code>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function ProvisioningGraph({ subscriberId, siteId }: { subscriberId: string; siteId: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ taskKey: string; x: number; y: number } | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  // task_key of the card whose detail drawer is open. null = drawer closed.
  const [drawerTaskKey, setDrawerTaskKey] = useState<string | null>(null);
  // sub_key of the sub_task within drawerTaskKey that the drawer is scoped to.
  // null = drawer shows TASK-level body; non-null = drawer shows SUB_TASK-level
  // body (rich detail). Setting drawerTaskKey alone shows task scope; setting
  // both shows sub_task scope. Resetting parent task clears sub_key too.
  const [drawerSubKey, setDrawerSubKey] = useState<string | null>(null);
  // The brand (businessId) the API resolved server-side. Threaded into drawer
  // actions so write-side API calls know which brand to act on.
  const [businessId, setBusinessId] = useState<string | null>(null);
  // The action_key currently running (e.g., "rerun_public_presence"), or null.
  // Drawer reads this prop to show "Running…" + disabled state on the button.
  const [runningAction, setRunningAction] = useState<string | null>(null);
  // Lightweight inline feedback after an action completes.
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ops/provisioning?subscriber_id=${subscriberId}&site_id=${siteId}`)
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((data) => {
        setTasks(data.tasks || []);
        setCompletedCount(data.completedCount || 0);
        setTotalCount(data.totalCount || 0);
        setBusinessId(data.businessId ?? null);
      })
      .finally(() => setLoading(false));
  }, [subscriberId, siteId]);

  const refreshTasks = useCallback(async () => {
    const res = await fetch(`/api/ops/provisioning?subscriber_id=${subscriberId}&site_id=${siteId}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
      setCompletedCount(data.completedCount);
      setTotalCount(data.totalCount);
      setBusinessId(data.businessId ?? null);
    }
  }, [subscriberId, siteId]);

  /**
   * Drawer action dispatcher. Each action key maps to a specific API call.
   * For Phase 1 of drawer write functionality, only `rerun_public_presence`
   * is wired; further actions land here as we expand.
   *
   * Per [[provisioning-drawer-design]] (TBD): keep the action map in code
   * for this iteration; migrate to JSONB once the action shapes settle.
   */
  const handleAction = useCallback(
    async (actionKey: string) => {
      if (!businessId) {
        setActionFeedback({ ok: false, message: "No active brand for this subscriber." });
        return;
      }
      setRunningAction(actionKey);
      setActionFeedback(null);
      try {
        if (actionKey === "rerun_public_presence") {
          const res = await fetch("/api/ops/brand-identity/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId: businessId, key: "aesthetic" }),
          });
          if (!res.ok) {
            const msg = await res.text().catch(() => "");
            throw new Error(msg || `HTTP ${res.status}`);
          }
          await refreshTasks();
          setActionFeedback({ ok: true, message: "Public Presence Analysis complete." });
        } else if (actionKey === "rerun_cma") {
          // CMA fires off async — endpoint returns immediately with
          // status='running' and the 15-20 SerpAPI queries + ranking
          // extraction (~30-90s) continue via Vercel waitUntil. We
          // start a poll loop against the GET endpoint so the button's
          // Running… state holds until the pipeline actually completes
          // (or fails / times out), then we refresh tasks automatically.
          const res = await fetch(`/api/admin/competitive-analysis/${businessId}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            const msg = await res.text().catch(() => "");
            throw new Error(msg || `HTTP ${res.status}`);
          }
          setActionFeedback({ ok: true, message: "Pipeline started — polling for completion…" });

          // Poll every 3s, cap at 3 minutes. Pipeline normally finishes
          // in 30-90s; the cap is the safety net.
          const startedAt = Date.now();
          const maxMs = 3 * 60 * 1000;
          let finalStatus: "complete" | "failed" | "timeout" | null = null;
          let errorMessage: string | null = null;

          while (Date.now() - startedAt < maxMs) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const probe = await fetch(`/api/admin/competitive-analysis/${businessId}`);
              if (!probe.ok) continue;
              const data = await probe.json();
              const status = data?.analysis?.status as string | undefined;
              if (status === "complete") {
                finalStatus = "complete";
                break;
              }
              if (status === "failed") {
                finalStatus = "failed";
                errorMessage = (data?.analysis?.errorMessage as string) || "Pipeline reported failed";
                break;
              }
              // Still running — update progress indicator with elapsed time
              const elapsed = Math.round((Date.now() - startedAt) / 1000);
              setActionFeedback({ ok: true, message: `Pipeline running… ${elapsed}s elapsed` });
            } catch {
              // Network blip — keep polling
            }
          }
          if (!finalStatus) finalStatus = "timeout";

          await refreshTasks();
          if (finalStatus === "complete") {
            setActionFeedback({ ok: true, message: "✓ CMA pipeline complete." });
          } else if (finalStatus === "failed") {
            setActionFeedback({ ok: false, message: `CMA failed: ${errorMessage}` });
          } else {
            setActionFeedback({
              ok: false,
              message: "Polling timed out after 3 min. Pipeline may still complete; refresh in a minute.",
            });
          }
        } else {
          // Unknown action key — log for visibility; ignored otherwise.
          console.log(`Action ${actionKey} for task — no handler wired yet`);
          setActionFeedback({ ok: false, message: `Action "${actionKey}" not wired yet.` });
        }
      } catch (e) {
        setActionFeedback({
          ok: false,
          message: `Failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setRunningAction(null);
      }
    },
    [businessId, refreshTasks],
  );

  async function updateStatus(taskKey: string, status: string) {
    await fetch("/api/ops/provisioning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_id: subscriberId, task_key: taskKey, status }),
    });
    await refreshTasks();
  }

  function handleContextAction(taskKey: string, action: TaskAction) {
    setContextMenu(null);
    if (action.href) router.push(action.href);
    if (action.action) console.log(`Action: ${action.action} for task ${taskKey}`);
  }

  function toggleExpand(taskKey: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(taskKey)) next.delete(taskKey);
      else next.add(taskKey);
      return next;
    });
  }

  function onTaskClick(task: Task) {
    // Click opens the side drawer (working surface). Right-click still
    // surfaces the quick context menu. Per [[provisioning-drawer-console]]
    // the drawer is the primary working surface for both operators and
    // subscribers. Opening a task always resets sub_key to null (task scope).
    setDrawerTaskKey(task.task_key);
    setDrawerSubKey(null);
    // For integrations, auto-expand the card's sub_task list so the
    // platform rows are immediately visible — the drawer task-scope
    // body is a coaching prompt pointing here, so we need the list
    // showing for the prompt to make sense.
    if (task.task_key === "integrations") {
      setExpandedDomains((prev) => {
        if (prev.has(task.task_key)) return prev;
        const next = new Set(prev);
        next.add(task.task_key);
        return next;
      });
    }
  }

  function onSubTaskClick(parentTaskKey: string, subKey: string) {
    // Open the drawer scoped to a specific sub_task within a parent task.
    // Used for rich per-platform integration content + (future) per-descriptor
    // catalog detail.
    setDrawerTaskKey(parentTaskKey);
    setDrawerSubKey(subKey);
  }

  function closeDrawer() {
    setDrawerTaskKey(null);
    setDrawerSubKey(null);
  }

  // Find the currently-open task for the drawer, or null if closed.
  const drawerTask = drawerTaskKey ? tasks.find((t) => t.task_key === drawerTaskKey) ?? null : null;
  // The sub_task object, if drawer is sub_task-scoped.
  const drawerSubTask = drawerTask && drawerSubKey
    ? drawerTask.subTasks.find((st) => st.sub_key === drawerSubKey) ?? null
    : null;

  // ── Layout: group tasks by depth, render rows top-to-bottom ──
  const depthRows = useMemo(() => {
    if (tasks.length === 0) return [] as Array<[number, Task[]]>;
    const depths = computeDepths(tasks);
    const byDepth = new Map<number, Task[]>();
    for (const t of tasks) {
      const d = depths.get(t.task_key) ?? 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(t);
    }
    // Sort tasks within each depth by sort_order (preserves logical sequence
    // for parallel siblings). We pull sort_order from step_label since the
    // task data has it as a string copy.
    for (const arr of byDepth.values()) {
      arr.sort((a, b) => {
        const sa = parseInt(a.step_label ?? "0", 10);
        const sb = parseInt(b.step_label ?? "0", 10);
        return sa - sb;
      });
    }
    return Array.from(byDepth.entries()).sort(([a], [b]) => a - b);
  }, [tasks]);

  const dependenciesOf = useCallback(
    (task: Task): BlockerInfo[] => {
      return task.depends_on
        .map((dep) => tasks.find((t) => t.task_key === dep))
        .filter((t): t is Task => t !== undefined)
        .map((t) => ({ task_key: t.task_key, title: t.title, status: t.status }));
    },
    [tasks],
  );
  const isBlocked = useCallback(
    (task: Task) =>
      task.status === "pending" &&
      dependenciesOf(task).some((d) => d.status !== "complete"),
    [dependenciesOf],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const families: Family[] = [
    "infra",
    "brand_observation",
    "brand_strategic",
    "brand_verbal",
    "brand_visual",
    "brand_sonic",
    "brand_gate",
    "connections",
    "publishing",
    "activation",
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Progress + legend */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Provisioning Pipeline</h3>
          <span className="text-xs text-muted">
            {completedCount}/{totalCount} · {progressPct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {families.map((f) => {
            const s = FAMILY_STYLE[f];
            return (
              <span
                key={f}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${s.tag}`}
              >
                {s.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Pipeline + drawer — horizontal split. Pipeline takes the remaining
          width; drawer is a fixed-width sidekick on the right that stays
          stuck to the top of the main scroll container as the user scrolls. */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-border bg-surface shadow-card p-6">
            <div className="space-y-4">
              {depthRows.map(([depth, tasksAtDepth]) => (
            <div key={depth} className="relative">
              {/* Depth label */}
              <div className="absolute left-0 top-2 text-[9px] text-muted/40 font-mono select-none pointer-events-none">
                {depth}
              </div>
              <div className="flex gap-3 justify-center flex-wrap items-start pl-6">
                {tasksAtDepth.map((task) => {
                  const isDomain = [
                    "brand_strategic",
                    "brand_verbal",
                    "brand_visual",
                    "brand_sonic",
                    "integrations",
                    "business_info",
                  ].includes(task.task_key);
                  return (
                    <TaskCard
                      key={task.task_key}
                      task={task}
                      blocked={isBlocked(task)}
                      dependencies={dependenciesOf(task)}
                      expanded={expandedDomains.has(task.task_key)}
                      isDomain={isDomain}
                      onClick={() => onTaskClick(task)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ taskKey: task.task_key, x: e.clientX, y: e.clientY });
                      }}
                      onToggleExpand={() => toggleExpand(task.task_key)}
                      onSubTaskClick={(subKey) => onSubTaskClick(task.task_key, subKey)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
            </div>
          </div>
        </div>

        {/* Drawer column — sticky right-aside that stays in view as pipeline scrolls.
            Width locked at 400px regardless of selected/empty state. */}
        <div className="shrink-0 grow-0" style={{ width: 400, minWidth: 400, maxWidth: 400 }}>
          <TaskDetailDrawer
            task={drawerTask}
            subTask={drawerSubTask}
            dependencies={drawerTask ? dependenciesOf(drawerTask) : []}
            blocked={drawerTask ? isBlocked(drawerTask) : false}
            isDomain={drawerTask ? [
              "brand_strategic",
              "brand_verbal",
              "brand_visual",
              "brand_sonic",
              "integrations",
              "business_info",
            ].includes(drawerTask.task_key) : false}
            actions={drawerTask ? TASK_ACTIONS[drawerTask.task_key] || [] : []}
            subscriberId={subscriberId}
            businessId={businessId}
            onRefresh={refreshTasks}
            runningAction={runningAction}
            actionFeedback={actionFeedback}
            onClose={closeDrawer}
            onClearSubKey={() => setDrawerSubKey(null)}
            onSelectSubKey={(subKey) => setDrawerSubKey(subKey)}
            onNavigate={(href) => router.push(href)}
            onAction={(action) => void handleAction(action)}
            onStatusChange={(status) => {
              if (drawerTaskKey) void updateStatus(drawerTaskKey, status);
            }}
          />
        </div>
      </div>

      {/* Context menu */}
      {contextMenu &&
        (() => {
          const task = tasks.find((t) => t.task_key === contextMenu.taskKey);
          if (!task) return null;
          const actions = TASK_ACTIONS[task.task_key] || [];
          const isComplete = task.status === "complete";

          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
              <div
                className="fixed z-50 w-56 rounded-lg border border-border bg-surface shadow-lg py-1"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <div className="px-3 py-1.5 border-b border-border">
                  <p className="text-[10px] font-medium">{task.step_label}. {task.title}</p>
                  {task.milestone && <p className="text-[9px] text-muted">→ {task.milestone}</p>}
                </div>
                {actions.length === 0 && (
                  <div className="px-3 py-2 text-[10px] italic text-muted">No actions available.</div>
                )}
                {actions.map((action, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover flex items-center gap-2"
                    onClick={() => handleContextAction(task.task_key, action)}
                  >
                    <span className="text-[10px] w-4 text-center">{action.icon}</span>
                    <span className="flex-1">{action.label}</span>
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <div className="px-3 py-1 text-[9px] text-muted">Set status:</div>
                {["pending", "in_progress", "complete", "blocked"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`w-full text-left px-3 py-1 text-[11px] hover:bg-surface-hover flex items-center gap-2 ${
                      task.status === s ? "text-accent font-medium" : ""
                    }`}
                    onClick={() => {
                      setContextMenu(null);
                      void updateStatus(task.task_key, s);
                    }}
                  >
                    <span className="text-[10px] w-4 text-center">{task.status === s ? "•" : " "}</span>
                    <span className="flex-1">{s.replace("_", " ")}</span>
                  </button>
                ))}
                {isComplete && (
                  <div className="px-3 py-1.5 text-[9px] text-muted border-t border-border">
                    Completed{" "}
                    {task.completed_at
                      ? new Date(task.completed_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </div>
                )}
              </div>
            </>
          );
        })()}

    </div>
  );
}
