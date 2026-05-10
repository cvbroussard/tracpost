"use client";

import { useState } from "react";

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  description: string | null;
  hero_asset_id: string | null;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  address: string | null;
  description: string | null;
  caption_mode: string;
  manual_caption_count: number;
  hero_asset_id: string | null;
  metadata: Record<string, unknown>;
}

interface CaptionStatus {
  total_assets: number;
  captioned: number;
  uncaptioned: number;
}

interface Persona {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  type: string;
  consent_given: boolean;
  description: string | null;
  visual_cues: string[];
  narrative_context: string | null;
  relationships: Record<string, unknown>;
  appearance_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  hero_asset_id: string | null;
  metadata: Record<string, unknown>;
}

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  phone: string | null;
  hours: Record<string, unknown>;
  gbp_location_id: string | null;
  is_primary: boolean;
  hero_asset_id: string | null;
  metadata: Record<string, unknown>;
}

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_range: string | null;
  duration: string | null;
  display_order: number;
  hero_asset_id: string | null;
  metadata: Record<string, unknown>;
  source: string;
}

interface ServiceArea {
  overlay_id: string;
  canonical_id: string;
  name: string;
  slug: string;
  kind: string;
  parent_region_id: string | null;
  place_id: string | null;
  boundary_geojson: Record<string, unknown> | null;
  is_active: boolean;
  hero_asset_id: string | null;
  site_notes: string | null;
  custom_description: string | null;
}

interface Labels {
  brand_label: string | null;
  project_label: string | null;
  persona_label: string | null;
  branch_label: string | null;
  service_area_label: string | null;
  service_label: string | null;
}

type TagGroup = "brands" | "services" | "projects" | "personas" | "branches" | "service_areas";

const SECTIONS: { key: TagGroup; labelKey: keyof Labels; defaultLabel: string }[] = [
  { key: "brands", labelKey: "brand_label", defaultLabel: "Brands" },
  { key: "services", labelKey: "service_label", defaultLabel: "Services" },
  { key: "projects", labelKey: "project_label", defaultLabel: "Projects" },
  { key: "personas", labelKey: "persona_label", defaultLabel: "Personas" },
  { key: "branches", labelKey: "branch_label", defaultLabel: "Branches" },
  { key: "service_areas", labelKey: "service_area_label", defaultLabel: "Service Areas" },
];

function jsonStringify(v: unknown): string {
  try { return JSON.stringify(v ?? {}, null, 2); } catch { return "{}"; }
}

function safeParseJSON(text: string): { ok: boolean; value: unknown; error?: string } {
  try { return { ok: true, value: JSON.parse(text) }; } catch (e) { return { ok: false, value: null, error: (e as Error).message }; }
}

export function TaggingManager({
  siteId,
  labels: initialLabels,
  brands: initialBrands,
  projects: initialProjects,
  personas: initialPersonas,
  branches: initialBranches,
  services: initialServices,
  serviceAreas: initialServiceAreas,
}: {
  siteId: string;
  labels: Labels;
  brands: Brand[];
  projects: Project[];
  personas: Persona[];
  branches: Branch[];
  services: Service[];
  serviceAreas: ServiceArea[];
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [brands, setBrands] = useState(initialBrands);
  const [projects, setProjects] = useState(initialProjects);
  const [personas, setPersonas] = useState(initialPersonas);
  const [branches, setBranches] = useState(initialBranches);
  const [services, setServices] = useState(initialServices);
  const [serviceAreas, setServiceAreas] = useState(initialServiceAreas);
  const [showConfig, setShowConfig] = useState(false);

  // Caption status per project
  const [captionStatuses, setCaptionStatuses] = useState<Record<string, CaptionStatus>>({});
  const [autoCaptioning, setAutoCaptioning] = useState<string | null>(null);

  useState(() => {
    for (const p of initialProjects) {
      fetch(`/api/projects/${p.id}/captions`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setCaptionStatuses((prev) => ({ ...prev, [p.id]: data })); })
        .catch(() => {});
    }
  });

  async function autoCaptionAll(projectId: string) {
    setAutoCaptioning(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/captions`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCaptionStatuses((prev) => ({
          ...prev,
          [projectId]: {
            ...prev[projectId],
            uncaptioned: (prev[projectId]?.uncaptioned || 0) - (data.generated || 0),
            captioned: (prev[projectId]?.captioned || 0) + (data.generated || 0),
          },
        }));
      }
    } catch { /* ignore */ }
    setAutoCaptioning(null);
  }

  const [configLabels, setConfigLabels] = useState({ ...initialLabels });
  const [savingConfig, setSavingConfig] = useState(false);

  // Show ALL tabs in beta — even ones with no label set, so subscribers can see what's available
  const [activeTab, setActiveTab] = useState<TagGroup>("brands");

  const [adding, setAdding] = useState(false);

  // ── Add form state per entity ─────────────────────────────────────────
  // Brand form
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandUrl, setNewBrandUrl] = useState("");
  const [newBrandDesc, setNewBrandDesc] = useState("");
  const [newBrandHero, setNewBrandHero] = useState("");

  // Service form
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServiceOrder, setNewServiceOrder] = useState("");
  const [newServiceHero, setNewServiceHero] = useState("");

  // Project form
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState("active");
  const [newProjectStart, setNewProjectStart] = useState("");
  const [newProjectEnd, setNewProjectEnd] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectHero, setNewProjectHero] = useState("");
  const [newProjectMode, setNewProjectMode] = useState("seeding");

  // Persona form
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaDisplay, setNewPersonaDisplay] = useState("");
  const [newPersonaType, setNewPersonaType] = useState("person");
  const [newPersonaConsent, setNewPersonaConsent] = useState(false);
  const [newPersonaDesc, setNewPersonaDesc] = useState("");
  const [newPersonaCues, setNewPersonaCues] = useState("");
  const [newPersonaNarrative, setNewPersonaNarrative] = useState("");
  const [newPersonaHero, setNewPersonaHero] = useState("");

  // Branch form
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");
  const [newBranchState, setNewBranchState] = useState("");
  const [newBranchDesc, setNewBranchDesc] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [newBranchGbp, setNewBranchGbp] = useState("");
  const [newBranchPrimary, setNewBranchPrimary] = useState(false);
  const [newBranchHero, setNewBranchHero] = useState("");

  // Service Area form
  const [newSAName, setNewSAName] = useState("");
  const [newSAKind, setNewSAKind] = useState("city");
  const [newSAPlaceId, setNewSAPlaceId] = useState("");
  const [newSADesc, setNewSADesc] = useState("");
  const [newSANotes, setNewSANotes] = useState("");
  const [newSAHero, setNewSAHero] = useState("");

  // Edit state
  const [editing, setEditing] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/tagging/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          brand_label: configLabels.brand_label?.trim() || null,
          project_label: configLabels.project_label?.trim() || null,
          persona_label: configLabels.persona_label?.trim() || null,
          branch_label: configLabels.branch_label?.trim() || null,
          service_area_label: configLabels.service_area_label?.trim() || null,
          service_label: configLabels.service_label?.trim() || null,
        }),
      });
      if (res.ok) {
        setLabels({
          brand_label: configLabels.brand_label?.trim() || null,
          project_label: configLabels.project_label?.trim() || null,
          persona_label: configLabels.persona_label?.trim() || null,
          branch_label: configLabels.branch_label?.trim() || null,
          service_area_label: configLabels.service_area_label?.trim() || null,
          service_label: configLabels.service_label?.trim() || null,
        });
        setShowConfig(false);
      }
    } finally {
      setSavingConfig(false);
    }
  }

  async function addBrand() {
    if (!newBrandName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBrandName.trim(),
          url: newBrandUrl.trim() || null,
          description: newBrandDesc.trim() || null,
          hero_asset_id: newBrandHero.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBrands((prev) => [...prev, data.brand].sort((a, b) => a.name.localeCompare(b.name)));
        setNewBrandName(""); setNewBrandUrl(""); setNewBrandDesc(""); setNewBrandHero("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addService() {
    if (!newServiceName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceName.trim(),
          description: newServiceDesc.trim() || null,
          price_range: newServicePrice.trim() || null,
          duration: newServiceDuration.trim() || null,
          display_order: parseInt(newServiceOrder) || 0,
          hero_asset_id: newServiceHero.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setServices((prev) => [...prev, data.service].sort((a, b) => (a.display_order - b.display_order) || a.name.localeCompare(b.name)));
        setNewServiceName(""); setNewServiceDesc(""); setNewServicePrice(""); setNewServiceDuration(""); setNewServiceOrder(""); setNewServiceHero("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addProject() {
    if (!newProjectName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName.trim(),
          status: newProjectStatus,
          start_date: newProjectStart || null,
          end_date: newProjectEnd || null,
          address: newProjectAddress.trim() || null,
          description: newProjectDesc.trim() || null,
          hero_asset_id: newProjectHero.trim() || null,
          caption_mode: newProjectMode,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [...prev, data.project].sort((a, b) => a.name.localeCompare(b.name)));
        setNewProjectName(""); setNewProjectStatus("active"); setNewProjectStart(""); setNewProjectEnd("");
        setNewProjectAddress(""); setNewProjectDesc(""); setNewProjectHero(""); setNewProjectMode("seeding");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addPersona() {
    if (!newPersonaName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPersonaName.trim(),
          display_name: newPersonaDisplay.trim() || null,
          type: newPersonaType,
          consent_given: newPersonaConsent,
          description: newPersonaDesc.trim() || null,
          visual_cues: newPersonaCues.trim() || null,
          narrative_context: newPersonaNarrative.trim() || null,
          hero_asset_id: newPersonaHero.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPersonas((prev) => [...prev, data.client].sort((a: Persona, b: Persona) => a.name.localeCompare(b.name)));
        setNewPersonaName(""); setNewPersonaDisplay(""); setNewPersonaType("person"); setNewPersonaConsent(false);
        setNewPersonaDesc(""); setNewPersonaCues(""); setNewPersonaNarrative(""); setNewPersonaHero("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addBranch() {
    if (!newBranchName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBranchName.trim(),
          address: newBranchAddress.trim() || null,
          city: newBranchCity.trim() || null,
          state: newBranchState.trim() || null,
          description: newBranchDesc.trim() || null,
          phone: newBranchPhone.trim() || null,
          gbp_location_id: newBranchGbp.trim() || null,
          is_primary: newBranchPrimary,
          hero_asset_id: newBranchHero.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBranches((prev) => [...prev, data.branch].sort((a, b) => a.name.localeCompare(b.name)));
        setNewBranchName(""); setNewBranchAddress(""); setNewBranchCity(""); setNewBranchState("");
        setNewBranchDesc(""); setNewBranchPhone(""); setNewBranchGbp(""); setNewBranchPrimary(false); setNewBranchHero("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addServiceArea() {
    if (!newSAName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/service-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSAName.trim(),
          kind: newSAKind,
          place_id: newSAPlaceId.trim() || null,
          custom_description: newSADesc.trim() || null,
          site_notes: newSANotes.trim() || null,
          hero_asset_id: newSAHero.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setServiceAreas((prev) => [...prev, data.service_area].sort((a, b) => a.name.localeCompare(b.name)));
        setNewSAName(""); setNewSAKind("city"); setNewSAPlaceId(""); setNewSADesc(""); setNewSANotes(""); setNewSAHero("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function updateItem(type: TagGroup, id: string) {
    const apiPath = type === "personas" ? "clients" : type === "service_areas" ? "service-areas" : type;
    try {
      const res = await fetch(`/api/${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      if (res.ok) {
        const data = await res.json();
        const key = type === "brands" ? "brand"
                  : type === "projects" ? "project"
                  : type === "personas" ? "client"
                  : type === "branches" ? "branch"
                  : type === "services" ? "service"
                  : "service_area";
        const updated = data[key];
        if (type === "brands") setBrands((prev) => prev.map((e) => e.id === id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "services") setServices((prev) => prev.map((e) => e.id === id ? updated : e));
        if (type === "projects") setProjects((prev) => prev.map((e) => e.id === id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "personas") setPersonas((prev) => prev.map((e) => e.id === id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "branches") setBranches((prev) => prev.map((e) => e.id === id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "service_areas") setServiceAreas((prev) => prev.map((e) => e.overlay_id === id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
        setEditing(null);
      }
    } catch { /* ignore */ }
  }

  async function deleteItem(type: TagGroup, id: string) {
    const apiPath = type === "personas" ? "clients" : type === "service_areas" ? "service-areas" : type;
    try {
      await fetch(`/api/${apiPath}/${id}`, { method: "DELETE" });
      if (type === "brands") setBrands((prev) => prev.filter((e) => e.id !== id));
      if (type === "services") setServices((prev) => prev.filter((e) => e.id !== id));
      if (type === "projects") setProjects((prev) => prev.filter((e) => e.id !== id));
      if (type === "personas") setPersonas((prev) => prev.filter((e) => e.id !== id));
      if (type === "branches") setBranches((prev) => prev.filter((e) => e.id !== id));
      if (type === "service_areas") setServiceAreas((prev) => prev.filter((e) => e.overlay_id !== id));
    } catch { /* ignore */ }
  }

  function getItemCount(key: TagGroup) {
    if (key === "brands") return brands.length;
    if (key === "services") return services.length;
    if (key === "projects") return projects.length;
    if (key === "personas") return personas.length;
    if (key === "branches") return branches.length;
    if (key === "service_areas") return serviceAreas.length;
    return 0;
  }

  const currentSection = SECTIONS.find((s) => s.key === activeTab)!;
  const currentLabel = labels[currentSection.labelKey] || currentSection.defaultLabel;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tagging</h1>
          <p className="mt-1 text-sm text-muted">Manage the tag groups your assets get tagged with. Each tab is a tag group used by the orchestrator to shape generated content. Beta build — all fields and tabs exposed.</p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs text-muted hover:text-foreground"
        >
          {showConfig ? "Done" : "Configure tag group labels"}
        </button>
      </div>

      {showConfig && (
        <div className="mb-8 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-4 text-sm font-medium">Tag Group Labels (rename per business)</h3>
          <div className="space-y-3">
            {SECTIONS.map((s) => (
              <div key={s.labelKey} className="flex items-center gap-3">
                <span className="w-32 text-xs text-dim">{s.defaultLabel}</span>
                <input
                  value={configLabels[s.labelKey] || ""}
                  onChange={(e) => setConfigLabels((prev) => ({ ...prev, [s.labelKey]: e.target.value }))}
                  placeholder={`Label (defaults to "${s.defaultLabel}")`}
                  className="flex-1 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {savingConfig ? "Saving..." : "Save Configuration"}
            </button>
            <button
              onClick={() => { setShowConfig(false); setConfigLabels({ ...labels }); }}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === s.key
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {labels[s.labelKey] || s.defaultLabel}
            <span className="ml-2 text-xs text-dim">{getItemCount(s.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Brands tab ────────────────────────────────────────────────── */}
      {activeTab === "brands" && (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} className="flex-1 text-sm" placeholder="Brand name" />
              <input value={newBrandUrl} onChange={(e) => setNewBrandUrl(e.target.value)} className="flex-1 text-sm" placeholder="https://website.com" />
              <button onClick={addBrand} disabled={adding || !newBrandName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <div className="flex gap-2">
              <input value={newBrandDesc} onChange={(e) => setNewBrandDesc(e.target.value)} className="flex-1 text-sm" placeholder="Description (optional)" />
              <input value={newBrandHero} onChange={(e) => setNewBrandHero(e.target.value)} className="w-72 text-sm" placeholder="Hero asset UUID (optional)" />
            </div>
          </div>
          {renderBrandList()}
        </>
      )}

      {/* ── Services tab ──────────────────────────────────────────────── */}
      {activeTab === "services" && (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className="flex-1 text-sm" placeholder="Service name (e.g. Custom Kitchen Remodel)" />
              <input value={newServiceOrder} onChange={(e) => setNewServiceOrder(e.target.value)} className="w-24 text-sm" placeholder="Order" />
              <button onClick={addService} disabled={adding || !newServiceName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <div className="flex gap-2">
              <input value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} className="flex-1 text-sm" placeholder="Price range (e.g. $50K-$150K)" />
              <input value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} className="flex-1 text-sm" placeholder="Duration (e.g. 6-12 weeks)" />
            </div>
            <input value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} className="w-full text-sm" placeholder="Description" />
            <input value={newServiceHero} onChange={(e) => setNewServiceHero(e.target.value)} className="w-full text-sm" placeholder="Hero asset UUID (optional)" />
          </div>
          {renderServiceList()}
        </>
      )}

      {/* ── Projects tab ──────────────────────────────────────────────── */}
      {activeTab === "projects" && (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="flex-1 text-sm" placeholder="Project name" />
              <select value={newProjectStatus} onChange={(e) => setNewProjectStatus(e.target.value)} className="text-sm">
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </select>
              <select value={newProjectMode} onChange={(e) => setNewProjectMode(e.target.value)} className="text-sm">
                <option value="seeding">Seeding</option>
                <option value="active">Captioning Active</option>
                <option value="paused">Paused</option>
              </select>
              <button onClick={addProject} disabled={adding || !newProjectName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
              <input type="date" value={newProjectStart} onChange={(e) => setNewProjectStart(e.target.value)} className="text-sm" />
              <input type="date" value={newProjectEnd} onChange={(e) => setNewProjectEnd(e.target.value)} className="text-sm" />
              <input value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} className="text-sm" placeholder="Address (for GPS auto-tagging)" />
            </div>
            <input value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} className="w-full text-sm" placeholder="Description (optional)" />
            <input value={newProjectHero} onChange={(e) => setNewProjectHero(e.target.value)} className="w-full text-sm" placeholder="Hero asset UUID (optional)" />
          </div>
          {renderProjectList()}
        </>
      )}

      {/* ── Personas tab ──────────────────────────────────────────────── */}
      {activeTab === "personas" && (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newPersonaName} onChange={(e) => setNewPersonaName(e.target.value)} className="flex-1 text-sm" placeholder="Name" />
              <input value={newPersonaDisplay} onChange={(e) => setNewPersonaDisplay(e.target.value)} className="flex-1 text-sm" placeholder="Display name (alias)" />
              <select value={newPersonaType} onChange={(e) => setNewPersonaType(e.target.value)} className="text-sm">
                <option value="person">Person</option>
                <option value="group">Group</option>
                <option value="role">Role</option>
                <option value="pet">Pet</option>
              </select>
              <button onClick={addPersona} disabled={adding || !newPersonaName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={newPersonaConsent} onChange={(e) => setNewPersonaConsent(e.target.checked)} className="accent-accent" />
                Consent given to name in content
              </label>
              <input value={newPersonaDesc} onChange={(e) => setNewPersonaDesc(e.target.value)} className="flex-1 text-sm" placeholder="Description" />
            </div>
            <input value={newPersonaCues} onChange={(e) => setNewPersonaCues(e.target.value)} className="w-full text-sm" placeholder="Visual cues (comma-separated, e.g. red hair, glasses, blue jacket)" />
            <textarea value={newPersonaNarrative} onChange={(e) => setNewPersonaNarrative(e.target.value)} className="w-full text-sm" placeholder="Narrative context (background story, role, etc.)" style={{ minHeight: 60 }} />
            <input value={newPersonaHero} onChange={(e) => setNewPersonaHero(e.target.value)} className="w-full text-sm" placeholder="Hero asset UUID (optional)" />
          </div>
          {renderPersonaList()}
        </>
      )}

      {/* ── Branches tab ──────────────────────────────────────────────── */}
      {activeTab === "branches" && (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} className="flex-1 text-sm" placeholder="Branch name (e.g. Burbank Showroom)" />
              <input value={newBranchPhone} onChange={(e) => setNewBranchPhone(e.target.value)} className="w-40 text-sm" placeholder="Phone" />
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={newBranchPrimary} onChange={(e) => setNewBranchPrimary(e.target.checked)} className="accent-accent" />
                Primary
              </label>
              <button onClick={addBranch} disabled={adding || !newBranchName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <div className="flex gap-2">
              <input value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} className="flex-1 text-sm" placeholder="Address" />
              <input value={newBranchCity} onChange={(e) => setNewBranchCity(e.target.value)} className="w-40 text-sm" placeholder="City" />
              <input value={newBranchState} onChange={(e) => setNewBranchState(e.target.value)} className="w-20 text-sm" placeholder="State" />
            </div>
            <div className="flex gap-2">
              <input value={newBranchGbp} onChange={(e) => setNewBranchGbp(e.target.value)} className="flex-1 text-sm" placeholder="GBP location ID (e.g. accounts/123/locations/456)" />
              <input value={newBranchHero} onChange={(e) => setNewBranchHero(e.target.value)} className="w-72 text-sm" placeholder="Hero asset UUID" />
            </div>
            <input value={newBranchDesc} onChange={(e) => setNewBranchDesc(e.target.value)} className="w-full text-sm" placeholder="Description" />
          </div>
          {renderBranchList()}
        </>
      )}

      {/* ── Service Areas tab ─────────────────────────────────────────── */}
      {activeTab === "service_areas" && (
        <>
          <div className="mb-3 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Beta surface. Service areas use a platform canonical+overlay shape — adding here creates or links to a canonical row, then attaches your site overlay.
          </div>
          <div className="mb-6 space-y-2">
            <div className="flex gap-2">
              <input value={newSAName} onChange={(e) => setNewSAName(e.target.value)} className="flex-1 text-sm" placeholder="Service area name (e.g. Pasadena, CA)" />
              <select value={newSAKind} onChange={(e) => setNewSAKind(e.target.value)} className="text-sm">
                <option value="city">City</option>
                <option value="county">County</option>
                <option value="zip">ZIP</option>
                <option value="region">Region</option>
                <option value="state">State</option>
                <option value="metro">Metro</option>
                <option value="neighborhood">Neighborhood</option>
              </select>
              <button onClick={addServiceArea} disabled={adding || !newSAName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {adding ? "..." : "Add"}
              </button>
            </div>
            <input value={newSAPlaceId} onChange={(e) => setNewSAPlaceId(e.target.value)} className="w-full text-sm" placeholder="Google Place ID (optional)" />
            <input value={newSADesc} onChange={(e) => setNewSADesc(e.target.value)} className="w-full text-sm" placeholder="Custom description (overlay — your site only)" />
            <input value={newSANotes} onChange={(e) => setNewSANotes(e.target.value)} className="w-full text-sm" placeholder="Site notes (overlay — internal)" />
            <input value={newSAHero} onChange={(e) => setNewSAHero(e.target.value)} className="w-full text-sm" placeholder="Hero asset UUID (optional)" />
          </div>
          {renderServiceAreaList()}
        </>
      )}
    </div>
  );

  // ── Render functions ───────────────────────────────────────────────────

  function renderBrandList() {
    if (brands.length === 0) return <EmptyState label={currentLabel} />;
    return (
      <div className="space-y-1">
        {brands.map((brand) => (
          <div key={brand.id} className={`border-b border-border py-3 last:border-0 ${editing === brand.id ? "" : "flex items-center gap-4"}`}>
            {editing === brand.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input value={String(editFields.name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input value={String(editFields.url ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, url: e.target.value }))} className="flex-1 text-sm" placeholder="https://..." />
                </div>
                <input value={String(editFields.description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full text-sm" placeholder="Description" />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <SaveCancelRow onSave={() => updateItem("brands", brand.id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{brand.name}</p>
                  {brand.url && <a href={brand.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">{brand.url}</a>}
                  {brand.description && <p className="text-xs text-dim">{brand.description}</p>}
                  {brand.hero_asset_id && <p className="text-[10px] text-dim">hero: {brand.hero_asset_id.slice(0, 8)}…</p>}
                </div>
                <span className="text-xs text-muted">{brand.slug}</span>
                <EditDeleteRow type="brands" id={brand.id} onEdit={() => { setEditing(brand.id); setEditFields({ name: brand.name, url: brand.url || "", description: brand.description || "", hero_asset_id: brand.hero_asset_id || "" }); }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderServiceList() {
    if (services.length === 0) return <EmptyState label={currentLabel} />;
    return (
      <div className="space-y-1">
        {services.map((service) => (
          <div key={service.id} className={`border-b border-border py-3 last:border-0 ${editing === service.id ? "" : "flex items-center gap-4"}`}>
            {editing === service.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input value={String(editFields.name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input value={String(editFields.display_order ?? 0)} onChange={(e) => setEditFields((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="w-20 text-sm" type="number" />
                </div>
                <div className="flex gap-2">
                  <input value={String(editFields.price_range ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, price_range: e.target.value }))} className="flex-1 text-sm" placeholder="Price range" />
                  <input value={String(editFields.duration ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, duration: e.target.value }))} className="flex-1 text-sm" placeholder="Duration" />
                </div>
                <textarea value={String(editFields.description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full text-sm" placeholder="Description" style={{ minHeight: 60 }} />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <JsonField value={String(editFields.metadata_json ?? "{}")} onChange={(v) => setEditFields((f) => ({ ...f, metadata_json: v, metadata: safeParseJSON(v).value }))} label="metadata (JSON)" />
                <SaveCancelRow onSave={() => updateItem("services", service.id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{service.name}</p>
                    <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted">order: {service.display_order}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${service.source === "manual" ? "bg-success/20 text-success" : "bg-accent/20 text-accent"}`}>{service.source}</span>
                  </div>
                  {service.description && <p className="text-xs text-muted">{service.description}</p>}
                  <div className="flex gap-3 text-[10px] text-dim">
                    {service.price_range && <span>price: {service.price_range}</span>}
                    {service.duration && <span>duration: {service.duration}</span>}
                  </div>
                </div>
                <span className="text-xs text-muted">{service.slug}</span>
                <EditDeleteRow type="services" id={service.id} onEdit={() => { setEditing(service.id); setEditFields({ name: service.name, description: service.description || "", price_range: service.price_range || "", duration: service.duration || "", display_order: service.display_order, hero_asset_id: service.hero_asset_id || "", metadata_json: jsonStringify(service.metadata) }); }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderProjectList() {
    if (projects.length === 0) return <EmptyState label={currentLabel} />;
    const statusColors: Record<string, string> = { active: "bg-success/20 text-success", complete: "bg-accent/20 text-accent", archived: "bg-muted/20 text-muted" };
    return (
      <div className="space-y-1">
        {projects.map((project) => (
          <div key={project.id} className={`border-b border-border py-3 last:border-0 ${editing === project.id ? "" : "flex items-center gap-4"}`}>
            {editing === project.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input value={String(editFields.name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <select value={String(editFields.status ?? "active")} onChange={(e) => setEditFields((f) => ({ ...f, status: e.target.value }))} className="w-32 text-sm">
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select value={String(editFields.caption_mode ?? "seeding")} onChange={(e) => setEditFields((f) => ({ ...f, caption_mode: e.target.value }))} className="w-32 text-sm">
                    <option value="seeding">Seeding</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
                <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
                  <input type="date" value={String(editFields.start_date ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, start_date: e.target.value }))} className="text-sm" />
                  <input type="date" value={String(editFields.end_date ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, end_date: e.target.value }))} className="text-sm" />
                  <input value={String(editFields.address ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, address: e.target.value }))} className="text-sm" placeholder="Address" />
                </div>
                <input value={String(editFields.description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full text-sm" placeholder="Description" />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <JsonField value={String(editFields.metadata_json ?? "{}")} onChange={(v) => setEditFields((f) => ({ ...f, metadata_json: v, metadata: safeParseJSON(v).value }))} label="metadata (JSON)" />
                <SaveCancelRow onSave={() => updateItem("projects", project.id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{project.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[project.status] || ""}`}>{project.status}</span>
                    <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted">caption: {project.caption_mode}</span>
                  </div>
                  {project.description && <p className="text-xs text-muted">{project.description}</p>}
                  {(project.start_date || project.end_date) && (
                    <p className="text-[10px] text-dim">{project.start_date && new Date(project.start_date).toLocaleDateString()}{project.start_date && project.end_date && " — "}{project.end_date && new Date(project.end_date).toLocaleDateString()}</p>
                  )}
                  <p className="text-[10px] text-dim">manual_caption_count: {project.manual_caption_count}</p>
                  {captionStatuses[project.id] && captionStatuses[project.id].total_assets > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[10px] ${captionStatuses[project.id].captioned < 3 ? "text-warning" : "text-dim"}`}>
                        {captionStatuses[project.id].captioned < 3
                          ? `${captionStatuses[project.id].captioned}/3 captions needed`
                          : `${captionStatuses[project.id].captioned}/${captionStatuses[project.id].total_assets} captioned`}
                      </span>
                      {captionStatuses[project.id].uncaptioned > 0 && (
                        <button onClick={() => autoCaptionAll(project.id)} disabled={autoCaptioning === project.id} className="text-[10px] text-accent hover:underline disabled:opacity-50">
                          {autoCaptioning === project.id ? "generating..." : `Auto-caption ${captionStatuses[project.id].uncaptioned}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={`/dashboard/project-preview/${project.slug}`} className="text-xs text-accent hover:underline">Preview</a>
                  <a href={`/dashboard/capture?project=${project.id}&projectName=${encodeURIComponent(project.name)}`} className="text-xs text-accent hover:underline">Upload</a>
                  <EditDeleteRow type="projects" id={project.id} onEdit={() => { setEditing(project.id); setEditFields({ name: project.name, status: project.status, start_date: project.start_date || "", end_date: project.end_date || "", address: project.address || "", description: project.description || "", hero_asset_id: project.hero_asset_id || "", caption_mode: project.caption_mode, metadata_json: jsonStringify(project.metadata) }); }} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderPersonaList() {
    if (personas.length === 0) return <EmptyState label={currentLabel} />;
    const typeColors: Record<string, string> = { person: "bg-accent/20 text-accent", group: "bg-success/20 text-success", role: "bg-warning/20 text-warning", pet: "bg-muted/20 text-muted" };
    return (
      <div className="space-y-1">
        {personas.map((persona) => (
          <div key={persona.id} className={`border-b border-border py-3 last:border-0 ${editing === persona.id ? "" : "flex items-center gap-4"}`}>
            {editing === persona.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input value={String(editFields.name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input value={String(editFields.display_name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, display_name: e.target.value }))} className="flex-1 text-sm" placeholder="Display name" />
                  <select value={String(editFields.type ?? "person")} onChange={(e) => setEditFields((f) => ({ ...f, type: e.target.value }))} className="text-sm">
                    <option value="person">Person</option>
                    <option value="group">Group</option>
                    <option value="role">Role</option>
                    <option value="pet">Pet</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={!!editFields.consent_given} onChange={(e) => setEditFields((f) => ({ ...f, consent_given: e.target.checked }))} className="accent-accent" />
                    Consent
                  </label>
                </div>
                <input value={String(editFields.description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full text-sm" placeholder="Description" />
                <input value={String(editFields.visual_cues ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, visual_cues: e.target.value }))} className="w-full text-sm" placeholder="Visual cues (comma-separated)" />
                <textarea value={String(editFields.narrative_context ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, narrative_context: e.target.value }))} className="w-full text-sm" placeholder="Narrative context" style={{ minHeight: 60 }} />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <JsonField value={String(editFields.relationships_json ?? "{}")} onChange={(v) => setEditFields((f) => ({ ...f, relationships_json: v, relationships: safeParseJSON(v).value }))} label="relationships (JSON)" />
                <JsonField value={String(editFields.metadata_json ?? "{}")} onChange={(v) => setEditFields((f) => ({ ...f, metadata_json: v, metadata: safeParseJSON(v).value }))} label="metadata (JSON)" />
                <SaveCancelRow onSave={() => updateItem("personas", persona.id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{persona.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColors[persona.type] || ""}`}>{persona.type}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${persona.consent_given ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>{persona.consent_given ? "consent" : "no consent"}</span>
                  </div>
                  {persona.display_name && <p className="text-xs text-muted">Display: {persona.display_name}</p>}
                  {persona.description && <p className="text-xs text-dim">{persona.description}</p>}
                  {persona.visual_cues.length > 0 && <p className="text-[10px] text-dim">cues: {persona.visual_cues.join(", ")}</p>}
                  {persona.narrative_context && <p className="text-[10px] italic text-dim">narrative: {persona.narrative_context.slice(0, 100)}{persona.narrative_context.length > 100 ? "…" : ""}</p>}
                  <p className="text-[10px] text-dim">appearances: {persona.appearance_count} · first: {persona.first_seen_at ? new Date(persona.first_seen_at).toLocaleDateString() : "—"} · last: {persona.last_seen_at ? new Date(persona.last_seen_at).toLocaleDateString() : "—"}</p>
                </div>
                <span className="text-xs text-muted">{persona.slug}</span>
                <EditDeleteRow type="personas" id={persona.id} onEdit={() => { setEditing(persona.id); setEditFields({ name: persona.name, display_name: persona.display_name || "", type: persona.type, consent_given: persona.consent_given, description: persona.description || "", visual_cues: persona.visual_cues.join(", "), narrative_context: persona.narrative_context || "", hero_asset_id: persona.hero_asset_id || "", relationships_json: jsonStringify(persona.relationships), metadata_json: jsonStringify(persona.metadata) }); }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderBranchList() {
    if (branches.length === 0) return <EmptyState label={currentLabel} />;
    return (
      <div className="space-y-1">
        {branches.map((branch) => (
          <div key={branch.id} className={`border-b border-border py-3 last:border-0 ${editing === branch.id ? "" : "flex items-center gap-4"}`}>
            {editing === branch.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input value={String(editFields.name ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input value={String(editFields.phone ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, phone: e.target.value }))} className="w-40 text-sm" placeholder="Phone" />
                  <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={!!editFields.is_primary} onChange={(e) => setEditFields((f) => ({ ...f, is_primary: e.target.checked }))} className="accent-accent" />
                    Primary
                  </label>
                </div>
                <div className="flex gap-2">
                  <input value={String(editFields.address ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, address: e.target.value }))} className="flex-1 text-sm" placeholder="Address" />
                  <input value={String(editFields.city ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, city: e.target.value }))} className="flex-1 text-sm" placeholder="City" />
                  <input value={String(editFields.state ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, state: e.target.value }))} className="w-20 text-sm" placeholder="ST" />
                </div>
                <input value={String(editFields.gbp_location_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, gbp_location_id: e.target.value }))} className="w-full text-sm" placeholder="GBP location ID" />
                <input value={String(editFields.description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full text-sm" placeholder="Description" />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <JsonField value={String(editFields.hours_json ?? "{}")} onChange={(v) => setEditFields((f) => ({ ...f, hours_json: v, hours: safeParseJSON(v).value }))} label="hours (JSON)" />
                <SaveCancelRow onSave={() => updateItem("branches", branch.id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{branch.name}</p>
                    {branch.is_primary && <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">Primary</span>}
                  </div>
                  {branch.address && <p className="text-xs text-muted">{branch.address}</p>}
                  {(branch.city || branch.state) && <p className="text-xs text-dim">{[branch.city, branch.state].filter(Boolean).join(", ")}</p>}
                  {branch.phone && <p className="text-xs text-dim">{branch.phone}</p>}
                  {branch.gbp_location_id && <p className="text-[10px] text-dim">GBP: {branch.gbp_location_id}</p>}
                  {branch.description && <p className="text-xs text-dim">{branch.description}</p>}
                </div>
                <span className="text-xs text-muted">{branch.slug}</span>
                <EditDeleteRow type="branches" id={branch.id} onEdit={() => { setEditing(branch.id); setEditFields({ name: branch.name, address: branch.address || "", city: branch.city || "", state: branch.state || "", description: branch.description || "", phone: branch.phone || "", gbp_location_id: branch.gbp_location_id || "", is_primary: branch.is_primary, hero_asset_id: branch.hero_asset_id || "", hours_json: jsonStringify(branch.hours) }); }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderServiceAreaList() {
    if (serviceAreas.length === 0) return <EmptyState label={currentLabel} />;
    return (
      <div className="space-y-1">
        {serviceAreas.map((sa) => (
          <div key={sa.overlay_id} className={`border-b border-border py-3 last:border-0 ${editing === sa.overlay_id ? "" : "flex items-center gap-4"}`}>
            {editing === sa.overlay_id ? (
              <div className="flex-1 space-y-2">
                <div className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                  Editing OVERLAY only — name/kind/boundary are canonical and require operator review to change.
                </div>
                <div className="flex gap-2">
                  <span className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-muted">{sa.name} (canonical, read-only here)</span>
                  <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={!!editFields.is_active} onChange={(e) => setEditFields((f) => ({ ...f, is_active: e.target.checked }))} className="accent-accent" />
                    Active
                  </label>
                </div>
                <input value={String(editFields.custom_description ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, custom_description: e.target.value }))} className="w-full text-sm" placeholder="Custom description (overlay)" />
                <input value={String(editFields.site_notes ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, site_notes: e.target.value }))} className="w-full text-sm" placeholder="Site notes (internal)" />
                <input value={String(editFields.hero_asset_id ?? "")} onChange={(e) => setEditFields((f) => ({ ...f, hero_asset_id: e.target.value }))} className="w-full text-sm" placeholder="Hero asset UUID" />
                <SaveCancelRow onSave={() => updateItem("service_areas", sa.overlay_id)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{sa.name}</p>
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">{sa.kind}</span>
                    {!sa.is_active && <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted">inactive</span>}
                  </div>
                  {sa.custom_description && <p className="text-xs text-muted">{sa.custom_description}</p>}
                  {sa.site_notes && <p className="text-[10px] italic text-dim">notes: {sa.site_notes}</p>}
                  {sa.place_id && <p className="text-[10px] text-dim">place_id: {sa.place_id}</p>}
                </div>
                <span className="text-xs text-muted">{sa.slug}</span>
                <EditDeleteRow type="service_areas" id={sa.overlay_id} onEdit={() => { setEditing(sa.overlay_id); setEditFields({ is_active: sa.is_active, custom_description: sa.custom_description || "", site_notes: sa.site_notes || "", hero_asset_id: sa.hero_asset_id || "" }); }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function EmptyState({ label }: { label: string }) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
        <p className="text-sm text-muted">No {label.toLowerCase()} yet. Add one above.</p>
      </div>
    );
  }

  function SaveCancelRow({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
    return (
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-muted hover:text-foreground">Cancel</button>
        <button onClick={onSave} className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover">Save</button>
      </div>
    );
  }

  function EditDeleteRow({ type, id, onEdit }: { type: TagGroup; id: string; onEdit: () => void }) {
    return (
      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} className="text-xs text-muted hover:text-foreground">Edit</button>
        <button onClick={() => deleteItem(type, id)} className="text-xs text-muted hover:text-danger">Delete</button>
      </div>
    );
  }

  function JsonField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    const parsed = safeParseJSON(value);
    return (
      <div>
        <label className="mb-1 flex items-center justify-between text-[10px] text-dim">
          <span>{label}</span>
          {!parsed.ok && <span className="text-danger">invalid JSON: {parsed.error}</span>}
        </label>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full font-mono text-[11px]" style={{ minHeight: 80 }} />
      </div>
    );
  }
}
