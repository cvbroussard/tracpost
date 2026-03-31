"use client";

import { useState } from "react";

interface SiteData {
  name: string;
  url: string | null;
  businessType: string;
  location: string;
  contentVibe: string;
  imageStyle: string;
  imageVariations: string[];
  imageProcessingMode: string;
  autopilotEnabled: boolean;
  cadenceConfig: Record<string, number>;
  blogEnabled: boolean;
  blogTitle: string;
  subdomain: string;
}

interface Counts {
  totalAssets: number;
  uploads: number;
  aiAssets: number;
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  vendors: number;
  corrections: number;
  rewardPrompts: number;
}

interface Platform {
  platform: string;
  account_name: string;
  status: string;
}

function Section({
  title,
  tier,
  defaultOpen = false,
  children,
}: {
  title: string;
  tier: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4"
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
            T{tier}
          </span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[10px] text-muted">{label}</label>
      {children}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-1.5 last:border-0">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-xs font-medium">{value || "—"}</span>
    </div>
  );
}

export function SiteControls({
  siteId,
  site,
  counts,
  platforms,
}: {
  siteId: string;
  site: SiteData;
  counts: Counts;
  platforms: Platform[];
}) {
  const [contentVibe, setContentVibe] = useState(site.contentVibe);
  const [imageStyle, setImageStyle] = useState(site.imageStyle);
  const [variations, setVariations] = useState(site.imageVariations);
  const [processingMode, setProcessingMode] = useState(site.imageProcessingMode);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function saveSection(section: string, data: Record<string, unknown>) {
    setSaving(section);
    setSaved(null);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ...data }),
    });
    setSaving(null);
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  function SaveButton({ section, data }: { section: string; data: Record<string, unknown> }) {
    return (
      <div className="flex items-center gap-2">
        {saving === section && <span className="text-[10px] text-muted">Saving...</span>}
        {saved === section && <span className="text-[10px] text-success">Saved</span>}
        <button
          onClick={() => saveSection(section, data)}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Tier 1: Identity */}
      <Section title="Identity" tier={1} defaultOpen>
        <div className="rounded border border-border bg-background p-3">
          <ReadOnly label="Business Name" value={site.name} />
          <ReadOnly label="Website" value={site.url || ""} />
          <ReadOnly label="Industry" value={site.businessType} />
          <ReadOnly label="Location" value={site.location} />
          <div className="mt-2 border-t border-border pt-2">
            <ReadOnly label="Assets" value={`${counts.totalAssets} (${counts.uploads} uploads, ${counts.aiAssets} AI)`} />
            <ReadOnly label="Blog Posts" value={`${counts.totalPosts} (${counts.publishedPosts} published, ${counts.draftPosts} drafts)`} />
            <ReadOnly label="Vendors" value={counts.vendors} />
            <ReadOnly label="Reward Prompts" value={counts.rewardPrompts} />
            <ReadOnly label="Image Corrections" value={counts.corrections} />
          </div>
        </div>
      </Section>

      {/* Tier 2: Content Direction */}
      <Section title="Content Direction" tier={2}>
        <div className="rounded border border-border bg-background p-3">
          <Field label="Content Vibe — what the content is about">
            <textarea
              value={contentVibe}
              onChange={(e) => setContentVibe(e.target.value)}
              className="w-full text-xs"
              rows={3}
              placeholder="Culinary lifestyle — cooking, entertaining, hosting..."
            />
          </Field>

          <div className="mb-3">
            <ReadOnly label="Reward Prompts" value={`${counts.rewardPrompts} prompts in library`} />
            <p className="mt-1 text-[9px] text-muted">
              Moment: {Math.round(counts.rewardPrompts / 3)} · Lifestyle: {Math.round(counts.rewardPrompts / 3)} · Social Proof: {Math.round(counts.rewardPrompts / 3)}
            </p>
          </div>

          <SaveButton
            section="content"
            data={{ contentVibe, style: imageStyle, variations, processingMode }}
          />
        </div>
      </Section>

      {/* Tier 3: Visual Style */}
      <Section title="Visual Style" tier={3}>
        <div className="rounded border border-border bg-background p-3">
          <Field label="Upload Processing">
            <div className="flex gap-1 text-[10px]">
              {(["auto", "enhance", "off"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setProcessingMode(m)}
                  className={`rounded px-2.5 py-1 ${
                    processingMode === m ? "bg-accent text-white" : "bg-surface-hover text-muted"
                  }`}
                >
                  {m === "auto" ? "Auto" : m === "enhance" ? "Enhance Only" : "Off"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Photography Style — how images look">
            <textarea
              value={imageStyle}
              onChange={(e) => setImageStyle(e.target.value)}
              className="w-full text-xs"
              rows={3}
              placeholder="Natural daylight, neutral warm palette, medium format..."
            />
          </Field>

          <Field label={`Composition Variations (${variations.length})`}>
            <div className="space-y-1">
              {variations.map((v, i) => (
                <div key={i} className="flex gap-1">
                  <span className="mt-1 text-[10px] text-muted">{i + 1}.</span>
                  <input
                    value={v}
                    onChange={(e) => {
                      const updated = [...variations];
                      updated[i] = e.target.value;
                      setVariations(updated);
                    }}
                    className="flex-1 text-[10px]"
                  />
                  <button
                    onClick={() => setVariations(variations.filter((_, idx) => idx !== i))}
                    className="text-[10px] text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {variations.length < 8 && (
                <button
                  onClick={() => setVariations([...variations, ""])}
                  className="text-[10px] text-muted hover:text-foreground"
                >
                  + Add
                </button>
              )}
            </div>
          </Field>

          <SaveButton
            section="visual"
            data={{ contentVibe, style: imageStyle, variations, processingMode }}
          />
        </div>
      </Section>

      {/* Tier 4: Publishing */}
      <Section title="Publishing" tier={4}>
        <div className="rounded border border-border bg-background p-3">
          <ReadOnly label="Autopilot" value={site.autopilotEnabled ? "Active" : "Off"} />
          <ReadOnly label="Blog" value={site.blogEnabled ? "Enabled" : "Disabled"} />
          <ReadOnly label="Blog Title" value={site.blogTitle} />
          <ReadOnly label="Subdomain" value={site.subdomain} />

          {Object.keys(site.cadenceConfig).length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 text-[10px] text-muted">Cadence</p>
              {Object.entries(site.cadenceConfig).map(([platform, count]) => (
                <ReadOnly key={platform} label={platform} value={`${count}/week`} />
              ))}
            </div>
          )}

          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1 text-[10px] text-muted">Connected Platforms ({platforms.length})</p>
            {platforms.map((p) => (
              <div key={p.platform} className="flex items-center justify-between py-1">
                <span className="text-xs">{p.platform}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted">{p.account_name}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-success" : "bg-muted"}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Tier 5: Quality Gates */}
      <Section title="Quality Gates" tier={5}>
        <div className="rounded border border-border bg-background p-3">
          <ReadOnly label="Content Guard" value="Active — zero false positives" />
          <ReadOnly label="Quality Cutoff" value="0.7 (enhance above, regenerate below)" />
          <ReadOnly label="Image Corrections" value={`${counts.corrections} entity corrections`} />
          <ReadOnly label="URL Validation" value="Active — strips 404s before storing" />
          <ReadOnly label="Vendor Detection" value={`${counts.vendors} vendors in recognition dictionary`} />
        </div>
      </Section>
    </div>
  );
}
