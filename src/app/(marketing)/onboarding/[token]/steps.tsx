/**
 * The 7 onboarding form steps. Each is a focused component that takes
 * the accumulated form `data` plus an `onSave` callback, validates its
 * own inputs, and calls back with its slice of data when the user
 * advances. The wizard handles persistence + navigation.
 */
"use client";

import { useState, FormEvent } from "react";

interface StepProps {
  data: Record<string, unknown>;
  platformStatus?: Record<string, string>;
  onSave: (stepData: Record<string, unknown>) => void;
  saving: boolean;
}

// ─── Step 1: Commitment Affirm ───────────────────────────────────────────
export function Step1Commit({ data, onSave, saving }: StepProps) {
  const [affirmed, setAffirmed] = useState(data.commit_affirmed === true);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!affirmed) return;
    onSave({ commit_affirmed: true });
  }

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        TracPost runs on a simple operating principle: <strong>show up everywhere your customers might appear, automatically.</strong>
        That means <strong>all 8 platforms</strong> — Facebook, Instagram, Google Business Profile, LinkedIn,
        YouTube, Pinterest, TikTok, and X. No exceptions.
      </p>
      <p className="ow-prose">
        We&apos;ll help you connect accounts you have, and walk you through creating any you don&apos;t. The
        whole point is compounded reach — picking 2-3 platforms is a compromise that breaks the engine.
      </p>
      <p className="ow-prose ow-prose-muted">
        Active investment is your call. If TikTok isn&apos;t where your customers spend time, you don&apos;t
        have to pour effort into TikTok content. But TracPost still publishes there — that&apos;s the
        bonus reach. Skipping platforms entirely isn&apos;t.
      </p>

      <label className="ow-checkbox">
        <input
          type="checkbox"
          checked={affirmed}
          onChange={(e) => setAffirmed(e.target.checked)}
        />
        <span>
          I&apos;m in. I want TracPost to handle all 8 platforms for my business.
        </span>
      </label>

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={!affirmed || saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 2: Business Basics ─────────────────────────────────────────────
const BUSINESS_TYPES = [
  "Construction / Contractor",
  "Restaurant / Food Service",
  "Retail",
  "Salon / Beauty / Spa",
  "Pet Services / Grooming",
  "Wedding / Event Venue",
  "Photography",
  "Real Estate",
  "Auto Services",
  "Health / Wellness / Fitness",
  "Professional Services (Legal / Accounting / Consulting)",
  "Home Services (Cleaning / Landscaping / HVAC / Plumbing)",
  "Medical / Dental",
  "Education / Tutoring",
  "Other",
];

export function Step2Business({ data, onSave, saving }: StepProps) {
  const [name, setName] = useState((data.business_name as string) || "");
  const [type, setType] = useState((data.business_type as string) || "");
  const [location, setLocation] = useState((data.business_location as string) || "");
  const [website, setWebsite] = useState((data.business_website as string) || "");
  const [touched, setTouched] = useState(false);

  const valid = name.trim().length >= 2 && !!type && location.trim().length >= 2;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({
      business_name: name.trim(),
      business_type: type,
      business_location: location.trim(),
      business_website: website.trim() || null,
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="ow-field">
        <label className="ow-label">Business name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Golden Beetle"
          className="ow-input"
          autoFocus
        />
      </div>

      <div className="ow-field">
        <label className="ow-label">What does your business do?</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="ow-input">
          <option value="">— Pick the closest fit —</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="ow-field">
        <label className="ow-label">Where do you operate?</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., Pittsburgh, PA"
          className="ow-input"
        />
        <p className="ow-help">City + state for local services. Region or country for online businesses.</p>
      </div>

      <div className="ow-field">
        <label className="ow-label">Website <span className="ow-optional">(optional)</span></label>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="e.g., https://goldenbeetle.com"
          className="ow-input"
        />
        <p className="ow-help">If you have one, we&apos;ll use it to inform your blog theme and brand voice.</p>
      </div>

      {touched && !valid && (
        <div className="ow-error">Please fill in business name, type, and location.</div>
      )}

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={!valid || saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 3: Differentiator ──────────────────────────────────────────────
export function Step3Voice({ data, onSave, saving }: StepProps) {
  const [angle, setAngle] = useState((data.differentiator as string) || "");
  const [touched, setTouched] = useState(false);

  const valid = angle.trim().length >= 30;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({ differentiator: angle.trim() });
  }

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        What makes your business different from every other one in your category? This single answer
        anchors your entire content strategy.
      </p>
      <p className="ow-prose ow-prose-muted">
        Don&apos;t worry about polish. We want your real voice — what you&apos;d say to a friend who asked
        why customers should pick you over the competition.
      </p>

      <div className="ow-field">
        <textarea
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          placeholder={`Examples:

"We rely on a well-trained in-house labor force. We tackle the complex, challenging projects most contractors avoid. We produce time-tested traditional outcomes using the most advanced techniques."

"We focus on serious home cooks and prosumer chefs — the kitchen should reflect the cooking experience. The recipes, the gear, the culinary elevated."

"Our tasting menu changes with the season because the produce we work with does. We're not making 'classics' — we're making whatever just came in this morning."`}
          rows={9}
          className="ow-input ow-textarea"
          autoFocus
        />
        <p className="ow-help">{angle.trim().length} characters · minimum 30</p>
      </div>

      {touched && !valid && (
        <div className="ow-error">Tell us at least a sentence or two about what makes you different.</div>
      )}

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={!valid || saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 4: Brand Assets ────────────────────────────────────────────────
const BRAND_COLOR_PRESETS = [
  "#1a1a1a", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed",
  "#c026d3", "#be185d",
];

export function Step4Brand({ data, onSave, saving }: StepProps) {
  const [color, setColor] = useState((data.brand_color as string) || "#1a1a1a");
  const [logoUrl, setLogoUrl] = useState((data.logo_url as string) || "");

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      brand_color: color,
      logo_url: logoUrl.trim() || null,
    });
  }

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        We&apos;ll use these to render your blog, marketing site, and social posts in a consistent style.
        Both fields are optional — we can pick sensible defaults if you don&apos;t have a logo or strong
        color preference yet.
      </p>

      <div className="ow-field">
        <label className="ow-label">Brand color</label>
        <div className="ow-color-row">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="ow-color-input"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="ow-input ow-color-hex"
            spellCheck={false}
          />
        </div>
        <div className="ow-color-presets">
          {BRAND_COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`ow-color-swatch ${color.toLowerCase() === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="ow-field">
        <label className="ow-label">Logo URL <span className="ow-optional">(optional)</span></label>
        <input
          type="text"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="e.g., https://goldenbeetle.com/logo.png"
          className="ow-input"
        />
        <p className="ow-help">
          If your logo lives on your website, paste the URL. If not, leave this blank — we&apos;ll
          collect it from you separately during setup.
        </p>
      </div>

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 5: Platform Connections (Phase 3 wires OAuth) ─────────────────
const PLATFORMS = [
  { id: "meta", name: "Facebook & Instagram", color: "#1877F2", note: "One connection covers both" },
  { id: "gbp", name: "Google Business Profile", color: "#4285F4", note: "Critical for local search" },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2", note: "Company page, not personal profile" },
  { id: "youtube", name: "YouTube", color: "#FF0000", note: "Brand channel, not personal" },
  { id: "pinterest", name: "Pinterest", color: "#E60023", note: "Business account" },
  { id: "tiktok", name: "TikTok", color: "#000000", note: "Business account" },
  { id: "twitter", name: "X (Twitter)", color: "#000000", note: "Business account" },
];

export function Step5Connect({ platformStatus = {}, onSave, saving }: StepProps) {
  function submit(e: FormEvent) {
    e.preventDefault();
    // Phase 3 will gate here based on platform_status. For now, allow advancing.
    onSave({ platforms_acknowledged: true });
  }

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        Connect every platform you have. For platforms you don&apos;t have yet, we&apos;ll show you how
        to set up a business account, then come back and connect.
      </p>
      <p className="ow-prose ow-prose-muted">
        <strong>Phase 3 of this build wires up the actual connect buttons</strong> — for now, you&apos;ll
        see them listed. Click Continue to advance to the next step in this scaffolding.
      </p>

      <div className="ow-platform-list">
        {PLATFORMS.map((p) => {
          const status = platformStatus[p.id] || "pending";
          return (
            <div key={p.id} className="ow-platform-row">
              <div className="ow-platform-swatch" style={{ background: p.color }} />
              <div className="ow-platform-info">
                <div className="ow-platform-name">{p.name}</div>
                <div className="ow-platform-note">{p.note}</div>
              </div>
              <div className="ow-platform-status">
                {status === "connected" ? "✓ Connected" :
                 status === "creating" ? "⏳ Creating" :
                 status === "skipped" ? "— Skipped" :
                 "Phase 3"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 6: Owner + Contact ─────────────────────────────────────────────
export function Step6Owner({ data, onSave, saving }: StepProps) {
  const [ownerName, setOwnerName] = useState((data.owner_name as string) || "");
  const [ownerEmail, setOwnerEmail] = useState((data.owner_email as string) || "");
  const [ownerPhone, setOwnerPhone] = useState((data.owner_phone as string) || "");
  const [notifyVia, setNotifyVia] = useState((data.notify_via as string) || "email");
  const [touched, setTouched] = useState(false);

  function isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }
  function isValidPhone(v: string): boolean {
    const digits = v.replace(/\D/g, "");
    return digits.length === 0 || (digits.length >= 7 && digits.length <= 15);
  }

  const valid =
    ownerName.trim().length >= 2 &&
    isValidEmail(ownerEmail) &&
    isValidPhone(ownerPhone);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({
      owner_name: ownerName.trim(),
      owner_email: ownerEmail.trim(),
      owner_phone: ownerPhone.trim() || null,
      notify_via: notifyVia,
    });
  }

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        How do we reach you? This is the contact info for your dashboard login and any account-level
        communication. You can add additional team members from the dashboard later.
      </p>

      <div className="ow-field">
        <label className="ow-label">Your name</label>
        <input
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="e.g., Meredith Broussard"
          className="ow-input"
          autoFocus
        />
      </div>

      <div className="ow-field">
        <label className="ow-label">Email</label>
        <input
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="you@yourbusiness.com"
          className="ow-input"
        />
        <p className="ow-help">This is where your dashboard login link will be sent.</p>
      </div>

      <div className="ow-field">
        <label className="ow-label">Phone <span className="ow-optional">(optional)</span></label>
        <input
          type="tel"
          value={ownerPhone}
          onChange={(e) => setOwnerPhone(e.target.value)}
          placeholder="e.g., (412) 555-0123"
          className="ow-input"
        />
        <p className="ow-help">Used for SMS notifications about urgent items (negative reviews, etc.) only if you opt in below.</p>
      </div>

      <div className="ow-field">
        <label className="ow-label">Notification preference</label>
        <div className="ow-radio-group">
          <label className="ow-radio">
            <input type="radio" name="notify" value="email" checked={notifyVia === "email"} onChange={() => setNotifyVia("email")} />
            <span>Email only</span>
          </label>
          <label className="ow-radio">
            <input type="radio" name="notify" value="both" checked={notifyVia === "both"} onChange={() => setNotifyVia("both")} />
            <span>Email + SMS for urgent items</span>
          </label>
          <label className="ow-radio">
            <input type="radio" name="notify" value="push" checked={notifyVia === "push"} onChange={() => setNotifyVia("push")} />
            <span>Mobile app push only (no email)</span>
          </label>
        </div>
      </div>

      {touched && !valid && (
        <div className="ow-error">Name and a valid email are required. Phone must be a valid number if entered.</div>
      )}

      <div className="ow-actions">
        <span />
        <button type="submit" className="ow-btn-primary" disabled={!valid || saving}>
          {saving ? "Saving…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 7: Review + Submit ─────────────────────────────────────────────
interface Step7Props extends StepProps {
  onSubmit: () => Promise<void>;
  submitting: boolean;
}

export function Step7Review({ data, platformStatus = {}, onSubmit, submitting }: Step7Props) {
  const platformsConnected = Object.values(platformStatus).filter((s) => s === "connected").length;
  const platformsTotal = 7; // Phase 3 will reflect actual count

  return (
    <div>
      <p className="ow-prose">
        One last look — everything looks right? Click <strong>Submit</strong> and we&apos;ll start
        provisioning your dashboard. You&apos;ll receive a welcome email with your login link when
        everything&apos;s ready, usually within a few hours during business hours.
      </p>

      <div className="ow-summary">
        <SummaryRow label="Business name" value={data.business_name as string} />
        <SummaryRow label="Type" value={data.business_type as string} />
        <SummaryRow label="Location" value={data.business_location as string} />
        <SummaryRow label="Website" value={(data.business_website as string) || "—"} />
        <SummaryRow
          label="What makes you different"
          value={data.differentiator as string}
          long
        />
        <SummaryRow
          label="Brand color"
          value={
            <span className="ow-summary-color">
              <span className="ow-summary-swatch" style={{ background: data.brand_color as string }} />
              {data.brand_color as string}
            </span>
          }
        />
        <SummaryRow label="Logo" value={(data.logo_url as string) || "Will collect separately"} />
        <SummaryRow
          label="Platforms connected"
          value={`${platformsConnected} of ${platformsTotal}${platformsConnected === platformsTotal ? " ✓" : " (Phase 3 will enforce all 8)"}`}
        />
        <SummaryRow label="Owner name" value={data.owner_name as string} />
        <SummaryRow label="Owner email" value={data.owner_email as string} />
        <SummaryRow label="Owner phone" value={(data.owner_phone as string) || "—"} />
        <SummaryRow label="Notify via" value={data.notify_via as string} />
      </div>

      <div className="ow-actions">
        <span />
        <button onClick={onSubmit} className="ow-btn-primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit onboarding →"}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, long }: { label: string; value: React.ReactNode; long?: boolean }) {
  return (
    <div className={`ow-summary-row ${long ? "ow-summary-row-long" : ""}`}>
      <span className="ow-summary-label">{label}</span>
      <span className="ow-summary-value">{value || "—"}</span>
    </div>
  );
}
