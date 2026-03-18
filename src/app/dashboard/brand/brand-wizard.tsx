"use client";

import { useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface BrandAngle {
  name: string;
  tagline: string;
  targetPain: string;
  targetDesire: string;
  tone: string;
  contentThemes: string[];
}

interface ContentHook {
  text: string;
  category: string;
}

type HookRating = "loved" | "liked" | "skipped";

interface RatedHook extends ContentHook {
  rating: HookRating;
}

type Phase = "onboarding" | "researching" | "angles" | "hooks" | "generating" | "complete";

// ── Main Component ─────────────────────────────────────────────────

export function BrandWizard({
  siteId,
  initialPhase,
  initialAngles,
  initialHooks,
}: {
  siteId: string;
  initialPhase: Phase;
  initialAngles?: BrandAngle[];
  initialHooks?: ContentHook[];
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState<string | null>(null);

  // Onboarding state
  const [step, setStep] = useState(1);
  const [businessDesc, setBusinessDesc] = useState("");
  const [idealClient, setIdealClient] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [biggestChallenge, setBiggestChallenge] = useState("");
  const [proudestAchievement, setProudestAchievement] = useState("");
  const [whatMakesDiff, setWhatMakesDiff] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [clientComplaints, setClientComplaints] = useState("");

  // Angles state
  const [angles, setAngles] = useState<BrandAngle[]>(initialAngles || []);
  const [selectedAngles, setSelectedAngles] = useState<Set<number>>(new Set());

  // Hooks state
  const [hooks, setHooks] = useState<ContentHook[]>(initialHooks || []);
  const [currentHookIndex, setCurrentHookIndex] = useState(0);
  const [ratedHooks, setRatedHooks] = useState<RatedHook[]>([]);

  // Result state
  const [playbook, setPlaybook] = useState<Record<string, unknown> | null>(null);

  const apiCall = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      const res = await fetch("/api/brand-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [siteId]
  );

  // ── Onboarding Submit ────────────────────────────────────────────

  const submitOnboarding = async () => {
    setPhase("researching");
    try {
      const data = await apiCall({
        action: "start_research",
        input: {
          step1: {
            businessDescription: businessDesc,
            idealClient,
            serviceArea,
          },
          step2: {
            biggestChallenge,
            proudestAchievement,
            whatMakesYouDifferent: whatMakesDiff,
          },
          step3: {
            competitorNames: competitors
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            whatClientsSayAboutOthers: clientComplaints,
          },
        },
      });
      setAngles(data.angles);
      setPhase("angles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
      setPhase("onboarding");
    }
  };

  // ── Angle Selection ──────────────────────────────────────────────

  const toggleAngle = (index: number) => {
    setSelectedAngles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const submitAngles = async () => {
    if (selectedAngles.size === 0) {
      setError("Select at least one angle");
      return;
    }
    setPhase("researching");
    try {
      const data = await apiCall({
        action: "select_angles",
        selected_indices: Array.from(selectedAngles),
      });
      setHooks(data.hooks);
      setCurrentHookIndex(0);
      setRatedHooks([]);
      setPhase("hooks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hook generation failed");
      setPhase("angles");
    }
  };

  // ── Hook Rating ──────────────────────────────────────────────────

  const rateHook = (rating: HookRating) => {
    const hook = hooks[currentHookIndex];
    setRatedHooks((prev) => [...prev, { ...hook, rating }]);
    if (currentHookIndex < hooks.length - 1) {
      setCurrentHookIndex((i) => i + 1);
    } else {
      const allRated = [...ratedHooks, { ...hook, rating }];
      submitHookRatings(allRated);
    }
  };

  const submitHookRatings = async (allRated: RatedHook[]) => {
    setPhase("generating");
    try {
      const data = await apiCall({
        action: "rate_hooks",
        rated_hooks: allRated,
      });
      setPlaybook(data.playbook);
      setPhase("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playbook generation failed");
      setPhase("hooks");
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      {error && (
        <div className="mb-6 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Phase: Onboarding */}
      {phase === "onboarding" && (
        <div>
          <div className="mb-8">
            <h1>Brand Intelligence</h1>
            <p className="mt-2 text-muted">
              Tell us about your business. The more detail you share, the sharper your content strategy.
            </p>
          </div>

          {/* Step indicator */}
          <div className="mb-8 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <button
                  onClick={() => setStep(s)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    step === s
                      ? "bg-accent text-white"
                      : step > s
                        ? "bg-success/20 text-success"
                        : "bg-surface-hover text-muted"
                  }`}
                >
                  {step > s ? "\u2713" : s}
                </button>
                {s < 3 && <div className={`h-px w-10 ${step > s ? "bg-success" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <h2>Your Business & Audience</h2>
              <div>
                <label className="mb-1.5 block text-sm font-medium">What do you do? *</label>
                <textarea
                  value={businessDesc}
                  onChange={(e) => setBusinessDesc(e.target.value)}
                  placeholder="I help [who] achieve [what] through [how]..."
                  rows={3}
                />
                <p className="mt-1.5 text-sm text-muted">Describe your business, service, or expertise.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Who is your ideal client? *</label>
                <textarea
                  value={idealClient}
                  onChange={(e) => setIdealClient(e.target.value)}
                  placeholder="They're typically [role/situation] who struggle with [problem] and want [outcome]..."
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Service area *</label>
                <input
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  placeholder="e.g., West Palm Beach, FL"
                  className="w-full px-3 py-2.5"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={!businessDesc || !idealClient || !serviceArea}
                  className="bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2>Your Story</h2>
                <p className="mt-1 text-sm text-muted">Your experiences shape how you serve. Be honest.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Biggest challenge you&apos;ve overcome? *</label>
                <textarea
                  value={biggestChallenge}
                  onChange={(e) => setBiggestChallenge(e.target.value)}
                  placeholder="Describe a significant obstacle you faced and how you moved through it..."
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Proudest achievement? *</label>
                <textarea
                  value={proudestAchievement}
                  onChange={(e) => setProudestAchievement(e.target.value)}
                  placeholder="Something that made you think 'I did that.' Big or small."
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">What makes you different? *</label>
                <textarea
                  value={whatMakesDiff}
                  onChange={(e) => setWhatMakesDiff(e.target.value)}
                  placeholder="What do you do that others in your space don't?"
                  rows={3}
                />
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="text-sm text-muted hover:text-foreground">
                  &larr; Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!biggestChallenge || !proudestAchievement || !whatMakesDiff}
                  className="bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2>Competitive Landscape</h2>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Competitors (comma separated)</label>
                <input
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  placeholder="e.g., PetSmart training, The Dog Wizard, local trainers"
                  className="w-full px-3 py-2.5"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  What do clients say about alternatives?
                </label>
                <textarea
                  value={clientComplaints}
                  onChange={(e) => setClientComplaints(e.target.value)}
                  placeholder="Common complaints about other options in your space..."
                  rows={3}
                />
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(2)} className="text-sm text-muted hover:text-foreground">
                  &larr; Back
                </button>
                <button
                  onClick={submitOnboarding}
                  className="bg-accent px-5 py-2 text-sm font-medium text-white"
                >
                  Start Research
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase: Researching / Generating (loading) */}
      {(phase === "researching" || phase === "generating") && (
        <div className="flex flex-col items-center py-16">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="font-medium">
            {phase === "researching" ? "Researching your audience..." : "Generating your playbook..."}
          </p>
          <div className="mt-8 w-full max-w-sm space-y-2">
            {phase === "researching" && (
              <>
                <ProgressStep label="Mapping transformation journey" />
                <ProgressStep label="Finding pain points" />
                <ProgressStep label="Analyzing language patterns" />
                <ProgressStep label="Scanning competitive landscape" />
                <ProgressStep label="Crafting brand angles" />
              </>
            )}
            {phase === "generating" && (
              <>
                <ProgressStep label="Analyzing audience psychographics" />
                <ProgressStep label="Extracting emotional core" />
                <ProgressStep label="Crafting offer statement" />
                <ProgressStep label="Generating content strategy" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Phase: Brand Angles Selection */}
      {phase === "angles" && angles.length > 0 && (
        <div>
          <div className="mb-8">
            <h1>Discover Your Unique Edge</h1>
            <p className="mt-2 text-muted">Select the angle(s) that resonate with you.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {angles.map((angle, i) => (
              <button
                key={i}
                onClick={() => toggleAngle(i)}
                className={`border p-5 text-left transition-all ${
                  selectedAngles.has(i)
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-muted"
                }`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-semibold">{angle.name}</h3>
                  {selectedAngles.has(i) && (
                    <span className="text-sm text-accent">\u2713</span>
                  )}
                </div>
                <p className="mb-3 text-sm italic text-muted">&ldquo;{angle.tagline}&rdquo;</p>
                <div className="space-y-1.5 text-sm text-muted">
                  <p><span className="text-danger">&#9632;</span> Addresses: {angle.targetPain}</p>
                  <p><span className="text-success">&#9632;</span> Fulfills: {angle.targetDesire}</p>
                  <p><span className="text-accent">&#9632;</span> Tone: {angle.tone}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {angle.contentThemes.map((theme, j) => (
                    <span key={j} className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">
                      {theme}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={submitAngles}
              disabled={selectedAngles.size === 0}
              className="bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Generate Hooks &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Phase: Hook Rating */}
      {phase === "hooks" && hooks.length > 0 && (
        <div>
          <div className="mb-8">
            <h1>Rate Your Hooks</h1>
            <p className="mt-2 text-muted">
              Swipe through 50 hooks. Save the ones that feel right for your brand.
            </p>
          </div>

          {/* Progress */}
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>{currentHookIndex + 1} of {hooks.length}</span>
            <span>
              <span className="text-danger">&#9829;</span> {ratedHooks.filter((h) => h.rating === "loved").length}
              {" · "}
              <span className="text-warning">&#9830;</span> {ratedHooks.filter((h) => h.rating === "liked").length}
            </span>
          </div>
          <div className="mb-8 h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${((currentHookIndex + 1) / hooks.length) * 100}%` }}
            />
          </div>

          {/* Current hook card */}
          {currentHookIndex < hooks.length && (
            <div className="mb-8 border-b border-border pb-8">
              <span className="mb-3 inline-block rounded bg-surface-hover px-2 py-0.5 text-xs capitalize text-muted">
                {hooks[currentHookIndex].category.replace("_", " ")}
              </span>
              <p className="text-xl font-medium leading-relaxed">
                &ldquo;{hooks[currentHookIndex].text}&rdquo;
              </p>
            </div>
          )}

          {/* Rating buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => rateHook("skipped")}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-hover"
              title="Skip"
            >
              &larr;
            </button>
            <button
              onClick={() => rateHook("liked")}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-xl text-danger hover:bg-danger/20"
              title="Like"
            >
              &#9829;
            </button>
            <button
              onClick={() => rateHook("loved")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-lg text-warning hover:bg-warning/20"
              title="Love"
            >
              &#9830;
            </button>
          </div>
          <p className="mt-3 text-center text-sm text-muted">
            &larr; skip · &#9829; like · &#9830; love
          </p>
        </div>
      )}

      {/* Phase: Complete */}
      {phase === "complete" && (
        <div>
          <div className="mb-8 text-center">
            <p className="mb-3 text-4xl">&#9733;</p>
            <h1>Brand Intelligence Complete</h1>
            <p className="mt-2 text-muted">
              Your playbook is ready. Every blog post, caption, and social hook will now be informed by your brand intelligence.
            </p>
          </div>

          {playbook && (
            <div className="space-y-6">
              {/* Offer statement preview */}
              <div className="rounded-lg bg-accent/5 p-5">
                <h4 className="mb-2 text-accent">Your Offer Statement</h4>
                <p className="italic">
                  &ldquo;{(playbook as Record<string, Record<string, Record<string, string>>>).offerCore?.offerStatement?.finalStatement}&rdquo;
                </p>
              </div>

              {/* Hook bank summary */}
              <div>
                <h4 className="mb-2">Hook Bank</h4>
                <p className="text-muted">
                  {ratedHooks.filter((h) => h.rating === "loved").length} fire hooks,{" "}
                  {ratedHooks.filter((h) => h.rating === "liked").length} liked hooks saved
                </p>
              </div>

              <div className="text-center pt-4">
                <a
                  href="/dashboard"
                  className="bg-accent px-6 py-2.5 text-sm font-medium text-white"
                >
                  Go to Dashboard
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Progress Step (animated) ───────────────────────────────────────

function ProgressStep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
