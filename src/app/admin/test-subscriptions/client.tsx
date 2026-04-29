"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  plan: string;
  status: string;
  is_test: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
  owner_email: string | null;
  owner_name: string | null;
  site_count: number;
}

export function TestSubsClient({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  async function wipeOne(id: string) {
    if (!confirm("Wipe this test subscription? This cannot be undone.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/test-subscriptions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wipe failed");
    } finally {
      setBusy(null);
    }
  }

  async function wipeAll() {
    if (bulkConfirm !== "WIPE") {
      setError("Type WIPE in the confirmation box to proceed.");
      return;
    }
    setBulkRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/test-subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "WIPE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      router.refresh();
      setRows([]);
      setBulkConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk wipe failed");
    } finally {
      setBulkRunning(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted">
        No test subscriptions to clean up.
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 space-y-2">
        {rows.map((r) => {
          const meta = (r.metadata || {}) as Record<string, unknown>;
          const stripeRefs = (meta.stripe || {}) as Record<string, string>;
          return (
            <div
              key={r.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {r.owner_name || "(no owner name)"}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    test
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      r.status === "active"
                        ? "border-green-200 bg-green-100 text-green-700"
                        : "border-gray-200 bg-gray-100 text-gray-600"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {r.owner_email || "—"}
                  <span className="mx-1.5 text-dim">·</span>
                  <span className="capitalize">{r.plan || "—"}</span>
                  <span className="mx-1.5 text-dim">·</span>
                  {r.site_count} site{r.site_count === 1 ? "" : "s"}
                  <span className="mx-1.5 text-dim">·</span>
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
                {stripeRefs.subscription_id && (
                  <div className="mt-1 font-mono text-[10px] text-dim">
                    {stripeRefs.subscription_id}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => wipeOne(r.id)}
                disabled={busy === r.id}
                className="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {busy === r.id ? "Wiping…" : "Wipe"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
        <h3 className="text-sm font-semibold text-red-800">Bulk wipe</h3>
        <p className="mt-1 text-xs text-red-700/80">
          Wipes every test subscription above in one action. Type{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">WIPE</code> to
          confirm.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={bulkConfirm}
            onChange={(e) => setBulkConfirm(e.target.value)}
            placeholder="Type WIPE"
            className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 placeholder:text-red-400"
          />
          <button
            type="button"
            onClick={wipeAll}
            disabled={bulkConfirm !== "WIPE" || bulkRunning}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {bulkRunning ? "Wiping all…" : `Wipe all ${rows.length}`}
          </button>
        </div>
      </div>
    </>
  );
}
