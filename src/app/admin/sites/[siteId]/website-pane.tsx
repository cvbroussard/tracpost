"use client";

import { useState } from "react";
import type {
  PageConfig,
  PageSlot,
  SlotKey,
  WorkContent,
  ServiceTile,
  PricingTier,
} from "@/lib/tenant-site";

// ──────────────────────────────────────────────────────────────────
// Page Layout editor — per-slot enabled / label / variant
// ──────────────────────────────────────────────────────────────────

const VARIANT_OPTIONS: Record<SlotKey, string[]> = {
  home: ["service_business", "saas_landing", "coach", "portfolio_forward"],
  about: ["solo_practitioner", "team", "founder", "studio", "firm"],
  work: ["services_tiles", "pricing_tiers", "hybrid"],
  blog: ["journal", "insights", "news"],
  projects: ["portfolio", "case_studies", "timeline"],
  contact: ["form", "booking_demo", "multi_channel"],
};

export function PageLayoutEditor({
  siteId,
  initial,
}: {
  siteId: string;
  initial: PageConfig;
}) {
  const [config, setConfig] = useState<PageConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(idx: number, patch: Partial<PageSlot>) {
    setConfig((prev) => prev.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/marketing-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_config: config }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] text-muted">
            <th className="text-left font-normal pb-1 pr-2">Slot</th>
            <th className="text-left font-normal pb-1 pr-2">Enabled</th>
            <th className="text-left font-normal pb-1 pr-2">Label</th>
            <th className="text-left font-normal pb-1">Variant</th>
          </tr>
        </thead>
        <tbody>
          {config.map((slot, i) => (
            <tr key={slot.id} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2 text-muted">{slot.key}</td>
              <td className="py-1.5 pr-2">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => update(i, { enabled: e.target.checked })}
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="w-full bg-surface-hover px-1.5 py-0.5 text-xs"
                />
              </td>
              <td className="py-1.5">
                <select
                  value={slot.variant}
                  onChange={(e) => update(i, { variant: e.target.value })}
                  className="w-full bg-surface-hover px-1.5 py-0.5 text-xs"
                >
                  {VARIANT_OPTIONS[slot.key].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save layout"}
        </button>
        {saved && <span className="text-[10px] text-success">Saved</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Hero Override picker — choose which media asset is the home hero
// ──────────────────────────────────────────────────────────────────

interface HeroAsset {
  id: string;
  storage_url: string;
  context_note: string | null;
  quality_score: number | null;
}

export function HeroOverridePicker({
  siteId,
  initialHeroAssetId,
  candidates,
}: {
  siteId: string;
  initialHeroAssetId: string | null;
  candidates: HeroAsset[];
}) {
  const [selected, setSelected] = useState<string | null>(initialHeroAssetId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(value: string | null) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/marketing-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hero_asset_id: value }),
      });
      if (res.ok) {
        setSelected(value);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  if (candidates.length === 0) {
    return <p className="text-[10px] text-muted">No image assets yet — upload some to set a hero.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => save(null)}
          disabled={saving}
          className={`relative aspect-video overflow-hidden rounded border-2 ${
            selected === null ? "border-accent" : "border-border"
          }`}
        >
          <div className="flex h-full items-center justify-center bg-surface-hover text-[10px] text-muted">
            Auto
            <br />(top quality)
          </div>
        </button>
        {candidates.slice(0, 11).map((asset) => (
          <button
            key={asset.id}
            onClick={() => save(asset.id)}
            disabled={saving}
            className={`relative aspect-video overflow-hidden rounded border-2 ${
              selected === asset.id ? "border-accent" : "border-border hover:border-accent/50"
            }`}
            title={asset.context_note || ""}
          >
            <img
              src={asset.storage_url}
              alt={asset.context_note || ""}
              className="h-full w-full object-cover"
            />
            {selected === asset.id && (
              <div className="absolute right-1 top-1 rounded bg-accent px-1 text-[9px] font-medium text-white">✓</div>
            )}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        {selected === null
          ? "Auto: highest quality_score wins."
          : "Pinned override active. Click Auto to revert."}
        {saving && " · saving..."}
        {saved && <span className="text-success"> · saved</span>}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Regenerate Copy button — fires the AI copy generator
// ──────────────────────────────────────────────────────────────────

export function RegenerateCopyButton({ siteId }: { siteId: string }) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ heroTitle?: string; heroSubtitle?: string; ctaText?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/regenerate-copy`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.preview);
      } else {
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={regenerate}
        disabled={generating}
        className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {generating ? "Generating (~30-60s)..." : "Regenerate copy"}
      </button>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      {result && (
        <div className="rounded border border-success/30 bg-success/5 p-2 space-y-1">
          <p className="text-[10px] text-muted">New hero:</p>
          <p className="text-xs font-medium">{result.heroTitle}</p>
          <p className="text-[10px] text-muted">{result.heroSubtitle}…</p>
          <p className="text-[10px] text-muted">CTA: {result.ctaText}</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Render pipeline — batch render pending assets
// ──────────────────────────────────────────────────────────────────

export function RenderPipelineButton({ siteId }: { siteId: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total?: number;
    rendered?: number;
    skipped?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRender() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "render_pending" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
      } else {
        setError(data.error || "Render failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={runRender}
        disabled={running}
        className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {running ? "Rendering..." : "Render pending assets"}
      </button>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      {result && (
        <div className="rounded border border-success/30 bg-success/5 p-2 space-y-1">
          <p className="text-[10px] text-muted">
            {result.total} assets checked · {result.rendered} variants rendered · {result.skipped} skipped
          </p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Autopilot controls — publish now + refresh expired tokens
// ──────────────────────────────────────────────────────────────────

const PUBLISH_PLATFORMS = [
  { value: "", label: "All platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "Twitter/X" },
  { value: "gbp", label: "Google Business" },
];

export function AutopilotControls({ siteId }: { siteId: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState("");

  async function trigger(action: string, extra?: Record<string, unknown>) {
    setRunning(action);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error || "Failed");
    } catch {
      setError("Request failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="bg-surface-hover px-2 py-1 text-[10px] border border-border rounded"
        >
          {PUBLISH_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={() => trigger("publish", selectedPlatform ? { platform: selectedPlatform } : {})}
          disabled={!!running}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {running === "publish" ? "Publishing..." : "Publish now"}
        </button>
        <button
          onClick={() => trigger("refresh_tokens")}
          disabled={!!running}
          className="border border-border px-3 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          {running === "refresh_tokens" ? "Refreshing..." : "Refresh expired tokens"}
        </button>
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      {result && (
        <div className="rounded border border-success/30 bg-success/5 p-2">
          <pre className="text-[10px] text-muted whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Services regenerate — GBP categorize + derive 6-8 service tiles
// ──────────────────────────────────────────────────────────────────

export function RegenerateServicesButton({ siteId }: { siteId: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    categorization?: { primary: { name: string; reasoning: string }; additional_count: number };
    services?: { created: number; skipped: boolean; reason?: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(step: "all" | "categorize" | "derive") {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/services/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
      } else {
        setError(data.error || "Regeneration failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => regenerate("all")}
          disabled={running}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? "Running (~30-60s)..." : "Categorize + derive services"}
        </button>
        <button
          onClick={() => regenerate("categorize")}
          disabled={running}
          className="border border-border px-3 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          Categorize only
        </button>
        <button
          onClick={() => regenerate("derive")}
          disabled={running}
          className="border border-border px-3 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          Derive services only
        </button>
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      {result && (
        <div className="rounded border border-success/30 bg-success/5 p-2 space-y-1">
          {result.categorization && (
            <>
              <p className="text-[10px] text-muted">Primary GBP category:</p>
              <p className="text-xs font-medium">{result.categorization.primary.name}</p>
              <p className="text-[10px] italic text-muted">{result.categorization.primary.reasoning}</p>
              <p className="text-[10px] text-muted">
                + {result.categorization.additional_count} additional
              </p>
            </>
          )}
          {result.services && (
            <p className="text-[10px] text-muted">
              Services: {result.services.skipped ? `skipped (${result.services.reason})` : `${result.services.created} created`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Work Content editor — variant-specific (services_tiles / pricing_tiers)
// ──────────────────────────────────────────────────────────────────

export function WorkContentEditor({
  siteId,
  activeVariant,
  initial,
}: {
  siteId: string;
  activeVariant: string;
  initial: WorkContent;
}) {
  const [content, setContent] = useState<WorkContent>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/marketing-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_content: content }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  const isServicesTiles = activeVariant === "services_tiles";
  const isPricingTiers = activeVariant === "pricing_tiers";

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted">
        Active variant: <span className="font-mono text-foreground">{activeVariant}</span> · change in Page Layout above.
        Both variants&apos; content is preserved when switching.
      </p>

      {/* Shared headline + subheadline */}
      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          value={content.headline || ""}
          onChange={(e) => setContent({ ...content, headline: e.target.value })}
          className="w-full bg-surface-hover px-2 py-1 text-xs"
          placeholder="Headline (e.g., What We Do, Pricing, Services)"
        />
        <input
          type="text"
          value={content.subheadline || ""}
          onChange={(e) => setContent({ ...content, subheadline: e.target.value })}
          className="w-full bg-surface-hover px-2 py-1 text-xs"
          placeholder="Subheadline (one-line intro)"
        />
      </div>

      {isServicesTiles && (
        <ServicesTilesEditor
          tiles={content.services_tiles || []}
          onChange={(tiles) => setContent({ ...content, services_tiles: tiles })}
        />
      )}

      {isPricingTiers && (
        <PricingTiersEditor
          tiers={content.pricing_tiers || []}
          onChange={(tiers) => setContent({ ...content, pricing_tiers: tiers })}
        />
      )}

      {!isServicesTiles && !isPricingTiers && (
        <p className="text-[10px] text-muted">
          No editor for variant &quot;{activeVariant}&quot; yet.
        </p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={save}
          disabled={saving}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save work content"}
        </button>
        {saved && <span className="text-[10px] text-success">Saved</span>}
      </div>
    </div>
  );
}

function ServicesTilesEditor({
  tiles,
  onChange,
}: {
  tiles: ServiceTile[];
  onChange: (next: ServiceTile[]) => void;
}) {
  function update(idx: number, patch: Partial<ServiceTile>) {
    onChange(tiles.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function add() {
    onChange([...tiles, { title: "", description: "" }]);
  }
  function remove(idx: number) {
    onChange(tiles.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...tiles];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium">Service Tiles ({tiles.length})</p>
        <button onClick={add} className="text-[10px] text-accent hover:underline">
          + Add tile
        </button>
      </div>
      {tiles.map((tile, i) => (
        <div key={i} className="rounded border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tile.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className="flex-1 bg-surface-hover px-2 py-1 text-xs font-medium"
              placeholder="Title"
            />
            <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-[10px] text-muted hover:text-foreground disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === tiles.length - 1} className="px-1 text-[10px] text-muted hover:text-foreground disabled:opacity-30">↓</button>
            <button onClick={() => remove(i)} className="px-1 text-[10px] text-danger hover:underline">×</button>
          </div>
          <textarea
            value={tile.description}
            onChange={(e) => update(i, { description: e.target.value })}
            className="w-full bg-surface-hover px-2 py-1 text-xs"
            rows={2}
            placeholder="Description (1-2 sentences)"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              type="text"
              value={tile.icon || ""}
              onChange={(e) => update(i, { icon: e.target.value || undefined })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="Icon (emoji or symbol, optional)"
            />
            <input
              type="text"
              value={tile.image || ""}
              onChange={(e) => update(i, { image: e.target.value || undefined })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="Image URL (optional)"
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <input
              type="text"
              value={tile.cta?.label || ""}
              onChange={(e) => {
                const label = e.target.value;
                update(i, { cta: label ? { label, href: tile.cta?.href || "/contact" } : undefined });
              }}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="CTA label (optional)"
            />
            <input
              type="text"
              value={tile.cta?.href || ""}
              onChange={(e) => {
                const href = e.target.value;
                update(i, { cta: tile.cta?.label ? { label: tile.cta.label, href } : undefined });
              }}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="CTA href (e.g., /contact)"
            />
          </div>
        </div>
      ))}
      {tiles.length === 0 && (
        <p className="text-[10px] text-muted">No tiles yet — click &quot;Add tile&quot; to start.</p>
      )}
    </div>
  );
}

function PricingTiersEditor({
  tiers,
  onChange,
}: {
  tiers: PricingTier[];
  onChange: (next: PricingTier[]) => void;
}) {
  function update(idx: number, patch: Partial<PricingTier>) {
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function add() {
    if (tiers.length >= 4) return; // sanity cap; 3 is the canonical pattern
    onChange([
      ...tiers,
      { title: "", description: "", price: "", features: [], cta: { label: "Get Started", href: "/contact" } },
    ]);
  }
  function remove(idx: number) {
    onChange(tiers.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...tiers];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium">Pricing Tiers ({tiers.length}/3 typical)</p>
        <button onClick={add} disabled={tiers.length >= 4} className="text-[10px] text-accent hover:underline disabled:opacity-50">
          + Add tier
        </button>
      </div>
      {tiers.map((tier, i) => (
        <div
          key={i}
          className={`rounded border p-2 space-y-1.5 ${tier.highlight ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tier.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className="flex-1 bg-surface-hover px-2 py-1 text-xs font-medium"
              placeholder="Tier name (Starter / Pro / Enterprise)"
            />
            <label className="flex items-center gap-1 text-[10px] text-muted">
              <input
                type="checkbox"
                checked={!!tier.highlight}
                onChange={(e) => update(i, { highlight: e.target.checked })}
              />
              Highlight
            </label>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-[10px] text-muted hover:text-foreground disabled:opacity-30">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === tiers.length - 1} className="px-1 text-[10px] text-muted hover:text-foreground disabled:opacity-30">↓</button>
            <button onClick={() => remove(i)} className="px-1 text-[10px] text-danger hover:underline">×</button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <input
              type="text"
              value={tier.price}
              onChange={(e) => update(i, { price: e.target.value })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="Price ($99/mo, From $40k, Custom)"
            />
            <input
              type="text"
              value={tier.description}
              onChange={(e) => update(i, { description: e.target.value })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="Tagline (one phrase)"
            />
          </div>
          <textarea
            value={tier.features.join("\n")}
            onChange={(e) =>
              update(i, { features: e.target.value.split("\n").filter((s) => s.trim()) })
            }
            className="w-full bg-surface-hover px-2 py-1 text-xs font-mono"
            rows={Math.max(3, tier.features.length + 1)}
            placeholder="Feature lines (one per row)"
          />
          <div className="grid grid-cols-3 gap-1">
            <input
              type="text"
              value={tier.cta.label}
              onChange={(e) => update(i, { cta: { ...tier.cta, label: e.target.value } })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="CTA label"
            />
            <input
              type="text"
              value={tier.cta.href}
              onChange={(e) => update(i, { cta: { ...tier.cta, href: e.target.value } })}
              className="bg-surface-hover px-2 py-1 text-xs"
              placeholder="CTA href / Stripe URL"
            />
            <select
              value={tier.cta.style || "primary"}
              onChange={(e) =>
                update(i, { cta: { ...tier.cta, style: e.target.value as "primary" | "outline" } })
              }
              className="bg-surface-hover px-2 py-1 text-xs"
            >
              <option value="primary">Primary button</option>
              <option value="outline">Outline button</option>
            </select>
          </div>
        </div>
      ))}
      {tiers.length === 0 && (
        <p className="text-[10px] text-muted">No tiers yet — click &quot;Add tier&quot; to start. 3 is the typical pattern.</p>
      )}
    </div>
  );
}

export function SyncReviewsButton({ siteId }: { siteId: string }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={async () => {
          setSyncing(true);
          setResult(null);
          try {
            const res = await fetch(`/api/admin/sites/${siteId}/reviews`, {
              method: "POST",
            });
            const data = await res.json();
            setResult(data.added ?? 0);
          } catch { setResult(-1); }
          setSyncing(false);
        }}
        disabled={syncing}
        className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Reviews"}
      </button>
      {result !== null && result >= 0 && (
        <span className="text-[10px] text-success">{result} new review{result !== 1 ? "s" : ""} pulled</span>
      )}
      {result === -1 && <span className="text-[10px] text-danger">Sync failed</span>}
    </div>
  );
}

const CORRECTION_CATEGORIES = [
  { value: "terminology", label: "Terminology" },
  { value: "tone", label: "Tone & Voice" },
  { value: "content", label: "Content Direction" },
  { value: "visual", label: "Visual Style" },
  { value: "factual", label: "Factual Accuracy" },
  { value: "platform", label: "Platform-Specific" },
];

const CORRECTION_SCOPES = [
  { value: "all", label: "All content" },
  { value: "blog", label: "Blog articles" },
  { value: "social", label: "Social captions" },
  { value: "video", label: "Video prompts" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "gbp", label: "Google Business" },
];

interface Correction {
  id: string;
  category: string;
  rule: string;
  scope: string;
  example_before: string | null;
  example_after: string | null;
  source_note: string | null;
  is_active: boolean;
  created_at: string;
}

export function CorrectionsPanel({ siteId }: { siteId: string }) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("terminology");
  const [rule, setRule] = useState("");
  const [scope, setScope] = useState("all");
  const [exBefore, setExBefore] = useState("");
  const [exAfter, setExAfter] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<{ blogPosts: number; captions: number } | null>(null);

  // Load corrections on mount
  useState(() => {
    fetch(`/api/admin/sites/${siteId}/corrections`)
      .then((r) => r.json())
      .then((data) => {
        setCorrections(data.corrections || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  async function previewImpact() {
    const res = await fetch(`/api/admin/sites/${siteId}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, rule, scope, example_before: exBefore, preview_only: true }),
    });
    const data = await res.json();
    setImpact(data.impact);
  }

  async function addCorrection() {
    if (!rule.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/sites/${siteId}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        rule: rule.trim(),
        scope,
        example_before: exBefore.trim() || null,
        example_after: exAfter.trim() || null,
        source_note: sourceNote.trim() || null,
      }),
    });
    const data = await res.json();
    if (data.correction) {
      setCorrections([data.correction, ...corrections]);
      setRule("");
      setExBefore("");
      setExAfter("");
      setSourceNote("");
      setImpact(null);
    }
    setSaving(false);
  }

  async function toggleCorrection(id: string, active: boolean) {
    await fetch(`/api/admin/sites/${siteId}/corrections`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: active }),
    });
    setCorrections(corrections.map((c) => c.id === id ? { ...c, is_active: active } : c));
  }

  const activeCount = corrections.filter((c) => c.is_active).length;

  return (
    <div className="space-y-3">
      {/* Add correction form */}
      <div className="rounded border border-border bg-background p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-muted mb-0.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface-hover px-2 py-1 text-xs text-muted"
            >
              {CORRECTION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] text-muted mb-0.5">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full bg-surface-hover px-2 py-1 text-xs text-muted"
            >
              {CORRECTION_SCOPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[9px] text-muted mb-0.5">Rule</label>
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="Use 'bespoke' instead of 'custom' when describing cabinetry"
            rows={2}
            className="w-full resize-none bg-surface-hover px-2 py-1 text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-muted mb-0.5">Example before</label>
            <input
              value={exBefore}
              onChange={(e) => setExBefore(e.target.value)}
              placeholder="custom cabinets"
              className="w-full bg-surface-hover px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[9px] text-muted mb-0.5">Example after</label>
            <input
              value={exAfter}
              onChange={(e) => setExAfter(e.target.value)}
              placeholder="bespoke cabinetry"
              className="w-full bg-surface-hover px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-[9px] text-muted mb-0.5">Source (tenant request reference)</label>
          <input
            value={sourceNote}
            onChange={(e) => setSourceNote(e.target.value)}
            placeholder="Email from John, April 18"
            className="w-full bg-surface-hover px-2 py-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={previewImpact}
            disabled={!rule.trim()}
            className="bg-surface-hover px-3 py-1 text-[10px] font-medium text-foreground hover:bg-accent hover:text-white disabled:opacity-50"
          >
            Preview Impact
          </button>
          <button
            onClick={addCorrection}
            disabled={!rule.trim() || saving}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add Correction"}
          </button>
          {impact && (
            <span className="text-[10px] text-muted">
              Would affect {impact.blogPosts} article{impact.blogPosts !== 1 ? "s" : ""}, {impact.captions} caption{impact.captions !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Existing corrections */}
      {loading ? (
        <p className="text-[10px] text-muted">Loading...</p>
      ) : corrections.length === 0 ? (
        <p className="text-[10px] text-muted">No corrections yet. Add one when a tenant requests content adjustments.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] text-muted">{activeCount} active correction{activeCount !== 1 ? "s" : ""}</p>
          {corrections.map((c) => (
            <div
              key={c.id}
              className={`rounded border border-border p-2 text-xs ${!c.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
                  {c.category}
                </span>
                <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
                  {c.scope}
                </span>
                <button
                  onClick={() => toggleCorrection(c.id, !c.is_active)}
                  className={`ml-auto text-[9px] ${c.is_active ? "text-danger" : "text-accent"}`}
                >
                  {c.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
              <p className="mt-1">{c.rule}</p>
              {c.example_before && c.example_after && (
                <p className="mt-0.5 text-[10px] text-muted">
                  &quot;{c.example_before}&quot; → &quot;{c.example_after}&quot;
                </p>
              )}
              {c.source_note && (
                <p className="mt-0.5 text-[9px] text-muted">Source: {c.source_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
