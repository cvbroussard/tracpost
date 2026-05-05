"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PostTemplate {
  id: string;
  platform: string;
  format: string;
  name: string;
  description: string | null;
  assetSlots: Record<string, unknown>;
  metadataRequirements: Record<string, unknown>;
  sortOrder: number;
}

interface ComposeClientProps {
  siteId: string;
}

/**
 * Phase 2a — template picker only.
 *
 * Subscriber sees the list of templates available based on their
 * connected platforms (+ Blog always available). Clicking a template
 * is the SELECT step. Recommend / Review / Trigger steps land in
 * subsequent phases.
 */
export function ComposeClient({ siteId: _siteId }: ComposeClientProps) {
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PostTemplate | null>(null);

  useEffect(() => {
    fetch("/api/compose/templates")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => {
        setTemplates(d.templates);
        setConnectedPlatforms(d.connectedPlatforms);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  // Group templates by platform for the picker.
  const grouped: Record<string, PostTemplate[]> = {};
  for (const t of templates) {
    if (!grouped[t.platform]) grouped[t.platform] = [];
    grouped[t.platform].push(t);
  }
  const platformsInOrder = Object.keys(grouped).sort();

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Compose</h1>
          <p className="text-xs text-muted mt-0.5">
            Pick a template — TracPost will assemble the rest.
          </p>
        </div>
        {selectedTemplate && (
          <button
            onClick={() => setSelectedTemplate(null)}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            ← Back to templates
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : selectedTemplate ? (
        // SELECT step complete — placeholder for the Recommend → Review → Trigger steps that land in subsequent phases.
        <SelectedTemplateView template={selectedTemplate} />
      ) : templates.length === 0 ? (
        <NoTemplatesEmpty connectedCount={connectedPlatforms.length} />
      ) : (
        <TemplatePicker
          grouped={grouped}
          platformsInOrder={platformsInOrder}
          onSelect={setSelectedTemplate}
        />
      )}
    </div>
  );
}

function TemplatePicker({
  grouped,
  platformsInOrder,
  onSelect,
}: {
  grouped: Record<string, PostTemplate[]>;
  platformsInOrder: string[];
  onSelect: (t: PostTemplate) => void;
}) {
  return (
    <div className="space-y-6">
      {platformsInOrder.map((platform) => (
        <section key={platform}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {prettyPlatformName(platform)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[platform].map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className="group text-left rounded-xl border border-border bg-surface p-4 shadow-card hover:border-accent hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-muted">{t.format}</span>
                  <span className="text-[10px] text-muted group-hover:text-accent transition-colors">
                    Pick →
                  </span>
                </div>
                <div className="text-sm font-semibold mb-1">{t.name}</div>
                {t.description && (
                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{t.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SelectedTemplateView({ template }: { template: PostTemplate }) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 space-y-3">
      <div>
        <p className="text-xs text-muted">Selected template</p>
        <h2 className="text-lg font-semibold mt-0.5">{template.name}</h2>
        <p className="text-xs text-muted mt-1">
          <span className="font-mono">{template.platform}</span> ·{" "}
          <span className="font-mono">{template.format}</span>
        </p>
      </div>
      {template.description && (
        <p className="text-sm text-foreground leading-relaxed">{template.description}</p>
      )}
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        <strong>Recommend → Review → Trigger</strong> steps land in subsequent phases.
        Today this is just the SELECT-step demonstration of the unified composer.
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground">
          Asset slots & metadata requirements
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-surface-hover p-2 text-[11px]">
{JSON.stringify({ assetSlots: template.assetSlots, metadataRequirements: template.metadataRequirements }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function NoTemplatesEmpty({ connectedCount }: { connectedCount: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center">
      <p className="text-sm font-medium mb-2">No templates available yet</p>
      <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
        {connectedCount === 0
          ? "Connect at least one social platform to see publishing templates here. Blog templates are available without any external connection."
          : "Templates exist for your connected platforms but couldn't be loaded. Try refreshing."}
      </p>
      <Link
        href="/dashboard/accounts"
        className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Manage Connections
      </Link>
    </div>
  );
}

function prettyPlatformName(slug: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    pinterest: "Pinterest",
    blog: "Blog",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    gbp: "Google Business Profile",
    twitter: "X (Twitter)",
  };
  return map[slug] ?? slug;
}
