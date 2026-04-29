"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NUDGE_TEMPLATES, type NudgeTemplate } from "@/lib/onboarding/nudges/templates";

interface Props {
  token: string;
  defaultPlatform?: string;
}

export function NudgePanel({ token, defaultPlatform }: Props) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string>(
    defaultPlatform
      ? NUDGE_TEMPLATES.find((t) => t.platform === defaultPlatform)?.key || ""
      : ""
  );
  const [customNote, setCustomNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected: NudgeTemplate | undefined = NUDGE_TEMPLATES.find((t) => t.key === selectedKey);

  async function send() {
    if (!selectedKey) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/onboarding-queue/${token}/nudge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: selectedKey,
          custom_note: customNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setResult(
        data.email_sent
          ? `Sent · ${selected?.label}`
          : `Notification created — email send failed (check logs)`
      );
      setCustomNote("");
      setSelectedKey("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mb-6 rounded-xl border border-border bg-surface" open={!!defaultPlatform}>
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted hover:bg-surface-hover">
        Send help nudge
      </summary>
      <div className="px-5 pb-5 pt-2">
        <p className="mb-3 text-xs text-muted">
          Sends an email to the subscriber and creates a persistent notification in their studio.
          Use when an onboarding is stalled and you can identify the friction point.
        </p>

        <label className="mb-1 block text-xs font-medium text-muted">Template</label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">Pick a template…</option>
          {NUDGE_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>

        {selected && (
          <div className="mb-3 rounded-lg border border-dashed border-border bg-background p-3">
            <p className="mb-1 text-xs font-medium text-muted">
              Subject preview: <span className="text-foreground">{selected.subject}</span>
            </p>
            <p className="text-xs text-muted">
              Notification: <span className="text-foreground">{selected.notificationTitle}</span>
            </p>
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-muted">
          Custom note <span className="text-dim">(optional)</span>
        </label>
        <textarea
          value={customNote}
          onChange={(e) => setCustomNote(e.target.value)}
          placeholder="Hey — give me a call when you have a sec, happy to walk through it."
          rows={2}
          className="mb-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {result && <p className="text-xs text-green-700">✓ {result}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!selectedKey || busy}
            className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send nudge"}
          </button>
        </div>
      </div>
    </details>
  );
}
