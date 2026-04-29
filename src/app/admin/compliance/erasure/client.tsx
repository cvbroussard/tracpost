"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ErasureClient() {
  const router = useRouter();
  const [subscriptionId, setSubscriptionId] = useState("");
  const [requestReference, setRequestReference] = useState("");
  const [exemptionNotes, setExemptionNotes] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!subscriptionId.trim()) {
      setError("Subscription ID is required.");
      return;
    }
    if (!requestReference.trim()) {
      setError("Request reference is required for the audit log.");
      return;
    }
    if (confirm !== "ERASE") {
      setError("Type ERASE to confirm.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/compliance/erasure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: subscriptionId.trim(),
          request_reference: requestReference.trim(),
          exemption_notes: exemptionNotes.trim() || null,
          confirm: "ERASE",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setResult(`Erasure complete. Subscription ${subscriptionId.trim()} removed.`);
      setSubscriptionId("");
      setRequestReference("");
      setExemptionNotes("");
      setConfirm("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erasure failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-red-200 bg-red-50/40 p-5 space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-red-900">Subscription ID (UUID)</label>
        <input
          type="text"
          value={subscriptionId}
          onChange={(e) => setSubscriptionId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 font-mono text-sm text-foreground"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-red-900">
          Request reference (legal hold ID, ticket #, request date — required for audit)
        </label>
        <input
          type="text"
          value={requestReference}
          onChange={(e) => setRequestReference(e.target.value)}
          placeholder="GDPR-2026-0427 or Ticket #1234"
          className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-red-900">
          Exemption notes <span className="text-red-700/60">(optional — what's being retained and why)</span>
        </label>
        <textarea
          value={exemptionNotes}
          onChange={(e) => setExemptionNotes(e.target.value)}
          rows={2}
          placeholder="Stripe customer retained for 7-year financial-retention exemption (US tax)."
          className="w-full resize-y rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type ERASE"
          className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 placeholder:text-red-400"
        />
        <button
          type="submit"
          disabled={busy || confirm !== "ERASE"}
          className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Erasing…" : "Process erasure"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && <p className="text-sm text-green-700">{result}</p>}
    </form>
  );
}
