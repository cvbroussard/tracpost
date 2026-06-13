"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ManagePage } from "@/components/manage/manage-page";
import type { InfraCard, InfraSubTask } from "@/lib/infrastructure/status";

interface InfrastructureApiResponse {
  businessId: string | null;
  cards: InfraCard[];
  totals: { complete: number; total: number };
}

function InfrastructurePipeline({
  subscriberId,
  siteId,
}: {
  subscriberId: string;
  siteId: string;
}) {
  const [data, setData] = useState<InfrastructureApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/ops/infrastructure?subscriber_id=${subscriberId}&site_id=${siteId}`,
      );
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [subscriberId, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!data?.businessId) {
    return (
      <div className="p-6">
        <p className="text-xs text-muted">Select a site to view its Infrastructure status.</p>
      </div>
    );
  }

  const drawerCard = data.cards.find((c) => c.key === drawerKey) ?? null;
  const overallPct =
    data.totals.total > 0 ? Math.round((data.totals.complete / data.totals.total) * 100) : 0;

  return (
    <div
      className="p-4 flex flex-col space-y-4 overflow-hidden"
      style={{ height: "calc(100vh - 6.5rem)" }}
    >
      {/* Progress header */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card shrink-0">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-medium">Infrastructure Pipeline</h3>
          <span className="text-xs text-muted">
            {data.totals.complete}/{data.totals.total} · {overallPct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Two-column layout — mirrors the Branding pipeline's working
          pattern: items-start + explicit h-full on each column so the
          drawer footer stays pinned at the bottom of the column. */}
      <div className="flex gap-4 items-start flex-1 min-h-0">
        {/* Card grid (scrollable) */}
        <div className="flex-1 min-w-0 h-full overflow-y-auto pr-1">
          <div className="rounded-xl border border-border bg-surface shadow-card p-6">
            <div className="grid grid-cols-2 gap-3">
              {data.cards.map((card) => (
                <CardTile
                  key={card.key}
                  card={card}
                  selected={drawerKey === card.key}
                  onClick={() => setDrawerKey(drawerKey === card.key ? null : card.key)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Drawer column — no h-full on the wrapper. The drawer inside
            sizes to its content; the body's flex-1 + overflow-y-auto
            still allows the sub_task list to scroll internally if it
            grows tall enough to exceed the column's available space. */}
        <div
          className="shrink-0 grow-0"
          style={{ width: 400, minWidth: 400, maxWidth: 400 }}
        >
          <CardDrawer card={drawerCard} onClose={() => setDrawerKey(null)} />
        </div>
      </div>
    </div>
  );
}

function CardTile({
  card,
  selected,
  onClick,
}: {
  card: InfraCard;
  selected: boolean;
  onClick: () => void;
}) {
  const isComplete = card.status === "complete";
  const borderClass = selected
    ? "border-accent"
    : "border-slate-300 dark:border-slate-700";
  const completeRing = isComplete
    ? "ring-2 ring-green-500/70 shadow-green-200/50 dark:shadow-green-900/30"
    : "";
  const barClass = isComplete ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600";
  const overlayClass = isComplete ? "bg-green-500/10 dark:bg-green-500/15" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-[2px] border ${borderClass} bg-surface shadow-sm overflow-hidden transition-shadow ${completeRing} hover:shadow-md`}
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${barClass}`} />
      {overlayClass && <div className={`pointer-events-none absolute inset-0 ${overlayClass}`} />}
      <div className="relative px-4 py-3 pl-5">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h4 className="text-xs font-medium">{card.title}</h4>
          <span
            className={`text-[10px] font-mono ${
              isComplete ? "text-green-700 dark:text-green-400" : "text-muted"
            }`}
          >
            {card.completeCount}/{card.totalCount}
          </span>
        </div>
        {card.totalCount > 0 && (
          <div className="h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full ${isComplete ? "bg-green-500" : "bg-blue-500"} transition-all`}
              style={{ width: `${(card.completeCount / card.totalCount) * 100}%` }}
            />
          </div>
        )}
      </div>
    </button>
  );
}

function CardDrawer({ card, onClose }: { card: InfraCard | null; onClose: () => void }) {
  if (!card) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-card flex items-center justify-center p-8 h-full">
        <p className="text-center text-xs text-muted leading-relaxed">
          Click any card to inspect its sub-tasks and jump to the working surface.
        </p>
      </div>
    );
  }

  const isComplete = card.status === "complete";

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{card.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
            <span
              className={
                isComplete ? "text-green-700 dark:text-green-400 font-medium" : "text-muted"
              }
            >
              {card.completeCount} / {card.totalCount} complete
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {card.key === "gbp" ? (
          <GbpReadinessGlance card={card} />
        ) : (
          <SubTaskList subTasks={card.subTasks} />
        )}
      </div>

      {/* Footer: click-out */}
      <div className="border-t border-border px-4 py-3">
        <Link
          href={card.href}
          className="block w-full rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-center text-[11px] font-medium text-foreground hover:bg-accent/20 transition-colors"
        >
          Open {card.title} →
        </Link>
      </div>
    </div>
  );
}

function GbpReadinessGlance({ card }: { card: InfraCard }) {
  const pending = card.subTasks.filter((s) => s.status !== "complete" && s.status !== "not_applicable");
  const isComplete = card.status === "complete";
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted leading-relaxed">
        Owner-declared profile fields. The Infrastructure drawer reports
        readiness only — field-level review lives on the GBP detail page.
      </p>
      {isComplete ? (
        <div className="rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 px-3 py-2">
          <div className="text-xs font-medium text-green-800 dark:text-green-300">
            All tracked fields declared.
          </div>
        </div>
      ) : (
        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 space-y-1">
          <div className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {pending.length} field{pending.length === 1 ? "" : "s"} awaiting owner
          </div>
          <ul className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed list-disc pl-4">
            {pending.map((p) => (
              <li key={p.key}>{p.label}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
        If a declared field looks malformed or off-brand, coach the owner — operator does not edit.
      </p>
    </div>
  );
}

function SubTaskList({ subTasks }: { subTasks: InfraSubTask[] }) {
  return (
    <div className="space-y-1.5">
      {subTasks.map((s) => (
        <SubTaskRow key={s.key} subTask={s} />
      ))}
    </div>
  );
}

function SubTaskRow({ subTask }: { subTask: InfraSubTask }) {
  const isComplete = subTask.status === "complete";
  const isNA = subTask.status === "not_applicable";
  const dot = isComplete
    ? "bg-green-500"
    : isNA
      ? "bg-slate-400 dark:bg-slate-500"
      : "bg-slate-300 dark:bg-slate-600";
  return (
    <div className="flex items-start gap-2 text-xs px-2 py-1.5 rounded border border-border bg-card/30">
      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className={isComplete ? "text-foreground" : "text-muted"}>{subTask.label}</p>
        {subTask.detail && (
          <p className="mt-0.5 text-[10px] text-muted truncate">{subTask.detail}</p>
        )}
      </div>
      <span
        className={`text-[10px] font-mono shrink-0 ${
          isComplete ? "text-green-700 dark:text-green-400" : "text-muted"
        }`}
      >
        {isComplete ? "complete" : isNA ? "n/a" : "pending"}
      </span>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Infrastructure Pipeline" requireSite>
      {({ subscriberId, siteId }) => (
        <InfrastructurePipeline subscriberId={subscriberId} siteId={siteId} />
      )}
    </ManagePage>
  );
}
