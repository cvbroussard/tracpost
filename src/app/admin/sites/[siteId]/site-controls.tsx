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
  videoRatio: string;
  inlineUploadCount: number;
  inlineAiCount: number;
  blogCadence: number;
  articleMix: string;
  customDomain: string | null;
}

interface Counts {
  totalAssets: number;
  uploads: number;
  aiAssets: number;
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  vendors: number;
  projects: number;
  personas: number;
  locations: number;
  corrections: number;
  rewardPrompts: number;
  projectPrompts: number;
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

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

function DomainProvisioning({
  siteId,
  customDomain: initialDomain,
  initialDomainInfo,
  onProvisioned,
}: {
  siteId: string;
  customDomain: string;
  initialDomainInfo?: DomainInfoProps;
  onProvisioned: (blogDomain: string, slug: string, records: DnsRecord[]) => void;
}) {
  const [domainInput, setDomainInput] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [blogDomain, setBlogDomain] = useState(initialDomain || "");
  const [projectsDomain, setProjectsDomain] = useState(
    initialDomain ? initialDomain.replace("blog.", "projects.") : ""
  );
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(
    initialDomainInfo?.dnsRecords || null
  );
  const [blogStatus, setBlogStatus] = useState<"unknown" | "pending" | "active">(
    initialDomainInfo?.blogStatus || "unknown"
  );
  const [projectsStatus, setProjectsStatus] = useState<"unknown" | "pending" | "active">(
    initialDomainInfo?.projectsStatus || "unknown"
  );
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isProvisioned = !!blogDomain;

  async function provision() {
    if (!domainInput) return;
    setProvisioning(true);
    try {
      const res = await fetch("/api/blog/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "provision", site_id: siteId, domain: domainInput }),
      });
      const data = await res.json();
      if (data.success) {
        setBlogDomain(data.blogDomain);
        setProjectsDomain(data.projectsDomain);
        setDnsRecords(data.dnsRecords);
        setBlogStatus(data.blogStatus === "active" ? "active" : "pending");
        setProjectsStatus(data.projectsStatus === "active" ? "active" : "pending");
        onProvisioned(data.blogDomain, data.siteSlug, data.dnsRecords);
      } else {
        alert(data.error || data.message || "Provisioning failed");
      }
    } catch {
      alert("Provisioning request failed");
    } finally {
      setProvisioning(false);
    }
  }

  async function verify() {
    setVerifying(true);
    try {
      const res = await fetch("/api/blog/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", site_id: siteId }),
      });
      const data = await res.json();
      setBlogStatus(
        data.blog?.verified && data.blog?.configured ? "active" : "pending"
      );
      setProjectsStatus(
        data.projects?.verified && data.projects?.configured ? "active" : "pending"
      );
    } catch {
      alert("Verification request failed");
    } finally {
      setVerifying(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function statusBadge(status: "unknown" | "pending" | "active") {
    if (status === "active") return <span className="rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-medium text-success">Active</span>;
    if (status === "pending") return <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-medium text-warning">Pending DNS</span>;
    return <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-medium text-muted">Unverified</span>;
  }

  // Unprovisioned — show input
  if (!isProvisioned) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
            className="bg-surface-hover px-2 py-1 text-xs text-foreground flex-1"
            placeholder="b2construct.com"
          />
          <button
            onClick={provision}
            disabled={provisioning || !domainInput}
            className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {provisioning ? "Provisioning..." : "Provision"}
          </button>
        </div>
        <p className="text-[10px] text-muted">
          Enter the tenant&apos;s root domain. This will register blog.* and projects.* subdomains.
        </p>
      </div>
    );
  }

  // Provisioned — show domains, records, status
  return (
    <div className="space-y-3">
      {/* Domain status rows */}
      <div className="rounded border border-border bg-background">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">{blogDomain}</span>
            {statusBadge(blogStatus)}
          </div>
          <a
            href={`https://${blogDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent hover:underline"
          >
            Open
          </a>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">{projectsDomain}</span>
            {statusBadge(projectsStatus)}
          </div>
          <a
            href={`https://${projectsDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent hover:underline"
          >
            Open
          </a>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={verify}
          disabled={verifying}
          className="bg-surface-hover px-3 py-1 text-[10px] font-medium text-foreground hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {verifying ? "Checking..." : "Verify DNS"}
        </button>
        <button
          onClick={async () => {
            setSending(true);
            setSent(false);
            try {
              const records = dnsRecords || defaultRecords();
              const res = await fetch("/api/blog/domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send-dns", site_id: siteId, dnsRecords: records }),
              });
              const data = await res.json();
              if (data.sent) {
                setSent(true);
              } else {
                alert(data.error || "Failed to send email");
              }
            } catch {
              alert("Failed to send email");
            } finally {
              setSending(false);
            }
          }}
          disabled={sending}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send to Tenant"}
        </button>
        {sent && <span className="text-[10px] text-success">Email sent</span>}
        {blogStatus === "active" && projectsStatus === "active" && (
          <span className="text-[10px] text-success">All domains verified</span>
        )}
      </div>

      {/* DNS records — always visible when provisioned */}
      <div className="rounded border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-medium">DNS Records for Tenant</span>
          <button
            onClick={() => {
              const text = (dnsRecords || defaultRecords()).map(r =>
                `${r.type}\t${r.name}\t${r.value}`
              ).join("\n");
              copyToClipboard(text, "all");
            }}
            className="text-[10px] text-accent hover:underline"
          >
            {copied === "all" ? "Copied!" : "Copy all"}
          </button>
        </div>
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left py-1 pr-2 w-12">Type</th>
              <th className="text-left py-1 pr-2">Name</th>
              <th className="text-left py-1 pr-2">Value</th>
              <th className="text-left py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {(dnsRecords || defaultRecords()).map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-2 font-mono font-medium">{r.type}</td>
                <td className="py-1.5 pr-2 font-mono">{r.name}</td>
                <td className="py-1.5 pr-2 font-mono break-all text-muted">{r.value}</td>
                <td className="py-1.5">
                  <button
                    onClick={() => copyToClipboard(r.value, `row-${i}`)}
                    className="text-[9px] text-muted hover:text-accent"
                  >
                    {copied === `row-${i}` ? "!" : "copy"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 space-y-1 text-[9px] text-muted">
          <p>Forward these records to the tenant or their DNS provider.</p>
          <p>If tenant uses Cloudflare: CNAME records must be set to <strong>DNS only</strong> (grey cloud, not proxied).</p>
          {(dnsRecords || defaultRecords()).some(r => r.type === "TXT") && (
            <p>TXT ownership records can be deleted after verification completes.</p>
          )}
        </div>
      </div>
    </div>
  );

  function defaultRecords(): DnsRecord[] {
    return [
      { type: "CNAME", name: "blog", value: "cname.vercel-dns.com", purpose: "Blog subdomain" },
      { type: "CNAME", name: "projects", value: "cname.vercel-dns.com", purpose: "Projects subdomain" },
    ];
  }
}

function WebsiteSpinner({ siteId }: { siteId: string }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; url?: string; pages?: number; error?: string } | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setSpinning(true);
            setResult(null);
            try {
              const res = await fetch("/api/admin/website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ site_id: siteId, action: "generate" }),
              });
              const data = await res.json();
              setResult(data);
            } catch {
              setResult({ success: false, error: "Request failed" });
            } finally {
              setSpinning(false);
            }
          }}
          disabled={spinning}
          className="bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {spinning ? "Generating..." : "Generate & Deploy"}
        </button>
        {spinning && <span className="text-[10px] text-muted">This may take 30-60 seconds...</span>}
      </div>
      {result && (
        <div className={`mt-2 rounded p-2 text-[10px] ${result.success ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {result.success ? (
            <div>
              <span className="font-medium">Deployed {result.pages} pages</span>
              {result.url && (
                <span> — <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">{result.url}</a></span>
              )}
            </div>
          ) : (
            <span>{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
}

interface NavLink {
  label: string;
  href: string;
}

interface DomainInfoProps {
  blogStatus: "unknown" | "pending" | "active";
  projectsStatus: "unknown" | "pending" | "active";
  blogCnameTarget: string;
  projectsCnameTarget: string;
  dnsRecords: DnsRecord[];
}

export function SiteControls({
  siteId,
  site,
  counts,
  platforms,
  rewardPrompts = [],
  projects = [],
  navLinks: initialNavLinks = [],
  domainInfo,
}: {
  siteId: string;
  site: SiteData;
  counts: Counts;
  platforms: Platform[];
  rewardPrompts?: Array<{ category: string; scene: string; prompt: string; visual: string }>;
  projects?: ProjectInfo[];
  navLinks?: NavLink[];
  domainInfo?: DomainInfoProps | null;
}) {
  const [contentVibe, setContentVibe] = useState(site.contentVibe);
  const [imageStyle, setImageStyle] = useState(site.imageStyle);
  const [variations, setVariations] = useState(site.imageVariations);
  const [processingMode, setProcessingMode] = useState(site.imageProcessingMode);
  const [videoRatio, setVideoRatio] = useState(site.videoRatio || "1:3");
  const [inlineUploadCount, setInlineUploadCount] = useState(site.inlineUploadCount ?? 1);
  const [inlineAiCount, setInlineAiCount] = useState(site.inlineAiCount ?? 3);
  const [saving, setSaving] = useState<string | null>(null);
  const [generatingEditorial, setGeneratingEditorial] = useState(false);
  const [generatingProject, setGeneratingProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState(projects[0]?.id || "");
  const [blogCadence, setBlogCadence] = useState(site.blogCadence || 0);
  const [articleRatio, setArticleRatio] = useState(site.articleMix || "3:1");
  const [projectPrompts, setProjectPrompts] = useState<Array<{ title: string; angle: string; assetHint: string }> | null>(null);
  const [loadingProjectPrompts, setLoadingProjectPrompts] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [promptFilter, setPromptFilter] = useState("all");
  const [autopilotEnabled, setAutopilotEnabled] = useState(site.autopilotEnabled);
  const [blogSlug, setBlogSlug] = useState(site.subdomain || "");
  const [navLinks, setNavLinks] = useState<NavLink[]>(initialNavLinks);
  const [customDomain, setCustomDomain] = useState(site.customDomain || "");
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);
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
            <ReadOnly label="Projects" value={counts.projects} />
            <ReadOnly label="Personas" value={counts.personas} />
            <ReadOnly label="Reward Prompts" value={counts.rewardPrompts} />
            <ReadOnly label="Project Prompts" value={counts.projectPrompts} />
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
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-muted">Reward Prompts</span>
              <button
                onClick={() => setShowPrompts(true)}
                className="text-[10px] text-accent hover:underline"
              >
                View {counts.rewardPrompts} prompts
              </button>
            </div>
            <p className="mt-1 text-[9px] text-muted">
              Moment: {rewardPrompts.filter(p => p.category === "moment").length} · Lifestyle: {rewardPrompts.filter(p => p.category === "lifestyle").length} · Social Proof: {rewardPrompts.filter(p => p.category === "social_proof").length}
            </p>
          </div>

          {/* Reward Prompts Modal */}
          {showPrompts && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8"
              onClick={() => setShowPrompts(false)}
            >
              <div
                className="w-full max-w-2xl rounded-lg border border-border bg-surface"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold">Reward Prompt Library ({rewardPrompts.length})</h3>
                  <button onClick={() => setShowPrompts(false)} className="text-muted hover:text-foreground">✕</button>
                </div>
                <div className="border-b border-border px-4 py-2">
                  <div className="flex gap-1">
                    {["all", "moment", "lifestyle", "social_proof"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setPromptFilter(cat)}
                        className={`rounded px-2 py-1 text-[10px] ${promptFilter === cat ? "bg-accent text-white" : "bg-surface-hover text-muted"}`}
                      >
                        {cat === "all" ? "All" : cat === "social_proof" ? "Social Proof" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-4 py-2">
                  {rewardPrompts
                    .filter((p) => promptFilter === "all" || p.category === promptFilter)
                    .map((p, i) => (
                      <div key={i} className="border-b border-border py-2 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                            p.category === "moment" ? "bg-accent/10 text-accent"
                              : p.category === "lifestyle" ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning"
                          }`}>
                            {p.category}
                          </span>
                          <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
                            {p.scene}
                          </span>
                        </div>
                        <p className="text-xs">{p.prompt}</p>
                        <p className="mt-0.5 text-[10px] text-muted">{p.visual}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

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

          <Field label="Image Mix Per Article">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-[9px] text-muted mb-0.5">Uploads</label>
                <select
                  key="upload-count"
                  value={inlineUploadCount}
                  onChange={(e) => setInlineUploadCount(Number(e.target.value))}
                  className="bg-surface-hover px-2 py-1 text-xs text-muted"
                >
                  {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-muted mb-0.5">AI Editorial</label>
                <select
                  key="ai-count"
                  value={inlineAiCount}
                  onChange={(e) => setInlineAiCount(Number(e.target.value))}
                  className="bg-surface-hover px-2 py-1 text-xs text-muted"
                >
                  {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="text-[9px] text-muted mt-3">
                = {1 + inlineUploadCount + inlineAiCount} total (hero + {inlineUploadCount} upload + {inlineAiCount} AI)
              </div>
              <SaveButton section="mix" data={{ inlineUploadCount, inlineAiCount }} />
            </div>
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
          <Field label="Autopilot">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next = !autopilotEnabled;
                  setAutopilotEnabled(next);
                  saveSection("autopilot", { autopilotEnabled: next });
                }}
                className={`px-3 py-1 text-[10px] font-medium ${autopilotEnabled ? "bg-success text-white" : "bg-surface-hover text-muted"}`}
              >
                {autopilotEnabled ? "Active" : "Off"}
              </button>
              {saving === "autopilot" && <span className="text-[10px] text-muted">Saving...</span>}
              {saved === "autopilot" && <span className="text-[10px] text-success">Saved</span>}
            </div>
          </Field>
          <ReadOnly label="Blog" value={site.blogEnabled ? "Enabled" : "Disabled"} />
          <ReadOnly label="Blog Title" value={site.blogTitle} />
          <Field label="Blog Slug">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">tracpost.com/blog/</span>
              <input
                type="text"
                value={blogSlug}
                onChange={(e) => setBlogSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="bg-surface-hover px-2 py-1 text-xs text-foreground w-32"
                placeholder="siteslug"
              />
              <SaveButton section="blogSlug" data={{ blogSlug }} />
              {blogSlug && (
                <a
                  href={`https://tracpost.com/blog/${blogSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-accent hover:underline"
                >
                  Open
                </a>
              )}
            </div>
          </Field>

          <Field label="Nav Links">
            <div className="space-y-1.5">
              {navLinks.map((link, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => {
                      const updated = [...navLinks];
                      updated[i] = { ...updated[i], label: e.target.value };
                      setNavLinks(updated);
                    }}
                    className="bg-surface-hover px-2 py-1 text-xs text-foreground w-full"
                    placeholder="Label"
                  />
                  <input
                    type="text"
                    value={link.href}
                    onChange={(e) => {
                      const updated = [...navLinks];
                      updated[i] = { ...updated[i], href: e.target.value };
                      setNavLinks(updated);
                    }}
                    className="bg-surface-hover px-2 py-1 text-xs text-foreground w-full"
                    placeholder="https://..."
                  />
                  <button
                    onClick={() => setNavLinks(navLinks.filter((_, j) => j !== i))}
                    className="text-[10px] text-muted hover:text-foreground px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setNavLinks([...navLinks, { label: "", href: "" }])}
                  className="text-[10px] text-accent hover:underline"
                >
                  + Add link
                </button>
                <SaveButton section="navLinks" data={{ navLinks }} />
              </div>
            </div>
          </Field>

          <Field label="Custom Domains">
            <DomainProvisioning
              siteId={siteId}
              customDomain={customDomain}
              initialDomainInfo={domainInfo || undefined}
              onProvisioned={(blogDomain, slug, records) => {
                setCustomDomain(blogDomain);
                setBlogSlug(slug);
                setDnsRecords(records);
              }}
            />
          </Field>

          <Field label="Video Ratio — 1 video post per N posts">
            <div className="flex items-center gap-2">
              <select
                value={videoRatio}
                onChange={(e) => setVideoRatio(e.target.value)}
                className="bg-surface-hover px-2 py-1 text-xs text-muted"
              >
                <option value="1:1">Every post</option>
                <option value="1:2">1 in 2</option>
                <option value="1:3">1 in 3</option>
                <option value="1:4">1 in 4</option>
                <option value="1:5">1 in 5</option>
                <option value="0:1">No video</option>
              </select>
              <SaveButton section="video" data={{ videoRatio }} />
            </div>
          </Field>

          <Field label="Blog Cadence — articles per week">
            <div className="flex items-center gap-2">
              <select
                value={blogCadence}
                onChange={(e) => setBlogCadence(Number(e.target.value))}
                className="bg-surface-hover px-2 py-1 text-xs text-muted"
              >
                <option value={0}>Off</option>
                <option value={1}>1/week</option>
                <option value={2}>2/week</option>
                <option value={3}>3/week</option>
                <option value={5}>5/week (daily weekdays)</option>
                <option value={7}>7/week (daily)</option>
              </select>
              <SaveButton section="blogCadence" data={{ blogCadence }} />
            </div>
          </Field>

          <Field label="Article Mix — editorial to project ratio">
            <div className="flex items-center gap-2">
              <select
                value={articleRatio}
                onChange={(e) => setArticleRatio(e.target.value)}
                className="bg-surface-hover px-2 py-1 text-xs text-muted"
              >
                <option value="1:0">Editorial only</option>
                <option value="3:1">3 editorial : 1 project</option>
                <option value="2:1">2 editorial : 1 project</option>
                <option value="1:1">Balanced</option>
                <option value="1:2">1 editorial : 2 project</option>
                <option value="0:1">Project only</option>
              </select>
              <SaveButton section="articleRatio" data={{ articleRatio }} />
            </div>
          </Field>

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

      <Section title="Generate Content" tier={0}>
        <div className="rounded border border-border bg-background p-3 space-y-4">
          {/* Editorial Article */}
          <div>
            <p className="mb-2 text-xs font-medium">Editorial Article</p>
            <p className="mb-2 text-[10px] text-muted">
              Generate a general authority article from reward prompts ({counts.rewardPrompts} available).
            </p>
            <button
              onClick={async () => {
                setGeneratingEditorial(true);
                try {
                  const res = await fetch(`/api/blog?site_id=${siteId}&action=generate`, { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    alert(`Article created: "${data.title || "New article"}" — check the Blog page`);
                  } else {
                    alert(data.error || "Generation failed");
                  }
                } catch { alert("Request failed"); }
                setGeneratingEditorial(false);
              }}
              disabled={generatingEditorial || counts.rewardPrompts === 0}
              className="bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {generatingEditorial ? "Writing..." : "Write Editorial Article"}
            </button>
          </div>

          {/* Project Article */}
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium">Project Article</p>
            <p className="mb-2 text-[10px] text-muted">
              Generate an article from a project&apos;s captioned assets ({counts.projects} projects).
            </p>
            {projects.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="bg-surface-hover px-2 py-1 text-xs text-muted"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!selectedProject) return;
                    setGeneratingProject(true);
                    try {
                      const res = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
                      const data = await res.json();
                      if (res.ok && data.status === "prompts_generated") {
                        const res2 = await fetch(`/api/projects/${selectedProject}/generate-article`, { method: "POST" });
                        const data2 = await res2.json();
                        if (res2.ok && data2.article) {
                          alert(`Article created: "${data2.article.title}" — check the Blog page`);
                        } else {
                          alert(data2.error || "Generation failed");
                        }
                      } else if (res.ok && data.article) {
                        alert(`Article created: "${data.article.title}" — check the Blog page`);
                      } else {
                        alert(data.error || "Generation failed");
                      }
                    } catch { alert("Request failed"); }
                    setGeneratingProject(false);
                  }}
                  disabled={generatingProject}
                  className="bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {generatingProject ? "Writing..." : "Write Project Article"}
                </button>
                <button
                  onClick={async () => {
                    if (!selectedProject) return;
                    setLoadingProjectPrompts(true);
                    try {
                      const res = await fetch(`/api/projects/${selectedProject}/generate-article`);
                      if (res.ok) {
                        const data = await res.json();
                        setProjectPrompts(data.prompts || []);
                      }
                    } catch { /* ignore */ }
                    setLoadingProjectPrompts(false);
                  }}
                  disabled={loadingProjectPrompts}
                  className="text-[10px] text-accent hover:underline disabled:opacity-50"
                >
                  {loadingProjectPrompts ? "Loading..." : "View prompts"}
                </button>
              </div>

              {/* Project prompts list */}
              {projectPrompts && (
                <div className="mt-3 rounded border border-border bg-background p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-medium">{projectPrompts.length} article angles</span>
                    <button onClick={() => setProjectPrompts(null)} className="text-[10px] text-muted hover:text-foreground">Close</button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {projectPrompts.map((p, i) => (
                      <div key={i} className="border-b border-border pb-2 last:border-0">
                        <p className="text-xs font-medium">{p.title}</p>
                        <p className="text-[10px] text-muted">{p.angle}</p>
                        <p className="text-[9px] text-dim">Hint: {p.assetHint}</p>
                      </div>
                    ))}
                    {projectPrompts.length === 0 && (
                      <p className="text-[10px] text-muted">No prompts generated yet — click Write Project Article to generate them.</p>
                    )}
                  </div>
                </div>
              )}
            </>
            ) : (
              <p className="text-[10px] text-dim">No projects configured for this site.</p>
            )}
          </div>
        </div>
      </Section>

      {/* Website Spinner */}
      <Section title="Website" tier={0}>
        <div className="rounded border border-border bg-background p-3">
          <p className="mb-2 text-xs font-medium">Generate Website</p>
          <p className="mb-3 text-[10px] text-muted">
            Generate a complete static website from the brand playbook, assets, and entities.
            Deploys as a separate Vercel project.
          </p>
          <WebsiteSpinner siteId={siteId} />
        </div>
      </Section>
    </div>
  );
}
