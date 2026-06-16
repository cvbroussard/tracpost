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
  const [result, setResult] = useState<{ ok?: boolean; draft_id?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageResult, setImageResult] = useState<{ url?: string; promptUsed?: string; catalogDescriptorsUsed?: string[]; catalogDescriptorsMissing?: string[]; durationMs?: number; bytesSize?: number; asset_id?: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ promoted_id: string; archived_id: string | null; page_key: string } | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

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

  async function generateHeroImage() {
    setImageBusy(true);
    setImageError(null);
    setImageResult(null);
    try {
      const res = await fetch(`/api/admin/businesses/${siteId}/website/generate-hero-image`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImageError(`${data.error ?? "error"}: ${data.message ?? "image gen failed"}`);
        return;
      }
      setImageResult(data);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "request failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function promoteDraft() {
    // Phase 1.5 — promote the latest home-page draft. Server-side
    // auto-pick by (business, page_key='home', status='draft') ORDER BY
    // generated_at DESC. The client doesn't need to track draft_id
    // between sessions or pass it through state; the freshest draft
    // is always the right one to promote.
    setPromoteBusy(true);
    setPromoteError(null);
    setPromoteResult(null);
    try {
      const res = await fetch(`/api/admin/businesses/${siteId}/website/promote-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result?.draft_id ? { draft_id: result.draft_id } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPromoteError(`${data.error ?? "error"}: ${data.message ?? "promote failed"}`);
        return;
      }
      setPromoteResult(data);
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : "request failed");
    } finally {
      setPromoteBusy(false);
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

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 shadow-card space-y-2">
        <h3 className="text-sm font-medium">Phase 1.5 — Promote latest draft to published</h3>
        <p className="text-xs text-muted leading-relaxed">
          Promotes the most recently generated home-page draft to{" "}
          <code className="text-[10px]">published</code>. Tenant renderer
          (b2construct.com) merges the hero section from this row over the
          legacy website_copy on next request, and the ISR cache is flushed
          immediately. Prior published row demoted to{" "}
          <code className="text-[10px]">archived</code>.
        </p>
        <button
          type="button"
          onClick={promoteDraft}
          disabled={promoteBusy}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {promoteBusy ? "Promoting…" : "⚙ Promote latest draft to published"}
        </button>
        {promoteError && (
          <p className="text-[10px] text-rose-600 dark:text-rose-400">{promoteError}</p>
        )}
        {promoteResult && (
          <div className="text-[10px] space-y-1">
            <p className="text-green-700 dark:text-green-400">
              ✓ Promoted draft {promoteResult.promoted_id.slice(0, 8)}… to published
              {promoteResult.archived_id && ` (prior ${promoteResult.archived_id.slice(0, 8)}… archived)`}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-2">Phase 2 — Hero Image (Nano Banana)</h3>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Generates a brand-faithful hero image using the catalog-derived prompt and the
          alt text from the latest home draft. Persists to R2 and binds to the draft&apos;s
          <code className="text-[10px]"> hero_image.asset_id</code>. Run Phase 1 first.
        </p>
        <button
          type="button"
          onClick={generateHeroImage}
          disabled={imageBusy}
          className="rounded border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-medium hover:bg-accent/20 disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {imageBusy ? "Generating image… (~20-40s)" : "Generate hero image"}
        </button>
        {imageError && (
          <p className="mt-3 text-[10px] text-rose-600 dark:text-rose-400">{imageError}</p>
        )}
        {imageResult && (
          <div className="mt-4 space-y-3">
            {imageResult.url && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageResult.url}
                  alt="Generated hero"
                  className="w-full rounded border border-border"
                />
              </div>
            )}
            <div className="text-[10px] text-muted flex flex-wrap gap-x-4 gap-y-1">
              {imageResult.durationMs !== undefined && (
                <span>
                  Duration: <span className="text-foreground">{Math.round(imageResult.durationMs / 100) / 10}s</span>
                </span>
              )}
              {imageResult.bytesSize !== undefined && (
                <span>
                  Size: <span className="text-foreground">{Math.round(imageResult.bytesSize / 1024)} KB</span>
                </span>
              )}
              {imageResult.asset_id && (
                <span>
                  Asset id: <span className="text-foreground font-mono text-[9px]">{imageResult.asset_id}</span>
                </span>
              )}
            </div>
            {imageResult.catalogDescriptorsUsed && imageResult.catalogDescriptorsUsed.length > 0 && (
              <div className="text-[10px]">
                <span className="text-muted">Descriptors used:</span>{" "}
                <span className="text-foreground">
                  {imageResult.catalogDescriptorsUsed.join(", ")}
                </span>
              </div>
            )}
            {imageResult.catalogDescriptorsMissing && imageResult.catalogDescriptorsMissing.length > 0 && (
              <div className="text-[10px]">
                <span className="text-muted">Descriptors missing:</span>{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {imageResult.catalogDescriptorsMissing.join(", ")}
                </span>
              </div>
            )}
            {imageResult.promptUsed && (
              <details className="text-[10px] text-muted">
                <summary className="cursor-pointer">Prompt used</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono bg-card/40 p-3 rounded border border-border">
                  {imageResult.promptUsed}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
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
