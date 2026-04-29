/**
 * The 7 onboarding form steps. Each is a focused component that takes
 * the accumulated form `data` plus an `onSave` callback, validates its
 * own inputs, and calls back with its slice of data when the user
 * advances. The wizard handles persistence + navigation.
 */
"use client";

import { useState, FormEvent } from "react";
import {
  PhoneE164Field,
  RadioCardGroup,
  ValidationHint,
  ReviewSlot,
} from "@/components/forms";

interface StepProps {
  data: Record<string, unknown>;
  platformStatus?: Record<string, string>;
  onSave: (stepData: Record<string, unknown>) => void;
  saving: boolean;
}

// Verbatim consent string shown to user when they pick the SMS-inclusive
// notification option. Saved alongside the consent record on the backend
// for 10DLC A2P audit purposes. Must match the version published on
// /sms-consent-example for reviewers.
const SMS_CONSENT_TEXT =
  "I agree to receive transactional SMS messages from TracPost about my account, urgent customer engagement (e.g., negative reviews), and security codes. Msg & data rates may apply. Reply STOP to opt out at any time, HELP for help.";

interface Nudge {
  id: string;
  title: string;
  body: string;
  severity: string;
  platform: string | null;
  template_key: string | null;
  created_at: string;
  read_at: string | null;
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

// ─── Step 5: Platform Connections ───────────────────────────────────────
const PLATFORMS = [
  {
    id: "meta",
    name: "Facebook & Instagram",
    color: "#1877F2",
    note: "One connection covers both",
    setup: {
      url: "https://www.facebook.com/business/pages/set-up",
      steps: [
        "Open the link to Facebook business setup in a new tab.",
        "Create a Facebook Page for your business (separate from your personal profile). Pick a category that matches your business type.",
        "Add a profile photo, cover image, and business info.",
        "Convert your Instagram account to a Business Account, then link it to the Facebook Page (Instagram → Settings → Account → Switch to Professional → Connect to Facebook Page).",
        "Come back and click Connect Meta below.",
      ],
    },
  },
  {
    id: "gbp",
    name: "Google Business Profile",
    color: "#4285F4",
    note: "Critical for local search",
    setup: {
      url: "https://business.google.com",
      steps: [
        "Open business.google.com in a new tab.",
        "Click Manage Now → enter your business name.",
        "Add your address (or service area for mobile businesses).",
        "Verify ownership — usually a postcard mailed to your address (4-7 days), or phone/email for some businesses.",
        "Once verified, come back and click Connect GBP below.",
      ],
    },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0A66C2",
    note: "Company page (not personal profile)",
    setup: {
      url: "https://www.linkedin.com/company/setup/new/",
      steps: [
        "Open LinkedIn Company setup in a new tab.",
        "Pick the appropriate page type (Company, Showcase, etc.) — most businesses pick Company.",
        "Fill in name, URL, industry, company size, and tagline.",
        "Add a logo and cover image (LinkedIn requires both for an active page).",
        "Come back and click Connect LinkedIn below.",
      ],
    },
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    note: "Brand channel (not personal)",
    setup: {
      url: "https://www.youtube.com/account",
      steps: [
        "Open YouTube account settings in a new tab.",
        "Under Your channel, click Add or manage your channel(s).",
        "Click Create a channel → Use a custom name (this creates a brand channel).",
        "Set up channel info: name, description, profile photo, banner.",
        "Come back and click Connect YouTube below.",
      ],
    },
  },
  {
    id: "pinterest",
    name: "Pinterest",
    color: "#E60023",
    note: "Business account",
    setup: {
      url: "https://business.pinterest.com",
      steps: [
        "Open business.pinterest.com in a new tab.",
        "If you have a personal Pinterest, you can convert it: Settings → Account management → Convert to business account. Or create a new business account.",
        "Add business name, website URL, country/language.",
        "Pick the categories that match your business.",
        "Come back and click Connect Pinterest below.",
      ],
    },
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#000000",
    note: "Business account",
    setup: {
      url: "https://www.tiktok.com/signup",
      steps: [
        "Open tiktok.com/signup in a new tab. Create a personal account first (TikTok requires this step).",
        "Once logged in: Profile → ☰ → Settings and privacy → Manage account → Switch to Business Account.",
        "Pick a category (Retail, Restaurant, etc.) and complete the business profile.",
        "Add your business name, website, and bio.",
        "Come back and click Connect TikTok below.",
      ],
    },
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    color: "#000000",
    note: "Business profile",
    setup: {
      url: "https://twitter.com/i/flow/signup",
      steps: [
        "Open twitter.com signup in a new tab.",
        "Create an account using your business email.",
        "Pick a handle (@yourbusinessname).",
        "Complete the profile: photo, banner, bio, website link.",
        "Come back and click Connect X below.",
      ],
    },
  },
];

interface Step5Props extends StepProps {
  token: string;
  nudges?: Nudge[];
}

// Map nudge.platform to the Step 5 platform card id.
// Nudge "instagram" or "facebook" both surface on the combined "meta" card.
function nudgePlatformMatchesCard(nudgePlatform: string | null, cardId: string): boolean {
  if (!nudgePlatform) return false;
  if (nudgePlatform === cardId) return true;
  if (cardId === "meta" && (nudgePlatform === "instagram" || nudgePlatform === "facebook")) return true;
  return false;
}

export function Step5Connect({ platformStatus = {}, onSave, saving, token, nudges = [] }: Step5Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set(
    Object.entries(platformStatus).filter(([, s]) => s === "skipped").map(([p]) => p)
  ));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ platforms_acknowledged: true });
  }

  function toggleSkip(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Persist to server (best-effort)
    fetch(`/api/onboarding/${token}/save-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: 5, data: {} }),
    }).catch(() => {});
  }

  const connectedCount = PLATFORMS.filter((p) => platformStatus[p.id] === "connected").length;

  return (
    <form onSubmit={submit}>
      <p className="ow-prose">
        Connect every platform you have. For platforms you don&apos;t have yet, click <strong>How do I set this up?</strong> for
        step-by-step instructions, then come back and connect.
      </p>
      <p className="ow-prose ow-prose-muted">
        Connections happen in a separate window. After authorizing, you&apos;ll be brought right back to this page —
        your progress is saved automatically.
      </p>

      <div className="ow-progress-summary">
        {connectedCount} of {PLATFORMS.length} platforms connected
      </div>

      <div className="ow-platform-list">
        {PLATFORMS.map((p) => {
          const status = platformStatus[p.id] || "pending";
          const isConnected = status === "connected";
          const hasFailed = status === "failed";
          const isSkipped = skipped.has(p.id);
          const isExpanded = expanded === p.id;
          const platformNudges = nudges.filter((n) => nudgePlatformMatchesCard(n.platform, p.id));
          return (
            <div key={p.id} className={`ow-platform-row ${isConnected ? "ow-platform-connected" : ""}`}>
              <div className="ow-platform-main">
                <div className="ow-platform-swatch" style={{ background: p.color }} />
                <div className="ow-platform-info">
                  <div className="ow-platform-name">{p.name}</div>
                  <div className="ow-platform-note">{p.note}</div>
                </div>
                <div className="ow-platform-actions">
                  {isConnected ? (
                    <span className="ow-platform-status-pill ow-status-ok">✓ Connected</span>
                  ) : isSkipped ? (
                    <button type="button" onClick={() => toggleSkip(p.id)} className="ow-platform-status-pill ow-status-skip">
                      Marked unavailable · undo
                    </button>
                  ) : (
                    <>
                      <a
                        href={`/api/onboarding/${token}/connect/${p.id}`}
                        className="ow-btn-primary ow-btn-compact"
                      >
                        Connect
                      </a>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : p.id)}
                        className="ow-btn-link"
                      >
                        How do I set this up?
                      </button>
                    </>
                  )}
                </div>
              </div>

              {hasFailed && !isConnected && (
                <div className="ow-platform-error">
                  Connection failed. Try again, or expand the setup guide below if you need to create the account first.
                </div>
              )}

              {!isConnected && platformNudges.length > 0 && (
                <div className="ow-platform-nudge">
                  <div className="ow-platform-nudge-title">{platformNudges[0].title}</div>
                  <div>{platformNudges[0].body}</div>
                </div>
              )}

              {isExpanded && (
                <div className="ow-platform-setup">
                  <p className="ow-prose">
                    <a href={p.setup.url} target="_blank" rel="noopener noreferrer" className="ow-link">
                      Open {p.name} setup →
                    </a>
                  </p>
                  <ol className="ow-setup-steps">
                    {p.setup.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <p className="ow-prose ow-prose-muted">
                    Truly can&apos;t set this up?{" "}
                    <button type="button" onClick={() => toggleSkip(p.id)} className="ow-btn-link">
                      Mark as unavailable
                    </button>
                    {" "}— TracPost will still try, but you won&apos;t see content there.
                  </p>
                </div>
              )}
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
      sms_consent_text: notifyVia === "both" ? SMS_CONSENT_TEXT : null,
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
        <PhoneE164Field
          value={ownerPhone}
          onChange={setOwnerPhone}
          error={touched && !!ownerPhone && !isValidPhone(ownerPhone)}
        />
        <p className="ow-help">Used for SMS notifications about urgent items (negative reviews, etc.) only if you opt in below.</p>
      </div>

      <div className="ow-field">
        <label className="ow-label">Notification preference</label>
        <RadioCardGroup
          options={[
            { value: "email", label: "Email only" },
            { value: "both", label: "Email + SMS for urgent items", hint: "We'll only text for negative reviews and account-critical items" },
            { value: "push", label: "Mobile app push only (no email)" },
          ]}
          value={notifyVia}
          onChange={setNotifyVia}
          layout="column"
        />
        {notifyVia === "both" && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 12,
              color: "#4b5563",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "#1a1a1a", display: "block", marginBottom: 4 }}>
              By selecting this option you agree to receive SMS:
            </strong>
            {SMS_CONSENT_TEXT}
          </div>
        )}
      </div>

      {touched && !valid && (
        <ValidationHint message="Name and a valid email are required. Phone must be a valid number if entered." />
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

// ─── Step 7: Almost done — review + submit ──────────────────────────────
interface Step7Props extends StepProps {
  onSubmit: () => Promise<void>;
  submitting: boolean;
  goToStep: (n: number) => void;
}

type SlotStatus = "incomplete" | "complete" | "in_progress" | "optional";

interface ReviewItem {
  step: number;
  label: string;
  status: SlotStatus;
  hint?: string;
  required: boolean;
}

const TOTAL_SLOTS = 6;

export function Step7Review({ data, platformStatus = {}, onSubmit, submitting, goToStep }: Step7Props) {
  const platformsConnected = Object.values(platformStatus).filter((s) => s === "connected").length;
  const platformsTotal = 7;

  const businessOk = !!(data.business_name && data.business_type && data.business_location);
  const differentiatorOk = typeof data.differentiator === "string" && data.differentiator.length >= 30;
  const brandOk = !!data.brand_color;
  const ownerOk = !!(data.owner_name && data.owner_email);

  const items: ReviewItem[] = [
    {
      step: 2,
      label: "Business basics",
      status: businessOk ? "complete" : "incomplete",
      hint: businessOk
        ? `${data.business_name as string} · ${data.business_type as string}`
        : "Missing business name, type, or location",
      required: true,
    },
    {
      step: 3,
      label: "What makes you different",
      status: differentiatorOk ? "complete" : "incomplete",
      hint: differentiatorOk
        ? `${(data.differentiator as string).slice(0, 80)}${(data.differentiator as string).length > 80 ? "…" : ""}`
        : "Need at least 30 characters of differentiation",
      required: true,
    },
    {
      step: 4,
      label: "Brand assets",
      status: brandOk ? "complete" : "incomplete",
      hint: brandOk
        ? `Color ${data.brand_color as string}${data.logo_url ? " · logo provided" : " · logo collected later"}`
        : "Pick a brand color",
      required: true,
    },
    {
      step: 5,
      label: "Platform connections",
      status:
        platformsConnected === platformsTotal
          ? "complete"
          : platformsConnected > 0
          ? "in_progress"
          : "incomplete",
      hint: `${platformsConnected} of ${platformsTotal} connected`,
      required: false, // operator may proceed with fewer; full coverage is best-effort
    },
    {
      step: 6,
      label: "Owner contact",
      status: ownerOk ? "complete" : "incomplete",
      hint: ownerOk
        ? `${data.owner_name as string} · ${data.owner_email as string}`
        : "Missing name or email",
      required: true,
    },
    {
      step: 1,
      label: "Eight-platform commitment",
      status: data.commit_affirmed === true ? "complete" : "incomplete",
      hint:
        data.commit_affirmed === true
          ? "Confirmed — all 8 platforms"
          : "Re-confirm the 8-platform commitment",
      required: true,
    },
  ];

  const requiredIncomplete = items.filter((i) => i.required && i.status === "incomplete");
  const canSubmit = requiredIncomplete.length === 0;

  return (
    <div>
      <p className="ow-prose">
        {canSubmit ? (
          <>
            Looks good. Submit when ready — we&apos;ll send a sign-in link to your email so you can
            open your dashboard right away while our team finishes the rest of provisioning.
          </>
        ) : (
          <>Click any incomplete item below to jump back and finish it.</>
        )}
      </p>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        {items.map((item, i) => (
          <ReviewSlot
            key={item.step}
            index={i + 1}
            total={TOTAL_SLOTS}
            label={item.label}
            status={item.status}
            hint={item.hint}
            onClick={item.status === "complete" ? undefined : () => goToStep(item.step)}
          />
        ))}
      </div>

      <div className="ow-actions">
        <span />
        <button
          onClick={onSubmit}
          className="ow-btn-primary"
          disabled={submitting || !canSubmit}
        >
          {submitting
            ? "Submitting…"
            : canSubmit
            ? "Submit onboarding →"
            : `${requiredIncomplete.length} item${requiredIncomplete.length === 1 ? "" : "s"} still needed`}
        </button>
      </div>
    </div>
  );
}
