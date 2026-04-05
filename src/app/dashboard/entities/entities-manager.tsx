"use client";

import { useState } from "react";

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  description: string | null;
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
}

interface Client {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  consent_given: boolean;
  description: string | null;
}

interface Location {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
}

interface Labels {
  brand_label: string | null;
  project_label: string | null;
  client_label: string | null;
  location_label: string | null;
}

type EntityType = "brands" | "projects" | "clients" | "locations";

const SECTIONS: { key: EntityType; labelKey: keyof Labels }[] = [
  { key: "brands", labelKey: "brand_label" },
  { key: "projects", labelKey: "project_label" },
  { key: "clients", labelKey: "client_label" },
  { key: "locations", labelKey: "location_label" },
];

export function EntitiesManager({
  siteId,
  labels: initialLabels,
  brands: initialBrands,
  projects: initialProjects,
  clients: initialClients,
  locations: initialLocations,
}: {
  siteId: string;
  labels: Labels;
  brands: Brand[];
  projects: Project[];
  clients: Client[];
  locations: Location[];
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [brands, setBrands] = useState(initialBrands);
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState(initialClients);
  const [locations, setLocations] = useState(initialLocations);
  const [showConfig, setShowConfig] = useState(false);

  // Config state
  const [configLabels, setConfigLabels] = useState({ ...initialLabels });
  const [savingConfig, setSavingConfig] = useState(false);

  // Active tab
  const activeSections = SECTIONS.filter((s) => labels[s.labelKey]);
  const [activeTab, setActiveTab] = useState<EntityType>(activeSections[0]?.key || "brands");

  // Add form state
  const [adding, setAdding] = useState(false);

  // Brand form
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandUrl, setNewBrandUrl] = useState("");

  // Project form
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState("active");
  const [newProjectStart, setNewProjectStart] = useState("");
  const [newProjectEnd, setNewProjectEnd] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  // Client form
  const [newClientName, setNewClientName] = useState("");
  const [newClientDisplay, setNewClientDisplay] = useState("");
  const [newClientConsent, setNewClientConsent] = useState(false);
  const [newClientDesc, setNewClientDesc] = useState("");

  // Location form
  const [newLocName, setNewLocName] = useState("");
  const [newLocAddress, setNewLocAddress] = useState("");
  const [newLocCity, setNewLocCity] = useState("");
  const [newLocState, setNewLocState] = useState("");
  const [newLocDesc, setNewLocDesc] = useState("");

  // Edit state
  const [editing, setEditing] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string | boolean>>({});

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/entities/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          brand_label: configLabels.brand_label?.trim() || null,
          project_label: configLabels.project_label?.trim() || null,
          client_label: configLabels.client_label?.trim() || null,
          location_label: configLabels.location_label?.trim() || null,
        }),
      });
      if (res.ok) {
        const newLabels = {
          brand_label: configLabels.brand_label?.trim() || null,
          project_label: configLabels.project_label?.trim() || null,
          client_label: configLabels.client_label?.trim() || null,
          location_label: configLabels.location_label?.trim() || null,
        };
        setLabels(newLabels);
        setShowConfig(false);
        // Switch to first active tab if current is disabled
        const newActive = SECTIONS.find((s) => newLabels[s.labelKey]);
        if (newActive && !newLabels[SECTIONS.find((s) => s.key === activeTab)!.labelKey]) {
          setActiveTab(newActive.key);
        }
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
        body: JSON.stringify({ name: newBrandName.trim(), url: newBrandUrl.trim() || null, site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setBrands((prev) => [...prev, data.brand].sort((a, b) => a.name.localeCompare(b.name)));
        setNewBrandName("");
        setNewBrandUrl("");
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
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [...prev, data.project].sort((a, b) => a.name.localeCompare(b.name)));
        setNewProjectName("");
        setNewProjectStatus("active");
        setNewProjectStart("");
        setNewProjectEnd("");
        setNewProjectAddress("");
        setNewProjectDesc("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addClient() {
    if (!newClientName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientName.trim(),
          display_name: newClientDisplay.trim() || null,
          consent_given: newClientConsent,
          description: newClientDesc.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setClients((prev) => [...prev, data.client].sort((a, b) => a.name.localeCompare(b.name)));
        setNewClientName("");
        setNewClientDisplay("");
        setNewClientConsent(false);
        setNewClientDesc("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function addLocation() {
    if (!newLocName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLocName.trim(),
          address: newLocAddress.trim() || null,
          city: newLocCity.trim() || null,
          state: newLocState.trim() || null,
          description: newLocDesc.trim() || null,
          site_id: siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocations((prev) => [...prev, data.location].sort((a, b) => a.name.localeCompare(b.name)));
        setNewLocName("");
        setNewLocAddress("");
        setNewLocCity("");
        setNewLocState("");
        setNewLocDesc("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function updateItem(type: EntityType, id: string) {
    try {
      const res = await fetch(`/api/${type}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data[type === "brands" ? "brand" : type === "projects" ? "project" : type === "clients" ? "client" : "location"];
        if (type === "brands") setBrands((prev) => prev.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "projects") setProjects((prev) => prev.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "clients") setClients((prev) => prev.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name)));
        if (type === "locations") setLocations((prev) => prev.map((e) => (e.id === id ? updated : e)).sort((a, b) => a.name.localeCompare(b.name)));
        setEditing(null);
      }
    } catch { /* ignore */ }
  }

  async function deleteItem(type: EntityType, id: string) {
    try {
      await fetch(`/api/${type}/${id}`, { method: "DELETE" });
      if (type === "brands") setBrands((prev) => prev.filter((e) => e.id !== id));
      if (type === "projects") setProjects((prev) => prev.filter((e) => e.id !== id));
      if (type === "clients") setClients((prev) => prev.filter((e) => e.id !== id));
      if (type === "locations") setLocations((prev) => prev.filter((e) => e.id !== id));
    } catch { /* ignore */ }
  }

  function getItemCount(key: EntityType) {
    if (key === "brands") return brands.length;
    if (key === "projects") return projects.length;
    if (key === "clients") return clients.length;
    if (key === "locations") return locations.length;
    return 0;
  }

  const currentLabel = labels[SECTIONS.find((s) => s.key === activeTab)!.labelKey] || activeTab;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Entities</h1>
          <p className="mt-1 text-sm text-muted">Tag assets with named entities to shape how content is generated.</p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="text-xs text-muted hover:text-foreground"
        >
          {showConfig ? "Done" : "Configure labels"}
        </button>
      </div>

      {/* Label configuration */}
      {showConfig && (
        <div className="mb-8 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-4 text-sm font-medium">Label Configuration</h3>
          <p className="mb-4 text-xs text-muted">Set a label to enable the section. Clear it to disable.</p>
          <div className="space-y-3">
            {(["brand_label", "project_label", "client_label", "location_label"] as const).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-20 text-xs text-dim capitalize">{key.replace("_label", "")}</span>
                <input
                  value={configLabels[key] || ""}
                  onChange={(e) => setConfigLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Label (e.g. ${key === "brand_label" ? "Vendors" : key === "project_label" ? "Projects" : key === "client_label" ? "Clients" : "Locations"})`}
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

      {/* Tabs */}
      {activeSections.length > 0 ? (
        <>
          <div className="mb-6 flex gap-1 border-b border-border">
            {activeSections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveTab(s.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === s.key
                    ? "border-b-2 border-accent text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {labels[s.labelKey]}
                <span className="ml-2 text-xs text-dim">{getItemCount(s.key)}</span>
              </button>
            ))}
          </div>

          {/* Add form — different per type */}
          {activeTab === "brands" && (
            <>
              <div className="mb-6 flex gap-2">
                <input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} className="flex-1 text-sm" placeholder="Brand name" />
                <input value={newBrandUrl} onChange={(e) => setNewBrandUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} className="flex-1 text-sm" placeholder="https://website.com (optional)" />
                <button onClick={addBrand} disabled={adding || !newBrandName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                  {adding ? "..." : "Add"}
                </button>
              </div>
              {renderBrandList()}
            </>
          )}

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
                  <button onClick={addProject} disabled={adding || !newProjectName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                    {adding ? "..." : "Add"}
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
                  <input type="date" value={newProjectStart} onChange={(e) => setNewProjectStart(e.target.value)} className="text-sm" placeholder="Start date" />
                  <input type="date" value={newProjectEnd} onChange={(e) => setNewProjectEnd(e.target.value)} className="text-sm" placeholder="End date" />
                  <input value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} className="text-sm" placeholder="Address (for auto-tagging photos by GPS)" />
                </div>
                <div className="flex gap-2">
                  <input value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} className="flex-1 text-sm" placeholder="Description (optional)" />
                </div>
              </div>
              {renderProjectList()}
            </>
          )}

          {activeTab === "clients" && (
            <>
              <div className="mb-6 space-y-2">
                <div className="flex gap-2">
                  <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className="flex-1 text-sm" placeholder="Client name" />
                  <input value={newClientDisplay} onChange={(e) => setNewClientDisplay(e.target.value)} className="flex-1 text-sm" placeholder="Display name (optional)" />
                  <button onClick={addClient} disabled={adding || !newClientName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                    {adding ? "..." : "Add"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                    <input type="checkbox" checked={newClientConsent} onChange={(e) => setNewClientConsent(e.target.checked)} className="accent-accent" />
                    Consent given to name in content
                  </label>
                  <input value={newClientDesc} onChange={(e) => setNewClientDesc(e.target.value)} className="flex-1 text-sm" placeholder="Description (optional)" />
                </div>
              </div>
              {renderClientList()}
            </>
          )}

          {activeTab === "locations" && (
            <>
              <div className="mb-6 space-y-2">
                <div className="flex gap-2">
                  <input value={newLocName} onChange={(e) => setNewLocName(e.target.value)} className="flex-1 text-sm" placeholder="Location name" />
                  <button onClick={addLocation} disabled={adding || !newLocName.trim()} className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                    {adding ? "..." : "Add"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input value={newLocAddress} onChange={(e) => setNewLocAddress(e.target.value)} className="flex-1 text-sm" placeholder="Address" />
                  <input value={newLocCity} onChange={(e) => setNewLocCity(e.target.value)} className="w-40 text-sm" placeholder="City" />
                  <input value={newLocState} onChange={(e) => setNewLocState(e.target.value)} className="w-20 text-sm" placeholder="State" />
                </div>
                <input value={newLocDesc} onChange={(e) => setNewLocDesc(e.target.value)} className="w-full text-sm" placeholder="Description (optional)" />
              </div>
              {renderLocationList()}
            </>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No entity types configured yet.</p>
          <button
            onClick={() => setShowConfig(true)}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Configure labels
          </button>
        </div>
      )}
    </div>
  );

  function renderBrandList() {
    if (brands.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No {currentLabel.toLowerCase()} yet. Add one above.</p>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {brands.map((brand) => (
          <div key={brand.id} className={`border-b border-border py-3 last:border-0 ${editing === brand.id ? "" : "flex items-center gap-4"}`}>
            {editing === brand.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input id={`edit-brand-name-${brand.id}`} value={(editFields.name as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input id={`edit-brand-url-${brand.id}`} value={(editFields.url as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, url: e.target.value }))} className="flex-1 text-sm" placeholder="https://..." />
                </div>
                <div className="flex gap-2">
                  <input id={`edit-brand-desc-${brand.id}`} value={(editFields.description as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="flex-1 text-sm" placeholder="Description (optional)" />
                  <button onClick={() => updateItem("brands", brand.id)} className="text-xs text-accent hover:underline">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{brand.name}</p>
                  {brand.url && <a href={brand.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">{brand.url}</a>}
                </div>
                <span className="text-xs text-muted">{brand.slug}</span>
                <button onClick={() => { setEditing(brand.id); setEditFields({ name: brand.name, url: brand.url || "", description: brand.description || "" }); }} className="text-xs text-muted hover:text-foreground">Edit</button>
                <button onClick={() => deleteItem("brands", brand.id)} className="text-xs text-muted hover:text-danger">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderProjectList() {
    if (projects.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No {currentLabel.toLowerCase()} yet. Add one above.</p>
        </div>
      );
    }
    const statusColors: Record<string, string> = {
      active: "bg-success/20 text-success",
      complete: "bg-accent/20 text-accent",
      archived: "bg-muted/20 text-muted",
    };
    return (
      <div className="space-y-1">
        {projects.map((project) => (
          <div key={project.id} className={`border-b border-border py-3 last:border-0 ${editing === project.id ? "" : "flex items-center gap-4"}`}>
            {editing === project.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    id={`edit-project-name-${project.id}`}
                    value={String(editFields.name ?? "")}
                    onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                    className="min-w-0 flex-1 text-sm"
                    placeholder="Name"
                    autoFocus
                  />
                  <select
                    id={`edit-project-status-${project.id}`}
                    value={String(editFields.status ?? "active")}
                    onChange={(e) => setEditFields((f) => ({ ...f, status: e.target.value }))}
                    className="w-32 shrink-0 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
                  <input
                    id={`edit-project-start-${project.id}`}
                    type="date"
                    value={String(editFields.start_date ?? "")}
                    onChange={(e) => setEditFields((f) => ({ ...f, start_date: e.target.value }))}
                    className="text-sm"
                  />
                  <input
                    id={`edit-project-end-${project.id}`}
                    type="date"
                    value={String(editFields.end_date ?? "")}
                    onChange={(e) => setEditFields((f) => ({ ...f, end_date: e.target.value }))}
                    className="text-sm"
                  />
                  <input
                    id={`edit-project-address-${project.id}`}
                    value={String(editFields.address ?? "")}
                    onChange={(e) => setEditFields((f) => ({ ...f, address: e.target.value }))}
                    className="text-sm"
                    placeholder="Address (for GPS auto-tagging)"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    id={`edit-project-desc-${project.id}`}
                    value={String(editFields.description ?? "")}
                    onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
                    className="flex-1 text-sm"
                    placeholder="Description (optional)"
                  />
                  <button onClick={() => updateItem("projects", project.id)} className="text-xs text-accent hover:underline">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{project.name}</p>
                  {project.description && <p className="text-xs text-muted">{project.description}</p>}
                  {(project.start_date || project.end_date) && (
                    <p className="text-[10px] text-dim">
                      {project.start_date && new Date(project.start_date).toLocaleDateString()}
                      {project.start_date && project.end_date && " — "}
                      {project.end_date && new Date(project.end_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[project.status] || ""}`}>{project.status}</span>
                <a
                  href={`/dashboard/capture?project=${project.id}&projectName=${encodeURIComponent(project.name)}`}
                  className="text-xs text-accent hover:underline"
                >
                  Upload
                </a>
                <button onClick={() => { setEditing(project.id); setEditFields({ name: project.name, status: project.status, start_date: project.start_date || "", end_date: project.end_date || "", address: project.address || "", description: project.description || "" }); }} className="text-xs text-muted hover:text-foreground">Edit</button>
                <button onClick={() => deleteItem("projects", project.id)} className="text-xs text-muted hover:text-danger">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderClientList() {
    if (clients.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No {currentLabel.toLowerCase()} yet. Add one above.</p>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {clients.map((client) => (
          <div key={client.id} className={`border-b border-border py-3 last:border-0 ${editing === client.id ? "" : "flex items-center gap-4"}`}>
            {editing === client.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input id={`edit-client-name-${client.id}`} value={(editFields.name as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input id={`edit-client-display-${client.id}`} value={(editFields.display_name as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, display_name: e.target.value }))} className="flex-1 text-sm" placeholder="Display name (alias if no consent)" />
                  <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
                    <input id={`edit-client-consent-${client.id}`} type="checkbox" checked={!!editFields.consent_given} onChange={(e) => setEditFields((f) => ({ ...f, consent_given: e.target.checked }))} className="accent-accent" />
                    Consent given
                  </label>
                </div>
                <div className="flex gap-2">
                  <input id={`edit-client-desc-${client.id}`} value={(editFields.description as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="flex-1 text-sm" placeholder="Description (optional)" />
                  <button onClick={() => updateItem("clients", client.id)} className="text-xs text-accent hover:underline">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{client.name}</p>
                  {client.display_name && <p className="text-xs text-muted">Display: {client.display_name}</p>}
                  {client.description && <p className="text-xs text-dim">{client.description}</p>}
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${client.consent_given ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                  {client.consent_given ? "consent" : "no consent"}
                </span>
                <span className="text-xs text-muted">{client.slug}</span>
                <button onClick={() => { setEditing(client.id); setEditFields({ name: client.name, display_name: client.display_name || "", consent_given: client.consent_given, description: client.description || "" }); }} className="text-xs text-muted hover:text-foreground">Edit</button>
                <button onClick={() => deleteItem("clients", client.id)} className="text-xs text-muted hover:text-danger">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderLocationList() {
    if (locations.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">No {currentLabel.toLowerCase()} yet. Add one above.</p>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {locations.map((loc) => (
          <div key={loc.id} className={`border-b border-border py-3 last:border-0 ${editing === loc.id ? "" : "flex items-center gap-4"}`}>
            {editing === loc.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input id={`edit-loc-name-${loc.id}`} value={(editFields.name as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} className="flex-1 text-sm" placeholder="Name" autoFocus />
                  <input id={`edit-loc-address-${loc.id}`} value={(editFields.address as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, address: e.target.value }))} className="flex-1 text-sm" placeholder="Address" />
                </div>
                <div className="flex gap-2">
                  <input id={`edit-loc-city-${loc.id}`} value={(editFields.city as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, city: e.target.value }))} className="flex-1 text-sm" placeholder="City" />
                  <input id={`edit-loc-state-${loc.id}`} value={(editFields.state as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, state: e.target.value }))} className="w-20 text-sm" placeholder="ST" />
                  <input id={`edit-loc-desc-${loc.id}`} value={(editFields.description as string) ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="flex-1 text-sm" placeholder="Description (optional)" />
                  <button onClick={() => updateItem("locations", loc.id)} className="text-xs text-accent hover:underline">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{loc.name}</p>
                  {loc.address && <p className="text-xs text-muted">{loc.address}</p>}
                  {(loc.city || loc.state) && (
                    <p className="text-xs text-dim">{[loc.city, loc.state].filter(Boolean).join(", ")}</p>
                  )}
                  {loc.description && <p className="text-xs text-dim">{loc.description}</p>}
                </div>
                <span className="text-xs text-muted">{loc.slug}</span>
                <button onClick={() => { setEditing(loc.id); setEditFields({ name: loc.name, address: loc.address || "", city: loc.city || "", state: loc.state || "", description: loc.description || "" }); }} className="text-xs text-muted hover:text-foreground">Edit</button>
                <button onClick={() => deleteItem("locations", loc.id)} className="text-xs text-muted hover:text-danger">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
}
