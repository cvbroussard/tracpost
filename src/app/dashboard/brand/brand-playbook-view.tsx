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

  // Extract playbook sections
  const offerCore = playbook.offerCore as Record<string, unknown> | undefined;
  const offerStatement = offerCore?.offerStatement as Record<string, string> | undefined;
  const positioning = playbook.brandPositioning as Record<string, unknown> | undefined;
  const selectedAngles = (positioning?.selectedAngles || []) as BrandAngle[];
  const audience = playbook.audienceResearch as Record<string, unknown> | undefined;
  const langMap = audience?.languageMap as Record<string, string[]> | undefined;
  const transformation = audience?.transformationJourney as Record<string, string> | undefined;
  const version = (playbook.version as string) || "";

  // Curated audience phrases — a taste, not the full map
  const audiencePhrases = [
    ...(langMap?.painPhrases?.slice(0, 3) || []),
    ...(langMap?.desirePhrases?.slice(0, 3) || []),
  ];

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
            ? "Your brand playbook has been sharpened around your unique angle. This drives every caption, blog post, and social hook we create for you."
            : "Your brand playbook is ready. Tell us what makes you different to sharpen it."}
        </p>
        {version && (
          <span className="mt-2 inline-block rounded bg-surface-hover px-2 py-0.5 text-[10px] text-muted">
            {version.includes("refined") ? "Sharpened" : "Baseline"}
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
        {refined ? (
          <>
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
              Your playbook is built around this angle. To request a change, contact support.
            </p>
            <div
              className="text-sm leading-relaxed"
              style={{
                padding: "10px 12px",
                borderRadius: "var(--tp-radius)",
                background: "var(--color-input-bg)",
                border: "1px solid var(--color-success)",
                color: "var(--color-foreground)",
              }}
            >
              {angle}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
              What makes you different from every other business in your category? This single input reshapes your entire playbook.
            </p>
            <textarea
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
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

            <button
              onClick={handleRefine}
              disabled={refining || !angle.trim()}
              className="mt-3 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-success)" }}
            >
              {refining ? "Sharpening playbook..." : "Sharpen My Playbook"}
            </button>
          </>
        )}
      </div>

      {/* Your Promise */}
      {offerStatement?.finalStatement && (
        <section className="mb-8">
          <h2 className="mb-4">Your Promise</h2>
          <p className="text-sm italic leading-relaxed">
            &ldquo;{offerStatement.finalStatement}&rdquo;
          </p>
          {offerStatement.emotionalCore && (
            <p className="mt-3 text-xs text-muted">
              {offerStatement.emotionalCore}
            </p>
          )}
        </section>
      )}

      {/* Your Brand */}
      {selectedAngles.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">Your Brand</h2>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between border-b border-border py-2">
              <span className="text-sm text-muted">Positioning</span>
              <span className="text-sm font-medium">{selectedAngles[0].name}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border py-2">
              <span className="text-sm text-muted">Tagline</span>
              <span className="max-w-xs text-right text-sm italic">{selectedAngles[0].tagline}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border py-2">
              <span className="text-sm text-muted">Voice</span>
              <span className="max-w-sm text-right text-sm">{selectedAngles[0].tone}</span>
            </div>
          </div>
          {selectedAngles[0].contentThemes?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">Content themes we create around</p>
              <div className="flex flex-wrap gap-1">
                {selectedAngles[0].contentThemes.map((theme, i) => (
                  <span key={i} className="rounded bg-surface-hover px-2 py-1 text-xs text-muted">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Your Customer */}
      {transformation && (
        <section className="mb-8">
          <h2 className="mb-4">Your Customer</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Where they are now</p>
              <p className="text-sm leading-relaxed">{transformation.currentState}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Where they want to be</p>
              <p className="text-sm leading-relaxed">{transformation.desiredState}</p>
            </div>
          </div>
        </section>
      )}

      {/* How We Speak to Them */}
      {audiencePhrases.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">How We Speak to Them</h2>
          <p className="mb-3 text-sm text-muted">
            Every caption and blog post uses language your customers actually use — not marketing speak.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {audiencePhrases.map((phrase, i) => (
              <span
                key={i}
                className="rounded bg-surface-hover px-2 py-1 text-xs"
              >
                &ldquo;{phrase}&rdquo;
              </span>
            ))}
          </div>
        </section>
      )}

      {/* What's Working For You */}
      <section className="mb-8">
        <div
          style={{
            borderRadius: "var(--tp-radius)",
            background: "var(--color-surface-hover)",
            padding: 16,
          }}
        >
          <p className="text-sm font-medium" style={{ marginBottom: 8 }}>
            What your playbook powers
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-lg font-semibold text-accent">
                {((playbook.contentHooks as Record<string, unknown>)?.lovedHooks as unknown[])?.length || 0}
              </p>
              <p className="text-xs text-muted">Content hooks</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-accent">
                {selectedAngles[0]?.contentThemes?.length || 0}
              </p>
              <p className="text-xs text-muted">Content themes</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            These feed your social captions, blog posts, and publishing schedule automatically.
          </p>
        </div>
      </section>
    </div>
  );
}
