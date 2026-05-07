"use client";

import { useState } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import type { AssembledBlogPrompt } from "@/lib/v2-generator/blog";
import type { TraceEntry } from "@/lib/v2-generator/blog";

type ArticleType = "blog" | "project_chapter" | "service";

const BLOG_CONTENT_TYPES = [
  { value: "", label: "Auto-classify" },
  { value: "authority_overview", label: "Authority overview" },
  { value: "deep_dive", label: "Deep dive" },
  { value: "project_story", label: "Project story" },
  { value: "vendor_spotlight", label: "Vendor spotlight" },
];

interface InspectorResponse {
  assembled: AssembledBlogPrompt;
  traces: TraceEntry[][];
  heroAssetId: string;
  pillar: string | null;
  bodyAssetCount: number;
}

function PromptInspectorContent({ siteId }: { siteId: string }) {
  const [articleType, setArticleType] = useState<ArticleType>("blog");
  const [contentTypeOverride, setContentTypeOverride] = useState("");
  const [intent, setIntent] = useState("");
  const [seedAssetId, setSeedAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectorResponse | null>(null);
  const [openBlocks, setOpenBlocks] = useState<Set<number>>(new Set());

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpenBlocks(new Set());
    try {
      const res = await fetch(`/api/manage/prompt-inspector/${articleType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          seedAssetId: seedAssetId || undefined,
          contentTypeOverride: contentTypeOverride || undefined,
          intent: intent || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as InspectorResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleBlock(idx: number) {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function expandAll() {
    if (!result) return;
    setOpenBlocks(new Set(result.assembled.promptStats.blocks.map((_, i) => i)));
  }

  function collapseAll() {
    setOpenBlocks(new Set());
  }

  // Slice the assembled prompt into per-block raw text.
  function sliceBlocks(prompt: string): string[] {
    const lines = prompt.split("\n");
    const slices: string[] = [];
    let current: string[] = [];
    let started = false;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (started || current.length > 0) {
          slices.push(current.join("\n"));
          current = [];
        }
        started = true;
        current.push(line);
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) slices.push(current.join("\n"));
    return slices;
  }

  const blockSlices = result ? sliceBlocks(result.assembled.prompt) : [];

  return (
    <div className="p-4 space-y-4">
      {/* Article-type tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            { key: "blog", label: "Blog" },
            { key: "project_chapter", label: "Project chapter", disabled: true },
            { key: "service", label: "Service", disabled: true },
          ] as Array<{ key: ArticleType; label: string; disabled?: boolean }>
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && setArticleType(tab.key)}
            disabled={tab.disabled}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              articleType === tab.key
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {tab.label}
            {tab.disabled && <span className="ml-1 text-[9px]">(soon)</span>}
          </button>
        ))}
      </div>

      {/* Generation controls */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
        <h3 className="text-sm font-medium">Build prompt</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-muted mb-1">Content type</label>
            <select
              value={contentTypeOverride}
              onChange={(e) => setContentTypeOverride(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {BLOG_CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] text-muted mb-1">
              Editorial angle / intent (optional, becomes the “Editorial Angle” block)
            </label>
            <input
              type="text"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g. focus on commercial-grade range hood ventilation"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] text-muted mb-1">
              Seed asset ID (optional — leave blank to pick the next fresh hero)
            </label>
            <input
              type="text"
              value={seedAssetId}
              onChange={(e) => setSeedAssetId(e.target.value)}
              placeholder="UUID of a media_asset to anchor on"
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={loading || siteId === "all"}
            className="bg-accent px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Building…" : "Generate prompt"}
          </button>
          {siteId === "all" && (
            <span className="text-[10px] text-muted">Pick a site to enable.</span>
          )}
          {error && <span className="text-[10px] text-danger">{error}</span>}
        </div>
      </div>

      {/* Result */}
      {result && (
        <>
          <SummaryHeader result={result} />
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Prompt blocks (click to inspect)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={expandAll}
                  className="text-[10px] text-muted hover:text-foreground underline"
                >
                  Expand all
                </button>
                <span className="text-[10px] text-muted">·</span>
                <button
                  onClick={collapseAll}
                  className="text-[10px] text-muted hover:text-foreground underline"
                >
                  Collapse all
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {result.assembled.promptStats.blocks.map((b, i) => (
                <BlockCard
                  key={i}
                  index={i}
                  name={b.name}
                  chars={b.chars}
                  lines={b.lines}
                  raw={blockSlices[i] || ""}
                  traces={result.traces[i] || []}
                  open={openBlocks.has(i)}
                  onToggle={() => toggleBlock(i)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryHeader({ result }: { result: InspectorResponse }) {
  const a = result.assembled;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="grid grid-cols-4 gap-4 text-xs">
        <Field label="Content type" value={a.contentType} />
        <Field
          label="Model"
          value={a.effectiveModel}
          hint={a.useSonnet ? "Sonnet (playbook present)" : "Haiku fallback (no playbook)"}
        />
        <Field
          label="Token budget"
          value={`${a.effectiveMaxTokens.toLocaleString()} max_tokens`}
          hint={`${a.modelConfig.wordRange} word target`}
        />
        <Field
          label="Prompt size"
          value={`${a.promptStats.chars.toLocaleString()} chars · ~${a.promptStats.estimatedTokens.toLocaleString()} tokens`}
          hint={`${a.promptStats.lines} lines · ${a.promptStats.blocks.length} blocks`}
        />
        <Field
          label="Hero asset"
          value={result.heroAssetId.slice(0, 8) + "…"}
          hint={result.pillar ? `pillar: ${result.pillar}` : "no pillar"}
          mono
        />
        <Field
          label="Body candidates"
          value={`${result.bodyAssetCount} assets`}
        />
        <Field
          label="Vendor links"
          value={`${a.inputs.vendorLinks.length}`}
        />
        <Field
          label="Project links"
          value={`${a.inputs.projectLinks.length}`}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`text-xs ${mono ? "font-mono" : "font-medium"}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function BlockCard({
  index,
  name,
  chars,
  lines,
  raw,
  traces,
  open,
  onToggle,
}: {
  index: number;
  name: string;
  chars: number;
  lines: number;
  raw: string;
  traces: TraceEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  const tokens = Math.ceil(chars / 4);
  return (
    <div className="rounded border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-background hover:bg-surface-hover text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-muted font-mono w-6 shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-xs font-medium truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted font-mono">
          <span>{chars.toLocaleString()}c</span>
          <span>·</span>
          <span>~{tokens}t</span>
          <span>·</span>
          <span>{lines}L</span>
          <span>·</span>
          <span>{traces.length} source{traces.length === 1 ? "" : "s"}</span>
          <span className="text-foreground ml-1">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border bg-surface">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Raw block content */}
            <div className="p-3 border-b md:border-b-0 md:border-r border-border">
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
                Raw block content
              </div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap leading-relaxed text-foreground/90 max-h-96 overflow-y-auto">
                {raw || "(empty)"}
              </pre>
            </div>
            {/* Traces */}
            <div className="p-3">
              <div className="text-[10px] text-muted uppercase tracking-wide mb-2">
                Sources ({traces.length})
              </div>
              {traces.length === 0 ? (
                <div className="text-[10px] text-muted italic">No traces mapped.</div>
              ) : (
                <div className="space-y-2">
                  {traces.map((t, i) => (
                    <TraceCard key={i} trace={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceCard({ trace }: { trace: TraceEntry }) {
  const kindStyle: Record<TraceEntry["kind"], { bg: string; label: string }> = {
    db: { bg: "bg-blue-500/15 text-blue-400", label: "DB" },
    external: { bg: "bg-purple-500/15 text-purple-400", label: "EXT" },
    code: { bg: "bg-amber-500/15 text-amber-400", label: "CODE" },
    computed: { bg: "bg-emerald-500/15 text-emerald-400", label: "COMP" },
    input: { bg: "bg-pink-500/15 text-pink-400", label: "INPUT" },
  };
  const k = kindStyle[trace.kind];
  return (
    <div className="rounded border border-border bg-background p-2">
      <div className="flex items-start gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${k.bg}`}>
          {k.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium font-mono break-all">{trace.label}</div>
          <div className="text-[10px] text-muted leading-snug mt-0.5">{trace.detail}</div>
          <div className="mt-1.5 space-y-0.5 text-[10px] font-mono">
            {trace.table && (
              <div>
                <span className="text-muted">table:</span> {trace.table}
              </div>
            )}
            {trace.columns && trace.columns.length > 0 && (
              <div>
                <span className="text-muted">cols:</span>{" "}
                {trace.columns.join(", ")}
              </div>
            )}
            {trace.filter && (
              <div className="break-all">
                <span className="text-muted">where:</span> {trace.filter}
              </div>
            )}
            {trace.file && (
              <div className="break-all">
                <span className="text-muted">file:</span> {trace.file}
                {trace.lines ? `:${trace.lines}` : ""}
              </div>
            )}
            {trace.service && (
              <div>
                <span className="text-muted">service:</span> {trace.service}
              </div>
            )}
            {trace.inputName && (
              <div>
                <span className="text-muted">input:</span> {trace.inputName}
              </div>
            )}
            {trace.sample && trace.sample.length > 0 && (
              <div className="mt-1 pt-1 border-t border-border">
                <div className="text-muted mb-0.5">sample:</div>
                {trace.sample.map((s, i) => (
                  <div key={i} className="break-all pl-2">
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Prompt Inspector" requireSite>
      {({ siteId }) => <PromptInspectorContent siteId={siteId} />}
    </ManagePage>
  );
}
