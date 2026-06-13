/**
 * Operator's category round-trip action panel — Pull / Generate / Push.
 *
 * Categories are platform-authored per the 2026-06-13 platform-vs-owner
 * authorship separation. This component lives on the brand_categorization
 * (step 3) drawer, inline next to the category list.
 *
 * Previously housed on step 14 (gbp_location) when category management
 * was tangled with profile-field declarations. Moved here when service
 * areas (owner-authored) and categories (platform-authored) were
 * separated so that:
 *   - Categories (Cat 1 brand identity input, platform-authored) → step 3
 *   - Service Areas (Cat 1 brand identity input, owner-authored) → step 14
 *
 * The action dispatcher logic mirrors what was previously inline in
 * gbp-declarations-display.tsx; the URLs + payloads are unchanged.
 */
"use client";

import { useState } from "react";

export function GbpCategoryActions({ businessId }: { businessId: string }) {
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
      const d = await r.json().catch(
        () => ({} as { categorization?: { primary?: { name?: string }; additional_count?: number } }),
      );
      const primary = d?.categorization?.primary?.name ?? "primary category";
      const additionalCount = d?.categorization?.additional_count ?? 0;
      return { ok: true, message: `✓ Staged — primary: ${primary} + ${additionalCount} additional.` };
    });

  const push = () =>
    run("push", async () => {
      const r = await fetch(`/api/admin/businesses/${businessId}/gbp-categories-push`, {
        method: "POST",
      });
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
