/**
 * Read-only display of the owner-declared GBP profile fields for the
 * provisioning drawer's gbp_location scope (step 14).
 *
 * Per doctrine: operator OBSERVES; subscriber DECLARES at
 * /dashboard/google/profile. No edits in the operator drawer.
 *
 * Renders 5 sections matching the 5 sub_tasks:
 *   1. Service Areas (up to 20)
 *   2. Hours (per-day)
 *   3. Address (with show-on-Google toggle state)
 *   4. Description (owner-typed, 750 char limit)
 *   5. Social Profile URLs (GBP display links)
 *
 * Sync state ribbon at top if local changes are queued for push.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { GbpCategoriesDisplay } from "@/components/manage/gbp-categories-display";

interface ServiceArea {
  placeId: string;
  placeName: string;
  kind: string;
}

/** Service area granularity precedence — lower = broader, sorts first.
 *  Mirrors the subscriber-side ordering on /dashboard/google/profile. */
const KIND_PRECEDENCE: Record<string, number> = {
  region: 0,
  state: 1,
  metro: 2,
  county: 3,
  city: 4,
  zip: 5,
  neighborhood: 6,
};

function kindBadgeClass(kind: string | undefined): string {
  switch (kind) {
    case "region":
    case "state":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "metro":
    case "county":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "city":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30";
    case "zip":
    case "neighborhood":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    default:
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";
  }
}

interface AddressShape {
  addressLines: string[];
  locality: string | null;
  administrativeArea: string | null;
  postalCode: string | null;
}

interface HourEntry {
  day: string;
  openTime: string;
  closeTime: string;
}

interface SocialProfile {
  channel: string;
  channelLabel: string;
  uri: string;
}

interface GbpDeclarationsResponse {
  serviceAreas: ServiceArea[];
  serviceAreaCap: number;
  showAddress: boolean;
  address: AddressShape;
  hours: HourEntry[];
  description: string | null;
  socialProfiles: SocialProfile[];
  sync: {
    dirty: boolean;
    dirtyFields: string[];
    syncedAt: string | null;
  };
}

const DAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

export function GbpDeclarationsDisplay({ businessId }: { businessId: string }) {
  const [data, setData] = useState<GbpDeclarationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}/gbp-declarations`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as GbpDeclarationsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Loading GBP declarations…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header — last synced timestamp only. Per the 2026-06-11 role-split
          audit: the operator doesn't pull display fields (those are
          tenant-owned). Categories pull/push live in TASK_ACTIONS above. */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/40 px-3 py-2">
        <div className="text-[10px] text-muted">
          <span>Source: <span className="font-medium text-foreground">TracPost cache</span></span>
          {data.sync.syncedAt && (
            <>
              <span className="mx-1">·</span>
              <span>Last synced {new Date(data.sync.syncedAt).toLocaleString()}</span>
            </>
          )}
          {!data.sync.syncedAt && (
            <span className="ml-1 text-muted/70">(never synced)</span>
          )}
        </div>
      </div>

      {/* Categories — operator-owned per the 2026-06-11 role-split audit.
          Pull / Generate / Push action buttons live inline below the
          category list. The heavy coaching ceremony lives at step 3
          (brand_categorization → /ops/categories-coaching). */}
      <Section
        title="Categories"
        subtitle="Operator-managed"
      >
        <GbpCategoriesDisplay businessId={businessId} />
        <CategoryActions businessId={businessId} />
      </Section>

      {/* 1. Service Areas */}
      <Section title="Service Areas" subtitle={`${data.serviceAreas.length} / ${data.serviceAreaCap}`}>
        {data.serviceAreas.length === 0 ? (
          <EmptyHint text="No service areas declared yet" />
        ) : (
          (() => {
            // Sort broad → narrow per granularity precedence.
            const sorted = [...data.serviceAreas].sort((a, b) => {
              const pa = KIND_PRECEDENCE[a.kind] ?? 4;
              const pb = KIND_PRECEDENCE[b.kind] ?? 4;
              return pa - pb;
            });
            return (
              <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
                {sorted.map((sa) => (
                  <li key={sa.placeId || sa.placeName} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <span className="text-foreground flex-1 truncate">{sa.placeName}</span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${kindBadgeClass(sa.kind)}`}
                      title={`Granularity: ${sa.kind}`}
                    >
                      {sa.kind}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()
        )}
      </Section>

      {/* 2. Hours */}
      <Section title="Hours">
        <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
          {DAY_ORDER.map((day) => {
            const slot = data.hours.find((h) => h.day === day);
            const closed = !slot;
            return (
              <li
                key={day}
                className="px-3 py-1.5 flex items-center justify-between text-xs"
              >
                <span className="font-medium w-10 text-muted">{DAY_SHORT[day]}</span>
                {closed ? (
                  <span className="text-[10px] text-muted">Closed</span>
                ) : (
                  <span className="font-mono text-foreground">
                    {slot.openTime} — {slot.closeTime}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* 3. Address */}
      <Section title="Address" subtitle={data.showAddress ? "Shown on Google" : "Hidden (service area only)"}>
        {data.showAddress ? (
          <div className="rounded-md border border-border bg-card/30 px-3 py-2 text-xs space-y-0.5">
            {data.address.addressLines.length > 0 ? (
              data.address.addressLines.map((line, i) => (
                <p key={i} className="text-foreground">{line}</p>
              ))
            ) : (
              <EmptyHint text="No street address on file" />
            )}
            {(data.address.locality || data.address.administrativeArea || data.address.postalCode) && (
              <p className="text-foreground">
                {[data.address.locality, data.address.administrativeArea, data.address.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-card/30 px-3 py-2 text-[11px] text-muted italic">
            Service-area-only declaration — no street address publicly displayed.
          </p>
        )}
      </Section>

      {/* 4. Description */}
      <Section title="Description" subtitle="Optional · owner-typed">
        {data.description ? (
          <div className="rounded-md border border-border bg-card/30 px-3 py-2 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
            {data.description}
          </div>
        ) : (
          <EmptyHint text="No description declared" />
        )}
      </Section>

      {/* 5. Social Profile URLs */}
      <Section title="Social Profile URLs" subtitle="Optional · GBP display links">
        {data.socialProfiles.length === 0 ? (
          <EmptyHint text="No social profile URLs declared" />
        ) : (
          <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
            {data.socialProfiles.map((s, i) => (
              <li key={i} className="px-3 py-1.5 flex items-center justify-between text-xs">
                <span className="text-foreground">{s.channelLabel}</span>
                <a
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-muted hover:text-foreground font-mono truncate ml-2 max-w-[14rem]"
                  title={s.uri}
                >
                  {s.uri} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{title}</h4>
        {subtitle && <span className="text-[10px] text-muted">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/30 px-3 py-2 text-[11px] text-muted italic text-center">
      {text}
    </div>
  );
}

/**
 * Operator's category round-trip actions — Pull / Generate / Push.
 * Inline immediately below the category list per the 2026-06-11 UX pass.
 * Mirrors the dispatcher logic previously housed in provisioning-graph's
 * TASK_ACTIONS for gbp_location (now retired from there).
 */
function CategoryActions({ businessId }: { businessId: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async (
    actionKey: "pull" | "generate" | "push",
    runner: () => Promise<{ ok: boolean; message: string }>,
  ) => {
    setRunning(actionKey);
    setFeedback(null);
    try {
      const result = await runner();
      setFeedback(result);
    } catch (e) {
      setFeedback({ ok: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRunning(null);
    }
  };

  const pull = () =>
    run("pull", async () => {
      const r = await fetch(`/api/admin/businesses/${businessId}/gbp-sync`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return { ok: true, message: "✓ Categories pulled from Google." };
    });

  const generate = () =>
    run("generate", async () => {
      const r = await fetch(`/api/admin/sites/${businessId}/services/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "categorize" }),
      });
      if (!r.ok) {
        const m = await r.text().catch(() => "");
        throw new Error(m || `HTTP ${r.status}`);
      }
      const d = await r.json().catch(() => ({} as { categorization?: { primary?: { name?: string }; additional_count?: number } }));
      const primary = d?.categorization?.primary?.name ?? "primary category";
      const additionalCount = d?.categorization?.additional_count ?? 0;
      return { ok: true, message: `✓ Staged — primary: ${primary} + ${additionalCount} additional.` };
    });

  const push = () =>
    run("push", async () => {
      const r = await fetch(`/api/admin/businesses/${businessId}/gbp-categories-push`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.success) throw new Error(d?.error || `HTTP ${r.status}`);
      return { ok: true, message: "✓ Categories pushed to Google." };
    });

  const btn = (key: "pull" | "generate" | "push", icon: string, label: string, handler: () => void) => {
    const isRunning = running === key;
    return (
      <button
        type="button"
        onClick={handler}
        disabled={running !== null}
        className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-card/70 disabled:opacity-50 transition-colors"
      >
        <span className="text-[10px] w-4 text-center">{icon}</span>
        <span>{isRunning ? "Running…" : label}</span>
      </button>
    );
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {btn("pull", "↻", "Pull from Google", pull)}
        {btn("generate", "▶", "Generate staged", generate)}
        {btn("push", "🚀", "Push to Google", push)}
      </div>
      {feedback && (
        <p
          className={`text-[10px] ${
            feedback.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
