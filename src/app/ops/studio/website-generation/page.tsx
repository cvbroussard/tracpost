"use client";

import { useState } from "react";
import { ManagePage } from "@/components/manage/manage-page";

/**
 * Studio surface for the website generator (Phase 1).
 *
 * Single button triggers home-page hero generation for the selected
 * business. Displays the generated JSON for inspection — the renderer
 * is a separate workstream (Phase 1.5+).
 */
function WebsiteGenerationContent({ siteId }: { siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateHome() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/businesses/${siteId}/website/generate-home`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(`${data.error ?? "error"}: ${data.message ?? "generation failed"}`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-2">Phase 1 — Home Page Hero</h3>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Generates the home-page hero section from the brand catalog. Output is
          stored as a draft row in <code className="text-[10px]">website_content</code>.
          The renderer that consumes this content is a separate workstream — for now,
          inspect the JSON output below to validate quality.
        </p>
        <button
          type="button"
          onClick={generateHome}
          disabled={busy}
          className="rounded border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-medium hover:bg-accent/20 disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {busy ? "Generating… (~15-30s)" : "Generate home page hero"}
        </button>
        {error && (
          <p className="mt-3 text-[10px] text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>

      {result !== null && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-2">Result</h3>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all overflow-x-auto bg-card/40 p-3 rounded border border-border">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Website Generation" requireSite>
      {({ siteId }) => <WebsiteGenerationContent siteId={siteId} />}
    </ManagePage>
  );
}
