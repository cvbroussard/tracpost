"use client";

import { useState } from "react";

interface BrandAngle {
  name: string;
  tagline: string;
  targetPain: string;
  targetDesire: string;
  tone: string;
  contentThemes: string[];
}

interface PlaybookViewProps {
  siteId: string;
  playbook: Record<string, unknown>;
  subscriberAngle: string | null;
}

export function BrandPlaybookView({ siteId, playbook: initialPlaybook, subscriberAngle }: PlaybookViewProps) {
  const [playbook, setPlaybook] = useState(initialPlaybook);
  const [angle, setAngle] = useState(subscriberAngle || "");
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState(!!subscriberAngle);
  const [error, setError] = useState<string | null>(null);
  const [confirmResharpen, setConfirmResharpen] = useState(false);

  // Extract playbook sections
  const offerCore = playbook.offerCore as Record<string, unknown> | undefined;
  const offerStatement = offerCore?.offerStatement as Record<string, string> | undefined;
  const positioning = playbook.brandPositioning as Record<string, unknown> | undefined;
  const selectedAngles = (positioning?.selectedAngles || []) as BrandAngle[];
  const contentHooks = playbook.contentHooks as Record<string, unknown> | undefined;
  const lovedHooks = (contentHooks?.lovedHooks || []) as { text: string; category: string }[];
  const audience = playbook.audienceResearch as Record<string, unknown> | undefined;
  const langMap = audience?.languageMap as Record<string, string[]> | undefined;
  const painPoints = (audience?.painPoints || []) as { pain: string; severity: string }[];
  const transformation = audience?.transformationJourney as Record<string, string> | undefined;
  const version = (playbook.version as string) || "";

  async function handleRefine() {
    if (!angle.trim()) return;
    setRefining(true);
    setError(null);

    try {
      const res = await fetch("/api/brand-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, action: "refine", angle: angle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refinement failed");
      setPlaybook(data.playbook);
      setRefined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
    } finally {
      setRefining(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1>Brand Intelligence</h1>
        <p className="mt-2 text-muted">
          {refined
            ? "Your playbook has been sharpened with your unique angle."
            : "Your baseline playbook is ready. Tell us what makes you different to sharpen it."}
        </p>
        {version && (
          <span className="mt-2 inline-block rounded bg-surface-hover px-2 py-0.5 text-[10px] text-muted">
            {version.includes("refined") ? "Refined" : "Baseline"}
          </span>
        )}
      </div>

      {/* Refinement input */}
      <div
        className="mb-8 p-5"
        style={{
          borderRadius: "var(--tp-radius)",
          border: "1px solid var(--color-success)",
          background: "rgba(34, 197, 94, 0.05)",
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          {refined ? "Your Angle" : "Tell Us Your Twist"}
        </p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          {refined
            ? "Your playbook is built around this. Edit and resharpen anytime."
            : "What makes you different from every other business in your category? This single input reshapes your entire playbook."}
        </p>
        <textarea
          value={angle}
          onChange={(e) => { setAngle(e.target.value); setConfirmResharpen(false); }}
          placeholder="e.g., We focus on serious home cooks and prosumer chefs — the kitchen should reflect the cooking experience. The recipes, the gear, the culinary elevated."
          rows={3}
          className="w-full text-sm"
          style={{
            border: "1px solid var(--color-success)",
            background: "var(--color-input-bg)",
          }}
          disabled={refining}
        />

        {error && (
          <p className="mt-2 rounded bg-danger/10 p-2 text-sm text-danger">{error}</p>
        )}

        {/* First sharpen — no confirmation needed */}
        {!refined && (
          <button
            onClick={handleRefine}
            disabled={refining || !angle.trim()}
            className="mt-3 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: "var(--color-success)" }}
          >
            {refining ? "Sharpening playbook..." : "Sharpen My Playbook"}
          </button>
        )}

        {/* Resharpen — requires confirmation */}
        {refined && !confirmResharpen && (
          <button
            onClick={() => setConfirmResharpen(true)}
            disabled={refining || !angle.trim()}
            className="mt-3 px-4 py-2 text-xs font-medium text-muted disabled:opacity-50"
            style={{ border: "1px solid var(--color-border)" }}
          >
            Resharpen
          </button>
        )}

        {refined && confirmResharpen && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-warning">
              This will regenerate your playbook, hooks, and content topics. Existing content already published won&apos;t change.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRefine}
                disabled={refining || !angle.trim()}
                className="px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: "var(--color-success)" }}
              >
                {refining ? "Sharpening..." : "Confirm Resharpen"}
              </button>
              <button
                onClick={() => setConfirmResharpen(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Offer Statement */}
      {offerStatement?.finalStatement && (
        <section className="mb-8">
          <div className="rounded bg-accent/5 p-5">
            <h4 className="mb-2 text-sm font-medium text-accent">Your Offer Statement</h4>
            <p className="text-sm italic leading-relaxed">
              &ldquo;{offerStatement.finalStatement}&rdquo;
            </p>
            {offerStatement.emotionalCore && (
              <p className="mt-3 text-xs text-muted">
                Emotional core: {offerStatement.emotionalCore}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Brand Angle */}
      {selectedAngles.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">Brand Angle</h2>
          <div className="border-b border-border pb-4">
            <p className="font-medium">{selectedAngles[0].name}</p>
            <p className="mt-1 text-sm italic text-muted">&ldquo;{selectedAngles[0].tagline}&rdquo;</p>
            <p className="mt-2 text-sm text-muted">Tone: {selectedAngles[0].tone}</p>
            {selectedAngles[0].contentThemes?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {selectedAngles[0].contentThemes.map((theme, i) => (
                  <span key={i} className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">
                    {theme}
                  </span>
                ))}
              </div>
            )}
          </div>
          {selectedAngles.length > 1 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted">Alternative angles</p>
              {selectedAngles.slice(1).map((a, i) => (
                <div key={i} className="border-b border-border pb-3">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs italic text-muted">&ldquo;{a.tagline}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Transformation Journey */}
      {transformation && (
        <section className="mb-8">
          <h2 className="mb-4">Customer Journey</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-danger">Where they are now</p>
              <p className="text-sm leading-relaxed text-muted">{transformation.currentState}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-success">Where they want to be</p>
              <p className="text-sm leading-relaxed text-muted">{transformation.desiredState}</p>
            </div>
          </div>
        </section>
      )}

      {/* Pain Points */}
      {painPoints.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">Pain Points</h2>
          <div className="space-y-2">
            {painPoints.map((p, i) => (
              <div key={i} className="flex items-baseline justify-between border-b border-border py-2">
                <span className="text-sm">{p.pain}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                  p.severity === "critical" ? "bg-danger/10 text-danger"
                    : p.severity === "moderate" ? "bg-warning/10 text-warning"
                    : "bg-surface-hover text-muted"
                }`}>
                  {p.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audience Language */}
      {langMap && (
        <section className="mb-8">
          <h2 className="mb-4">Audience Language</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {langMap.painPhrases?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-danger">Pain phrases</p>
                <div className="flex flex-wrap gap-1">
                  {langMap.painPhrases.map((p, i) => (
                    <span key={i} className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {langMap.desirePhrases?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-success">Desire phrases</p>
                <div className="flex flex-wrap gap-1">
                  {langMap.desirePhrases.map((p, i) => (
                    <span key={i} className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {langMap.searchPhrases?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-accent">Search phrases</p>
                <div className="flex flex-wrap gap-1">
                  {langMap.searchPhrases.map((p, i) => (
                    <span key={i} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {langMap.emotionalTriggers?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Emotional triggers</p>
                <div className="flex flex-wrap gap-1">
                  {langMap.emotionalTriggers.map((p, i) => (
                    <span key={i} className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Hook Bank Preview */}
      {lovedHooks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">Hook Bank ({lovedHooks.length} hooks)</h2>
          <div className="space-y-2">
            {lovedHooks.slice(0, 10).map((hook, i) => (
              <div key={i} className="border-b border-border py-2">
                <p className="text-sm">&ldquo;{hook.text}&rdquo;</p>
                <span className="mt-1 inline-block rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted capitalize">
                  {hook.category.replace("_", " ")}
                </span>
              </div>
            ))}
            {lovedHooks.length > 10 && (
              <p className="text-xs text-muted pt-2">
                + {lovedHooks.length - 10} more hooks in the bank
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
