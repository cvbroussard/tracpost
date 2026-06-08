/**
 * BusinessInfoForm — inline editor for the business_info task's first 3
 * sections (basics, commercial_tier, contact). Embedded in the provisioning
 * drawer per [[provisioning-drawer-console]] doctrine. Each section has its
 * own Save button — submitting that section updates only its fields.
 *
 * Phase 1 covers 3 sections; branding, web_identity, and the 3 safeguard
 * waivers land in subsequent iterations.
 *
 * Operator-scoped: uses /api/admin/businesses/[id]/info which accepts an
 * explicit business id. The subscriber-side equivalents live at
 * /api/dashboard/business-info + /api/dashboard/commercial-tier (session-
 * scoped). When the drawer is exposed to subscribers we'll wire a
 * role-aware fetcher that picks the right endpoint.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface PickerTier {
  id: string;
  slug: string;
  label: string;
  description: string;
}

interface BusinessInfo {
  id: string;
  name: string | null;
  businessType: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  websiteUrl: string | null;
  blogSlug: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  facePolicy: string | null;
  faceWaiverSignedAt: string | null;
  minorFacePolicy: string | null;
  minorFaceWaiverSignedAt: string | null;
  identityPolicy: string | null;
  identityWaiverSignedAt: string | null;
  commercialTierId: string | null;
  tierSlug: string | null;
  tierLabel: string | null;
  hostingModel: "tracpost_hosted" | "external_hosted" | null;
}

type SectionFeedback = {
  kind: "saving" | "saved" | "error";
  message?: string;
};

export function BusinessInfoForm({
  businessId,
  onSaved,
}: {
  businessId: string;
  /** Optional callback after any section saves successfully — provisioning
   *  drawer uses this to re-fetch the parent task statuses. */
  onSaved?: () => void;
}) {
  const [biz, setBiz] = useState<BusinessInfo | null>(null);
  const [pickerTiers, setPickerTiers] = useState<PickerTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, SectionFeedback | null>>({});

  // Section-local form state
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [tierSlug, setTierSlug] = useState("");
  const [hostingModel, setHostingModel] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [ogTitle, setOgTitle] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [facePolicy, setFacePolicy] = useState("");
  const [minorFacePolicy, setMinorFacePolicy] = useState("");
  const [identityPolicy, setIdentityPolicy] = useState("");

  // Last-saved snapshot per section — drives the "is this section dirty?"
  // check so auto-save only fires when there's actually something new.
  const lastSaved = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}/info`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { business: BusinessInfo; pickerTiers: PickerTier[] };
      setBiz(data.business);
      setPickerTiers(data.pickerTiers);
      setName(data.business.name ?? "");
      setBusinessType(data.business.businessType ?? "");
      setLocation(data.business.location ?? "");
      setTierSlug(data.business.tierSlug ?? "");
      setHostingModel(data.business.hostingModel ?? "");
      setPhone(data.business.phone ?? "");
      setEmail(data.business.email ?? "");
      setLogoUrl(data.business.logoUrl ?? "");
      setFaviconUrl(data.business.faviconUrl ?? "");
      setWebsiteUrl(data.business.websiteUrl ?? "");
      setBlogSlug(data.business.blogSlug ?? "");
      setOgTitle(data.business.ogTitle ?? "");
      setOgDescription(data.business.ogDescription ?? "");
      setFacePolicy(data.business.facePolicy ?? "blur");
      setMinorFacePolicy(data.business.minorFacePolicy ?? "blur");
      setIdentityPolicy(data.business.identityPolicy ?? "anonymize");
      // Snapshot what's now in the form for dirty-check on next save attempt
      lastSaved.current = {
        basics: JSON.stringify({
          name: data.business.name ?? "",
          business_type: data.business.businessType ?? "",
          location: data.business.location ?? "",
        }),
        commercial_tier: data.business.tierSlug ?? "",
        hosting_model: data.business.hostingModel ?? "",
        contact: JSON.stringify({
          phone: data.business.phone ?? "",
          email: data.business.email ?? "",
        }),
        branding: JSON.stringify({
          logo_url: data.business.logoUrl ?? "",
          favicon_url: data.business.faviconUrl ?? "",
        }),
        web_identity: JSON.stringify({
          url: data.business.websiteUrl ?? "",
          blog_slug: data.business.blogSlug ?? "",
          og_title: data.business.ogTitle ?? "",
          og_description: data.business.ogDescription ?? "",
        }),
        safeguard_faces: data.business.facePolicy ?? "blur",
        safeguard_minors: data.business.minorFacePolicy ?? "blur",
        safeguard_identity: data.business.identityPolicy ?? "anonymize",
      };
    } catch (e) {
      console.error("Failed to load business info:", e);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveSection(section: string, fields: Record<string, unknown>) {
    setFeedback((f) => ({ ...f, [section]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, fields }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setFeedback((f) => ({ ...f, [section]: { kind: "saved" } }));
      await refresh();
      onSaved?.();
      // Clear the saved indicator after a moment so repeat saves re-flash
      setTimeout(() => {
        setFeedback((f) => {
          if (f[section]?.kind === "saved") return { ...f, [section]: null };
          return f;
        });
      }, 1500);
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [section]: { kind: "error", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  /**
   * Auto-save trigger — fires save only when the section is actually
   * dirty (current fields differ from last-saved snapshot) AND valid
   * (the API would accept it). For non-trivial sections with required
   * fields (basics), gate on validity so blurring a half-filled form
   * doesn't trigger a save-then-fail loop.
   */
  function autoSave(
    section: string,
    fields: Record<string, unknown>,
    opts?: { valid?: boolean; dirtyKey?: string },
  ) {
    const valid = opts?.valid ?? true;
    if (!valid) return;
    const fingerprint = opts?.dirtyKey ?? JSON.stringify(fields);
    if (lastSaved.current[section] === fingerprint) return; // unchanged
    lastSaved.current[section] = fingerprint;
    void saveSection(section, fields);
  }

  if (loading) {
    return (
      <div className="text-[11px] text-muted italic">Loading business info…</div>
    );
  }
  if (!biz) {
    return (
      <div className="text-[11px] text-red-600 dark:text-red-400">
        Unable to load business info.
      </div>
    );
  }

  // Auto-save closures, one per section.
  const saveBasics = () => autoSave(
    "basics",
    { name: name.trim(), business_type: businessType.trim(), location: location.trim() },
    { valid: !!(name.trim() && businessType.trim() && location.trim()) },
  );
  const saveContact = () => autoSave("contact", { phone: phone.trim(), email: email.trim() });
  const saveBranding = () => autoSave("branding", { logo_url: logoUrl.trim(), favicon_url: faviconUrl.trim() });
  const saveWebIdentity = () => autoSave("web_identity", {
    url: websiteUrl.trim(),
    blog_slug: blogSlug.trim(),
    og_title: ogTitle.trim(),
    og_description: ogDescription.trim(),
  });

  // Aggregate top-level save indicator — shows the most recent non-null
  // feedback across all sections so the operator sees one consolidated
  // status line instead of per-section noise.
  const allFeedback = Object.values(feedback).filter((f): f is SectionFeedback => f !== null && f !== undefined);
  const aggregate: SectionFeedback | null =
    allFeedback.find((f) => f.kind === "error") ??
    allFeedback.find((f) => f.kind === "saving") ??
    allFeedback.find((f) => f.kind === "saved") ??
    null;

  return (
    <div className="space-y-3">
      {/* Top-level save indicator — one line for the whole form */}
      <div className="flex items-center justify-end h-4">
        {aggregate?.kind === "saving" && (
          <span className="text-[10px] text-muted italic">Saving…</span>
        )}
        {aggregate?.kind === "saved" && (
          <span className="text-[10px] text-green-700 dark:text-green-400">✓ Saved</span>
        )}
        {aggregate?.kind === "error" && (
          <span className="text-[10px] text-red-700 dark:text-red-400">{aggregate.message || "Save failed"}</span>
        )}
      </div>

      <Field label="Business name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveBasics}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="e.g. B2 Construction"
        />
      </Field>

      <Field label="Business type" required>
        <input
          type="text"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          onBlur={saveBasics}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="e.g. General Contractor"
        />
      </Field>

      <Field label="Location" required>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={saveBasics}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="e.g. Pittsburgh, PA"
        />
      </Field>

      <Field label="Commercial tier" required>
        <select
          value={tierSlug}
          onChange={(e) => {
            const next = e.target.value;
            setTierSlug(next);
            if (next) autoSave("commercial_tier", { tier_slug: next }, { dirtyKey: next });
          }}
          className="block w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
        >
          <option value="">— Select tier —</option>
          {pickerTiers.map((t) => (
            <option key={t.id} value={t.slug}>{t.label}</option>
          ))}
        </select>
      </Field>
      {tierSlug && pickerTiers.find((t) => t.slug === tierSlug)?.description && (
        <p className="text-[10px] text-muted leading-relaxed italic -mt-1">
          {pickerTiers.find((t) => t.slug === tierSlug)?.description}
        </p>
      )}

      <Field label="Hosting model" required>
        <select
          value={hostingModel}
          onChange={(e) => {
            const next = e.target.value;
            setHostingModel(next);
            if (next) autoSave("hosting_model", { hosting_model: next }, { dirtyKey: next });
          }}
          className="block w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
        >
          <option value="">— Select hosting model —</option>
          <option value="tracpost_hosted">TracPost-hosted — we serve the website</option>
          <option value="external_hosted">Externally hosted — tenant infrastructure</option>
        </select>
      </Field>
      {hostingModel === "tracpost_hosted" && (
        <p className="text-[10px] text-muted leading-relaxed italic -mt-1">
          TracPost generates and hosts the website from the brand catalog.
          The provisioning pipeline will surface the Website (TracPost-hosted)
          Provisioning step with custom domain + page layout + generated copy
          sub_tasks.
        </p>
      )}
      {hostingModel === "external_hosted" && (
        <p className="text-[10px] text-muted leading-relaxed italic -mt-1">
          Tenant hosts the website on their own infrastructure. TracPost
          observes via Public Presence Analysis and publishes content
          alongside. The pipeline will surface a simpler Website
          (externally hosted) step.
        </p>
      )}

      <Field label="Phone">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={saveContact}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="(412) 555-1234"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={saveContact}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="hello@business.com"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Logo URL">
          <div className="space-y-1">
            {logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt="Logo" className="h-12 w-auto rounded border border-border bg-card object-contain p-1" />
            )}
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              onBlur={saveBranding}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
              placeholder="https://…"
            />
          </div>
        </Field>
        <Field label="Favicon URL">
          <div className="space-y-1">
            {faviconUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={faviconUrl} alt="Favicon" className="h-12 w-12 rounded border border-border bg-card object-contain p-1" />
            )}
            <input
              type="url"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              onBlur={saveBranding}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
              placeholder="https://…"
            />
          </div>
        </Field>
      </div>

      <Field label="Website URL">
        <input
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          onBlur={saveWebIdentity}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="https://business.com"
        />
      </Field>

      <Field label="Blog slug">
        <input
          type="text"
          value={blogSlug}
          onChange={(e) => setBlogSlug(e.target.value)}
          onBlur={saveWebIdentity}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="business-blog"
        />
      </Field>

      <Field label="OG title">
        <input
          type="text"
          value={ogTitle}
          onChange={(e) => setOgTitle(e.target.value)}
          onBlur={saveWebIdentity}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="Business name or hero tagline"
        />
      </Field>

      <Field label="OG description">
        <textarea
          value={ogDescription}
          onChange={(e) => setOgDescription(e.target.value)}
          onBlur={saveWebIdentity}
          rows={2}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          placeholder="A brief description for social sharing"
        />
      </Field>

      <SafeguardField
        label="Faces policy"
        signedAt={biz.faceWaiverSignedAt}
        policyOptions={[
          { value: "blur", label: "Blur faces", permissive: false },
          { value: "box", label: "Box (cover) faces", permissive: false },
          { value: "suppress", label: "Suppress face-containing photos", permissive: false },
          { value: "asis", label: "Use faces as-is (waiver required)", permissive: true },
        ]}
        selected={facePolicy}
        onSelect={(next) => {
          setFacePolicy(next);
          if (next !== "asis") autoSave("safeguard_faces", { policy: next }, { dirtyKey: next });
        }}
        onSignWaiver={() => {
          lastSaved.current.safeguard_faces = facePolicy;
          void saveSection("safeguard_faces", { policy: facePolicy, sign_waiver: true });
        }}
      />

      <SafeguardField
        label="Minor faces policy"
        signedAt={biz.minorFaceWaiverSignedAt}
        policyOptions={[
          { value: "blur", label: "Blur minor faces", permissive: false },
          { value: "box", label: "Box (cover) minor faces", permissive: false },
          { value: "suppress", label: "Suppress minor-containing photos", permissive: false },
          { value: "asis", label: "Use minor faces as-is (parental waiver required)", permissive: true },
        ]}
        selected={minorFacePolicy}
        onSelect={(next) => {
          setMinorFacePolicy(next);
          if (next !== "asis") autoSave("safeguard_minors", { policy: next }, { dirtyKey: next });
        }}
        onSignWaiver={() => {
          lastSaved.current.safeguard_minors = minorFacePolicy;
          void saveSection("safeguard_minors", { policy: minorFacePolicy, sign_waiver: true });
        }}
      />

      <SafeguardField
        label="Identity policy"
        signedAt={biz.identityWaiverSignedAt}
        policyOptions={[
          { value: "anonymize", label: "Anonymize — strip names + identifying info", permissive: false },
          { value: "allow_names", label: "Allow names in copy (waiver required)", permissive: true },
        ]}
        selected={identityPolicy}
        onSelect={(next) => {
          setIdentityPolicy(next);
          if (next !== "allow_names") autoSave("safeguard_identity", { policy: next }, { dirtyKey: next });
        }}
        onSignWaiver={() => {
          lastSaved.current.safeguard_identity = identityPolicy;
          void saveSection("safeguard_identity", { policy: identityPolicy, sign_waiver: true });
        }}
      />
    </div>
  );
}

interface PolicyOption {
  value: string;
  label: string;
  permissive: boolean;
}

function SafeguardField({
  label,
  signedAt,
  policyOptions,
  selected,
  onSelect,
  onSignWaiver,
}: {
  label: string;
  signedAt: string | null;
  policyOptions: PolicyOption[];
  selected: string;
  onSelect: (value: string) => void;
  onSignWaiver: () => void;
}) {
  const selectedOption = policyOptions.find((p) => p.value === selected);
  const requiresWaiver = !!selectedOption?.permissive;
  const waiverSigned = !!signedAt;
  const needsWaiver = requiresWaiver && !waiverSigned;

  return (
    <div className="space-y-1">
      <Field label={label} required>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="block w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
        >
          {policyOptions.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </Field>
      <p className="text-[10px] text-muted">
        Waiver: {waiverSigned ? (
          <span className="text-green-700 dark:text-green-400">
            ✓ Signed {new Date(signedAt!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">Not signed</span>
        )}
      </p>
      {needsWaiver && (
        <button
          type="button"
          onClick={onSignWaiver}
          className="w-full rounded border border-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          Sign waiver (admin override)
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] text-muted">
        {label}
        {required && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
