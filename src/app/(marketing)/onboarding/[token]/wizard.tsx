"use client";

/**
 * Onboarding wizard — multi-step shell.
 *
 * Phase 1 ships the SHELL only (navigation + autosave + per-step
 * scaffolding). Step content is filled in Phase 2 — for now each step
 * renders a placeholder telling the operator (or test viewer) which
 * step is active.
 *
 * Each step's data merges into a single accumulated `data` object,
 * persisted to the server on Continue. Going Back doesn't lose state.
 */

import { useState, useCallback } from "react";

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

export function OnboardingWizard({ token, initialStep, initialData, platformStatus: _platformStatus }: Props) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), STEPS.length));
  const [data, setData] = useState<Record<string, unknown>>(initialData || {});
  const [saving, setSaving] = useState(false);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your progress");
    } finally {
      setSaving(false);
    }
  }, [token, step]);

  const goBack = () => setStep((s) => Math.max(1, s - 1));

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

        <div className="ow-step-body">
          <div className="ow-placeholder">
            <p className="ow-placeholder-eyebrow">Step {step} content — Phase 2</p>
            <pre className="ow-data-dump">{JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>

        {error && <div className="ow-error">{error}</div>}

        <div className="ow-actions">
          {step > 1 ? (
            <button onClick={goBack} className="ow-btn-secondary" disabled={saving}>← Back</button>
          ) : <span />}
          {step < STEPS.length ? (
            <button
              onClick={() => saveAndAdvance({})}
              className="ow-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          ) : (
            <button className="ow-btn-primary" disabled>
              Submit (Phase 2)
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
    padding: 56px 32px;
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
  .ow-placeholder {
    text-align: center;
    color: #6b7280;
  }
  .ow-placeholder-eyebrow {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9ca3af;
    margin-bottom: 12px;
  }
  .ow-data-dump {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
    text-align: left;
    margin: 0;
    overflow-x: auto;
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
  .ow-btn-secondary {
    padding: 12px 24px;
    background: transparent;
    color: #4b5563;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .ow-btn-secondary:hover:not(:disabled) { background: #f3f4f6; }
  .ow-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
`;
