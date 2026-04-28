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
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  { id: 7, label: "Review",   title: "Review and submit" },
];

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
      const res = await fetch(`/api/onboarding/${token}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submit failed");
      }
      // Server-side rendered "thanks, we're working on it" page will
      // appear on next visit. Reload now to show it.
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

  const current = STEPS.find((s) => s.id === step) || STEPS[0];

  return (
    <div className="ow-shell">
      <header className="ow-header">
        <div className="ow-brand">
          <img src="/icon.svg" alt="TracPost" className="ow-logo" />
          <span className="ow-brand-name">TRACPOST</span>
        </div>
        <div className="ow-progress">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`ow-progress-dot ${s.id < step ? "done" : s.id === step ? "active" : ""}`}
              title={s.label}
            />
          ))}
          <span className="ow-progress-label">Step {step} of {STEPS.length}</span>
        </div>
      </header>

      <main className="ow-main">
        <div className="ow-eyebrow">{current.label.toUpperCase()}</div>
        <h1 className="ow-title">{current.title}</h1>

        {error && <div className="ow-error">{error}</div>}

        <div className="ow-step-body">
          {step === 1 && <Step1Commit data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 2 && <Step2Business data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 3 && <Step3Voice data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 4 && <Step4Brand data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 5 && <Step5Connect data={data} platformStatus={platformStatus} onSave={saveAndAdvance} saving={saving} />}
          {step === 6 && <Step6Owner data={data} onSave={saveAndAdvance} saving={saving} />}
          {step === 7 && <Step7Review data={data} platformStatus={platformStatus} onSave={saveAndAdvance} onSubmit={submitForm} saving={saving} submitting={submitting} />}
        </div>

        <div className="ow-back-row">
          {step > 1 && (
            <button onClick={goBack} className="ow-btn-link" disabled={saving || submitting}>
              ← Back
            </button>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: wizardStyles }} />
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
    justify-content: space-between;
    padding: 16px 32px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .ow-brand { display: flex; align-items: center; gap: 10px; }
  .ow-logo { height: 24px; width: 24px; }
  .ow-brand-name {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #1a1a1a;
  }

  .ow-progress { display: flex; align-items: center; gap: 8px; }
  .ow-progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d1d5db;
    transition: background 0.2s;
  }
  .ow-progress-dot.active { background: #1a1a1a; }
  .ow-progress-dot.done { background: #22c55e; }
  .ow-progress-label {
    margin-left: 12px;
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
  }

  .ow-main {
    flex: 1;
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
    padding: 56px 32px 80px;
  }
  .ow-eyebrow {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    letter-spacing: 0.12em;
    margin-bottom: 8px;
  }
  .ow-title {
    font-size: 32px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 32px;
    line-height: 1.2;
  }

  .ow-step-body {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
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
  .ow-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    color: #1a1a1a;
    background: #fff;
    transition: border-color 0.15s;
  }
  .ow-input:focus {
    outline: none;
    border-color: #1a1a1a;
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

  .ow-radio-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ow-radio {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.12s;
  }
  .ow-radio:hover { background: #f9fafb; }
  .ow-radio input[type="radio"] {
    width: 16px;
    height: 16px;
  }

  /* Color picker */
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

  /* Platform list (Phase 3 wires connect buttons) */
  .ow-platform-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 20px 0;
  }
  .ow-platform-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
  }
  .ow-platform-swatch {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .ow-platform-info { flex: 1; }
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
  .ow-platform-status {
    font-size: 12px;
    color: #9ca3af;
    font-weight: 500;
  }

  /* Review summary */
  .ow-summary {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 24px 0;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }
  .ow-summary-row {
    display: flex;
    padding: 12px 16px;
    border-bottom: 1px solid #f3f4f6;
    font-size: 14px;
    align-items: baseline;
  }
  .ow-summary-row:last-child { border-bottom: none; }
  .ow-summary-row-long {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .ow-summary-label {
    flex: 0 0 200px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    font-weight: 600;
  }
  .ow-summary-row-long .ow-summary-label { flex: 0; }
  .ow-summary-value {
    flex: 1;
    color: #1a1a1a;
    line-height: 1.5;
    word-break: break-word;
  }
  .ow-summary-color {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
  .ow-summary-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid #e5e7eb;
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
    padding: 12px 24px;
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
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
