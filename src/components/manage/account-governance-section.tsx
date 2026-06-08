/**
 * Account governance section — operator controls for suspension and
 * (future) cancellation, refund, etc. Lives inside the provisioning
 * drawer's checkout task per [[provisioning-drawer-console]].
 *
 * Suspension is an admin-only override on a live account, distinct from
 * Stripe checkout state (which marks the initial onboarding event). The
 * task graph node's status doesn't flip when suspension toggles — the
 * checkout STILL completed; the account is just locked out subsequently.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface SuspensionState {
  isActive: boolean;
  status: string;
  suspendedAt: string | null;
  suspendReason: string | null;
}

export function AccountGovernanceSection({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [state, setState] = useState<SuspensionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/accounts/${subscriptionId}/suspension`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data = (await r.json()) as SuspensionState;
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(action: "suspend" | "unsuspend") {
    setActing(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/accounts/${subscriptionId}/suspension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "suspend" ? reason.trim() : undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      await refresh();
      setConfirmingSuspend(false);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted">
        Loading governance state…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted">
        {error || "Unable to load governance state."}
      </div>
    );
  }

  const isSuspended = state.status === "suspended" || !state.isActive;

  return (
    <div
      className={`rounded-md border ${
        isSuspended
          ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-900/10"
          : "border-border bg-card"
      } px-3 py-2.5 space-y-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted font-medium">
          Account state
        </span>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            isSuspended
              ? "bg-red-200 text-red-800 dark:bg-red-800/40 dark:text-red-300"
              : "bg-green-200 text-green-800 dark:bg-green-800/40 dark:text-green-300"
          }`}
        >
          {isSuspended ? "Suspended" : "Active"}
        </span>
      </div>

      {isSuspended && (
        <div className="space-y-0.5">
          {state.suspendedAt && (
            <p className="text-[10px] text-muted">
              Suspended {new Date(state.suspendedAt).toLocaleString()}
            </p>
          )}
          {state.suspendReason && (
            <p className="text-[11px] text-foreground italic">
              &ldquo;{state.suspendReason}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isSuspended && !confirmingSuspend && (
        <button
          type="button"
          onClick={() => setConfirmingSuspend(true)}
          disabled={acting}
          className="w-full rounded border border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
        >
          Suspend account…
        </button>
      )}

      {!isSuspended && confirmingSuspend && (
        <div className="space-y-2">
          <label className="block text-[10px] text-muted">
            Reason (optional — visible to other operators):
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. payment failed; awaiting tenant response"
            disabled={acting}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-[11px] focus:border-accent focus:outline-none"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => runAction("suspend")}
              disabled={acting}
              className="flex-1 rounded border border-red-500 bg-red-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {acting ? "Suspending…" : "Confirm suspend"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingSuspend(false);
                setReason("");
              }}
              disabled={acting}
              className="rounded border border-border bg-card px-3 py-1.5 text-[11px] text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isSuspended && (
        <button
          type="button"
          onClick={() => runAction("unsuspend")}
          disabled={acting}
          className="w-full rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {acting ? "Restoring…" : "Restore account"}
        </button>
      )}

      {error && (
        <p className="text-[10px] text-red-700 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
