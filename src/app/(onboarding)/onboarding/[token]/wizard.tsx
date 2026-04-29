"use client";

/**
 * Onboarding wizard — multi-step shell + step routing.
 *
 * Each step component owns its own validation + onSave callback. Wizard
 * handles autosave through /api/onboarding/[token]/save-step on Continue,
 * and final submit through /api/onboarding/[token]/submit.
 *
 * Going Back doesn't lose state — accumulated form data lives in this
 * component and persists to the server as steps complete.
 *
 * Mercury-style polish: thin progress bar (no step count visible),
 * SupportChat in the corner, and nudge banner if the operator has
 * sent any help messages.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThinProgressBar, SupportChat } from "@/components/forms";
import {
  Step1Commit, Step2Business, Step3Voice, Step4Brand,
  Step5Connect, Step6Owner, Step7Review,
} from "./steps";

const STEPS: { id: number; label: string; title: string }[] = [
  { id: 1, label: "Commit",   title: "Eight platforms, one engine" },
  { id: 2, label: "Business", title: "Your business basics" },
  { id: 3, label: "Voice",    title: "What makes you different" },
  { id: 4, label: "Brand",    title: "Brand assets" },
  { id: 5, label: "Connect",  title: "Connect your accounts" },
  { id: 6, label: "Owner",    title: "How we'll reach you" },
  { id: 7, label: "Review",   title: "Almost done" },
];

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

interface Props {
  token: string;
  initialStep: number;
  initialData: Record<string, unknown>;
  platformStatus: Record<string, string>;
}

export function OnboardingWizard({ token, initialStep, initialData, platformStatus }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), STEPS.length));
  const [data, setData] = useState<Record<string, unknown>>(initialData || {});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);

  // Smooth percent — based on completed steps (step-1 because we're "in" the current step)
  const progressPercent = Math.round(((step - 1) / STEPS.length) * 100);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/onboarding/${token}/nudges`)
      .then((r) => (r.ok ? r.json() : { nudges: [] }))
      .then((d) => {
        if (!cancelled) setNudges(d.nudges || []);
      })
      .catch(() => {
        /* silent — nudges are non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveAndAdvance = useCallback(async (stepData: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${token}/save-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: stepData }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      const updated = await res.json();
      setData((prev) => ({ ...prev, ...stepData, ...updated.data }));
      setStep((s) => Math.min(s + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your progress");
    } finally {
      setSaving(false);
    }
  }, [token, step]);

  const submitForm = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${token}/submit`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submit failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
      setSubmitting(false);
    }
  }, [token, router]);

  const goBack = () => {
    setStep((s) => Math.max(1, s - 1));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToStep = (n: number) => {
    setStep(Math.min(Math.max(1, n), STEPS.length));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const current = STEPS.find((s) => s.id === step) || STEPS[0];
  const stepContext = `onboarding/${current.label.toLowerCase()}`;

  // Nudges relevant to the current step (platform match for step 5, all others = global only)
  const visibleNudges =
    step === 5
      ? nudges
      : nudges.filter((n) => !n.platform);

  return (
    <div className="ow-shell">
      <ThinProgressBar percent={progressPercent} />

      <header className="ow-header">
        <div className="ow-brand">
          <img src="/icon.svg" alt="TracPost" className="ow-logo" />
          <span className="ow-brand-name">TRACPOST</span>
        </div>
      </header>

      <main className="ow-main">
        <div className="ow-eyebrow">{current.label.toUpperCase()}</div>
        <h1 className="ow-title">{current.title}</h1>

        {visibleNudges.length > 0 && step !== 5 && (
          <NudgeBanner nudges={visibleNudges} />
        )}

        {error && <div className="ow-error">{error}</div>}

        <div className="ow-step-body">
          {step === 1 && <Step1Commit data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 2 && <Step2Business data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 3 && <Step3Voice data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 4 && <Step4Brand data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 5 && (
            <Step5Connect
              data={data}
              platformStatus={platformStatus}
              onSave={saveAndAdvance}
              saving={saving}
              token={token}
              nudges={nudges}
            />
          )}
          {step === 6 && <Step6Owner data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 7 && (
            <Step7Review
              data={data}
              platformStatus={platformStatus}
              onSave={saveAndAdvance}
              onSubmit={submitForm}
              saving={saving}
              submitting={submitting}
              goToStep={goToStep}
            />
          )}
        </div>

        <div className="ow-back-row">
          {step > 1 && (
            <button onClick={goBack} className="ow-btn-link" disabled={saving || submitting}>
              ← Back
            </button>
          )}
        </div>
      </main>

      <SupportChat
        context={stepContext}
        subscriberName={(data.owner_name as string) || undefined}
        subscriberEmail={(data.owner_email as string) || undefined}
      />

      <style dangerouslySetInnerHTML={{ __html: wizardStyles }} />
    </div>
  );
}

function NudgeBanner({ nudges }: { nudges: Nudge[] }) {
  if (nudges.length === 0) return null;
  const primary = nudges[0];
  return (
    <div className="ow-nudge-banner">
      <div className="ow-nudge-icon" aria-hidden>
        💡
      </div>
      <div className="ow-nudge-body">
        <div className="ow-nudge-title">{primary.title}</div>
        <div className="ow-nudge-text">{primary.body}</div>
        {nudges.length > 1 && (
          <div className="ow-nudge-more">+ {nudges.length - 1} more</div>
        )}
      </div>
    </div>
  );
}

const wizardStyles = `
  .ow-shell {
    min-height: 100vh;
    background: #fafafa;
    color: #1a1a1a;
    font-family: var(--font-geist-sans), system-ui, sans-serif;
    display: flex;
    flex-direction: column;
  }

  .ow-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 32px 0;
    background: transparent;
  }
  .ow-brand { display: flex; align-items: center; gap: 10px; }
  .ow-logo { height: 28px; width: 28px; }
  .ow-brand-name {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #1a1a1a;
  }

  .ow-main {
    flex: 1;
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }
  .ow-eyebrow {
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    letter-spacing: 0.14em;
    margin-bottom: 6px;
  }
  .ow-title {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 28px;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .ow-step-body {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 28px 26px;
    margin-bottom: 16px;
  }

  .ow-nudge-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 14px;
    background: rgba(59, 130, 246, 0.06);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 10px;
  }
  .ow-nudge-icon {
    font-size: 18px;
    line-height: 1.2;
    flex-shrink: 0;
  }
  .ow-nudge-body { flex: 1; min-width: 0; }
  .ow-nudge-title {
    font-size: 13px;
    font-weight: 600;
    color: #1d4ed8;
    margin-bottom: 2px;
  }
  .ow-nudge-text {
    font-size: 13px;
    color: #1f2937;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .ow-nudge-more {
    font-size: 11px;
    color: #6b7280;
    margin-top: 4px;
  }

  .ow-prose {
    font-size: 15px;
    color: #1a1a1a;
    line-height: 1.65;
    margin: 0 0 16px;
  }
  .ow-prose-muted {
    color: #6b7280;
    font-size: 14px;
  }

  .ow-field {
    margin-bottom: 20px;
  }
  .ow-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 6px;
  }
  .ow-optional {
    font-weight: 400;
    color: #9ca3af;
  }
  /* Wizard inputs — override the dashboard's borderless "flat input" pattern.
     Match specificity with :not() pseudo-classes so we beat the global rule
     in app/globals.css that targets input:not([type=checkbox]):not([type=radio]). */
  input.ow-input:not([type="checkbox"]):not([type="radio"]),
  textarea.ow-input,
  select.ow-input {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    color: #1a1a1a;
    background: #fff;
    transition: border-color 0.12s;
  }
  input.ow-input:not([type="checkbox"]):not([type="radio"]):hover,
  textarea.ow-input:hover,
  select.ow-input:hover {
    background: #fff;
    border-color: #9ca3af;
  }
  input.ow-input:not([type="checkbox"]):not([type="radio"]):focus,
  textarea.ow-input:focus,
  select.ow-input:focus {
    outline: none;
    border-color: #1a1a1a;
    background: #fff;
  }
  input.ow-input::placeholder,
  textarea.ow-input::placeholder {
    color: #b0b8c4;
  }
  .ow-textarea {
    resize: vertical;
    min-height: 200px;
    font-family: inherit;
    line-height: 1.5;
  }
  .ow-help {
    margin: 6px 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .ow-checkbox {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin: 20px 0 28px;
    padding: 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
  }
  .ow-checkbox input[type="checkbox"] {
    margin-top: 2px;
    width: 18px;
    height: 18px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .ow-checkbox span {
    font-size: 15px;
    color: #1a1a1a;
    line-height: 1.5;
  }

  .ow-color-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .ow-color-input {
    width: 48px;
    height: 40px;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
  }
  .ow-color-hex {
    font-family: ui-monospace, monospace;
    width: 120px;
  }
  .ow-color-presets {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .ow-color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #e5e7eb;
    cursor: pointer;
    transition: transform 0.12s, border-color 0.12s;
  }
  .ow-color-swatch:hover { transform: scale(1.1); }
  .ow-color-swatch.active { border-color: #1a1a1a; transform: scale(1.15); }

  .ow-platform-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0 20px;
  }
  .ow-platform-row {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    transition: border-color 0.15s, background 0.15s;
  }
  .ow-platform-connected {
    background: rgba(34, 197, 94, 0.04);
    border-color: rgba(34, 197, 94, 0.3);
  }
  .ow-platform-main {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 16px;
  }
  .ow-platform-swatch {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .ow-platform-logo {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #f3f4f6;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 6px;
  }
  .ow-platform-link {
    background: transparent;
    border: none;
    padding: 4px 0;
    font-size: 13px;
    font-weight: 600;
    color: #1d4ed8;
    cursor: pointer;
    text-decoration: none;
    transition: color 0.12s;
  }
  .ow-platform-link:hover {
    color: #1a1a1a;
    text-decoration: underline;
  }
  .ow-platform-info {
    flex: 1;
    padding-left: 10px;
  }
  .ow-platform-name {
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
  }
  .ow-platform-note {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }
  .ow-platform-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .ow-platform-status-pill {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    background: transparent;
  }
  .ow-status-ok {
    background: rgba(34, 197, 94, 0.12);
    color: #15803d;
  }
  .ow-status-skip {
    background: rgba(107, 114, 128, 0.12);
    color: #6b7280;
    cursor: pointer;
  }
  .ow-platform-error {
    padding: 8px 14px 14px;
    color: #dc2626;
    font-size: 12px;
  }
  .ow-platform-nudge {
    margin: 0 14px 14px;
    padding: 10px 12px;
    background: rgba(59, 130, 246, 0.06);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    font-size: 13px;
    color: #1f2937;
    line-height: 1.5;
  }
  .ow-platform-nudge-title {
    font-weight: 600;
    color: #1d4ed8;
    margin-bottom: 2px;
  }
  .ow-platform-setup {
    padding: 0 14px 14px;
    border-top: 1px solid #f3f4f6;
    margin-top: -1px;
  }
  .ow-platform-setup .ow-prose {
    font-size: 13px;
    margin-top: 12px;
  }
  .ow-link {
    color: #1a1a1a;
    text-decoration: underline;
    font-weight: 500;
  }
  .ow-link:hover { color: #333; }
  .ow-setup-steps {
    margin: 12px 0;
    padding-left: 20px;
    font-size: 13px;
    color: #4b5563;
    line-height: 1.6;
  }
  .ow-setup-steps li {
    margin-bottom: 6px;
  }
  .ow-btn-compact {
    padding: 8px 14px;
    font-size: 13px;
    text-decoration: none;
    display: inline-block;
  }

  .ow-error {
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #dc2626;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .ow-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
  }
  .ow-back-row {
    margin-top: 16px;
  }
  .ow-btn-primary {
    padding: 10px 22px;
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .ow-btn-primary:hover:not(:disabled) { background: #333; }
  .ow-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ow-btn-link {
    padding: 8px 0;
    background: transparent;
    color: #6b7280;
    border: none;
    font-size: 13px;
    cursor: pointer;
    text-decoration: underline;
  }
  .ow-btn-link:hover:not(:disabled) { color: #1a1a1a; }
  .ow-btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
`;
