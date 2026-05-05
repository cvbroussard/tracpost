"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PostTemplate {
  id: string;
  platform: string;
  format: string;
  name: string;
  description: string | null;
  assetSlots: Record<string, unknown>;
  metadataRequirements: Record<string, unknown>;
  sortOrder: number;
}

interface AssetOption {
  id: string;
  url: string;
  type: string;
  contextNote: string | null;
  qualityScore: number | null;
}

interface RecommendResponse {
  template: { id: string; platform: string; format: string; name: string };
  slotCount: number;
  recommended: AssetOption[];
  alternatives: AssetOption[];
  captionStub: string;
  link: string;
  cta: { type: string; label: string; url: string };
  hashtags: string[];
}

interface PublishResponse {
  postId: string;
  status: string;
  scheduledAt: string;
  publishingTarget: string;
}

type ComposeStep = "select" | "reach" | "recommend" | "review" | "published";
type ReachMode = "organic" | "paid" | "both";

interface ReachContext {
  canonical: {
    placeId: string | null;
    latitude: number | null;
    longitude: number | null;
    placeName: string | null;
    source: "canonical" | "fb_page" | "site_location" | "none";
  };
  defaultRadius: number;
  isEnterprise: boolean;
  siteName: string;
}

interface PlacePrediction {
  placeId: string;
  placeName: string;
}

interface PlaceDetails {
  placeId: string;
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  placeName: string | null;
}

interface ComposeClientProps {
  siteId: string;
}

export function ComposeClient({ siteId: _siteId }: ComposeClientProps) {
  const [step, setStep] = useState<ComposeStep>("select");
  const [templates, setTemplates] = useState<PostTemplate[]>([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PostTemplate | null>(null);

  // Reach-step state (enterprise tier only — mid-tier skips entirely)
  const [reachContext, setReachContext] = useState<ReachContext | null>(null);
  const [reachMode, setReachMode] = useState<ReachMode>("organic");
  const [reachLat, setReachLat] = useState<number | null>(null);
  const [reachLon, setReachLon] = useState<number | null>(null);
  const [reachPlaceName, setReachPlaceName] = useState<string | null>(null);
  const [reachRadius, setReachRadius] = useState<number>(10);
  const [reachOverride, setReachOverride] = useState<PlaceDetails | null>(null);

  // Recommend-step state
  const [recommendation, setRecommendation] = useState<RecommendResponse | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [chosenAssetIds, setChosenAssetIds] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");

  // Trigger-step state
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);

  // Initial template list load
  useEffect(() => {
    fetch("/api/compose/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        setTemplates(d.templates);
        setConnectedPlatforms(d.connectedPlatforms);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  // Group templates by platform
  const grouped: Record<string, PostTemplate[]> = {};
  for (const t of templates) {
    if (!grouped[t.platform]) grouped[t.platform] = [];
    grouped[t.platform].push(t);
  }
  const platformsInOrder = Object.keys(grouped).sort();

  async function selectTemplate(t: PostTemplate) {
    setSelectedTemplate(t);
    setError("");

    // Fetch reach context — determines whether the Reach step appears
    // (enterprise tier) and seeds the canonical place + default radius.
    let ctx: ReachContext | null = null;
    try {
      const ctxRes = await fetch("/api/compose/reach-context");
      if (ctxRes.ok) {
        ctx = await ctxRes.json();
        setReachContext(ctx);
        setReachLat(ctx?.canonical.latitude ?? null);
        setReachLon(ctx?.canonical.longitude ?? null);
        setReachPlaceName(ctx?.canonical.placeName ?? null);
        setReachRadius(ctx?.defaultRadius ?? 10);
        setReachMode("organic");
        setReachOverride(null);
      }
    } catch {
      /* non-fatal — proceed without reach context, fall to Recommend */
    }

    if (ctx?.isEnterprise) {
      // Enterprise: route to Reach step before Recommend
      setStep("reach");
      return;
    }

    // Mid-tier: skip Reach entirely, go straight to Recommend
    await loadRecommendation(t.id);
  }

  async function loadRecommendation(templateId: string) {
    setStep("recommend");
    setRecommendLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/compose/recommend?template_id=${templateId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load recommendation");
        return;
      }
      const data: RecommendResponse = await res.json();
      setRecommendation(data);
      setChosenAssetIds(data.recommended.map((a) => a.id));
      setCaption(data.captionStub);
      setLink(data.link);
      setHashtagsText(data.hashtags.join(" "));
    } finally {
      setRecommendLoading(false);
    }
  }

  async function continueFromReach() {
    if (!selectedTemplate) return;
    await loadRecommendation(selectedTemplate.id);
  }

  function backToSelect() {
    setStep("select");
    setSelectedTemplate(null);
    setRecommendation(null);
    setChosenAssetIds([]);
    setCaption("");
    setLink("");
    setHashtagsText("");
    setError("");
    setPublishResult(null);
    setReachContext(null);
    setReachLat(null);
    setReachLon(null);
    setReachPlaceName(null);
    setReachRadius(10);
    setReachMode("organic");
    setReachOverride(null);
  }

  function backToRecommend() {
    setStep("recommend");
  }

  function swapAsset(oldId: string, newId: string) {
    setChosenAssetIds((prev) => prev.map((id) => (id === oldId ? newId : id)));
  }

  function removeAsset(id: string) {
    setChosenAssetIds((prev) => prev.filter((x) => x !== id));
  }

  function addAsset(id: string) {
    setChosenAssetIds((prev) => [...prev, id]);
  }

  async function publishNow() {
    if (!selectedTemplate) return;
    setPublishing(true);
    setError("");
    try {
      // Parse hashtags: split on whitespace, keep #-prefixed words.
      const hashtags = hashtagsText
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.startsWith("#") && t.length > 1);
      const res = await fetch("/api/compose/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          asset_ids: chosenAssetIds,
          caption,
          link,
          hashtags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to publish");
        return;
      }
      const data: PublishResponse = await res.json();
      setPublishResult(data);
      setStep("published");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Compose</h1>
          <p className="text-xs text-muted mt-0.5">
            {step === "select" && "Pick a template — TracPost will assemble the rest."}
            {step === "reach" && "Choose how this content will reach your audience."}
            {step === "recommend" && `Reviewing the recommended package for ${selectedTemplate?.name ?? "your template"}.`}
            {step === "review" && "Final review before publishing."}
            {step === "published" && "Your post is queued for publishing."}
          </p>
        </div>
        {step !== "select" && step !== "published" && (
          <button
            onClick={
              step === "review" ? backToRecommend
              : step === "recommend" && reachContext?.isEnterprise ? () => setStep("reach")
              : backToSelect
            }
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            ← Back
          </button>
        )}
        {step === "published" && (
          <button
            onClick={backToSelect}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            Compose another
          </button>
        )}
      </header>

      {/* Step pills — include Reach for enterprise tier */}
      <StepIndicator step={step} includeReach={Boolean(reachContext?.isEnterprise)} />

      {loading ? (
        <CenterSpinner />
      ) : error && step === "select" ? (
        <ErrorBox error={error} />
      ) : step === "select" ? (
        templates.length === 0 ? (
          <NoTemplatesEmpty connectedCount={connectedPlatforms.length} />
        ) : (
          <TemplatePicker grouped={grouped} platformsInOrder={platformsInOrder} onSelect={selectTemplate} />
        )
      ) : step === "reach" && reachContext ? (
        <ReachPickerView
          ctx={reachContext}
          mode={reachMode}
          lat={reachLat}
          lon={reachLon}
          placeName={reachPlaceName}
          radius={reachRadius}
          override={reachOverride}
          onModeChange={setReachMode}
          onRadiusChange={setReachRadius}
          onOverride={(p) => {
            setReachOverride(p);
            setReachLat(p.latitude);
            setReachLon(p.longitude);
            setReachPlaceName(p.placeName || p.formattedAddress);
          }}
          onClearOverride={() => {
            setReachOverride(null);
            setReachLat(reachContext.canonical.latitude);
            setReachLon(reachContext.canonical.longitude);
            setReachPlaceName(reachContext.canonical.placeName);
          }}
          onContinue={continueFromReach}
        />
      ) : step === "recommend" || step === "review" ? (
        recommendLoading ? (
          <CenterSpinner />
        ) : recommendation ? (
          <RecommendReviewView
            step={step}
            recommendation={recommendation}
            chosenAssetIds={chosenAssetIds}
            caption={caption}
            link={link}
            hashtagsText={hashtagsText}
            error={error}
            publishing={publishing}
            onCaptionChange={setCaption}
            onLinkChange={setLink}
            onHashtagsChange={setHashtagsText}
            onSwapAsset={swapAsset}
            onRemoveAsset={removeAsset}
            onAddAsset={addAsset}
            onProceedToReview={() => setStep("review")}
            onPublish={publishNow}
          />
        ) : (
          <ErrorBox error={error || "No recommendation"} />
        )
      ) : step === "published" && publishResult ? (
        <PublishedView result={publishResult} template={selectedTemplate} />
      ) : null}
    </div>
  );
}

function StepIndicator({ step, includeReach }: { step: ComposeStep; includeReach: boolean }) {
  const steps: Array<{ key: ComposeStep; label: string }> = includeReach
    ? [
        { key: "select", label: "Select" },
        { key: "reach", label: "Reach" },
        { key: "recommend", label: "Recommend" },
        { key: "review", label: "Review" },
        { key: "published", label: "Trigger" },
      ]
    : [
        { key: "select", label: "Select" },
        { key: "recommend", label: "Recommend" },
        { key: "review", label: "Review" },
        { key: "published", label: "Trigger" },
      ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${
              i < activeIndex
                ? "bg-success text-white"
                : i === activeIndex
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted"
            }`}
          >
            {i + 1}
          </div>
          <span className={i === activeIndex ? "font-medium text-foreground" : "text-muted"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 text-muted">→</span>}
        </div>
      ))}
    </div>
  );
}

function TemplatePicker({
  grouped,
  platformsInOrder,
  onSelect,
}: {
  grouped: Record<string, PostTemplate[]>;
  platformsInOrder: string[];
  onSelect: (t: PostTemplate) => void;
}) {
  return (
    <div className="space-y-6">
      {platformsInOrder.map((platform) => (
        <section key={platform}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {prettyPlatformName(platform)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[platform].map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className="group text-left rounded-xl border border-border bg-surface p-4 shadow-card hover:border-accent hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-muted">{t.format}</span>
                  <span className="text-[10px] text-muted group-hover:text-accent transition-colors">
                    Pick →
                  </span>
                </div>
                <div className="text-sm font-semibold mb-1">{t.name}</div>
                {t.description && (
                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{t.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RecommendReviewProps {
  step: ComposeStep;
  recommendation: RecommendResponse;
  chosenAssetIds: string[];
  caption: string;
  link: string;
  hashtagsText: string;
  error: string;
  publishing: boolean;
  onCaptionChange: (v: string) => void;
  onLinkChange: (v: string) => void;
  onHashtagsChange: (v: string) => void;
  onSwapAsset: (oldId: string, newId: string) => void;
  onRemoveAsset: (id: string) => void;
  onAddAsset: (id: string) => void;
  onProceedToReview: () => void;
  onPublish: () => void;
}

function RecommendReviewView(props: RecommendReviewProps) {
  const { step, recommendation, chosenAssetIds, caption, link, hashtagsText, error, publishing,
          onCaptionChange, onLinkChange, onHashtagsChange, onRemoveAsset, onAddAsset, onProceedToReview, onPublish } = props;
  const isReview = step === "review";
  const assetsById = new Map<string, AssetOption>();
  for (const a of recommendation.recommended) assetsById.set(a.id, a);
  for (const a of recommendation.alternatives) assetsById.set(a.id, a);
  const chosen = chosenAssetIds.map((id) => assetsById.get(id)).filter((a): a is AssetOption => Boolean(a));
  const unused = recommendation.alternatives.filter((a) => !chosenAssetIds.includes(a.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: editable package */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Assets ({chosen.length})</h3>
            <span className="text-[10px] font-mono text-muted">
              slots: {recommendation.slotCount}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {chosen.map((a) => (
              <AssetTile key={a.id} asset={a} onRemove={!isReview ? () => onRemoveAsset(a.id) : undefined} />
            ))}
          </div>
          {!isReview && unused.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                Add another asset ({unused.length} available)
              </summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {unused.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAddAsset(a.id)}
                    className="group relative aspect-square rounded border border-border overflow-hidden hover:border-accent"
                  >
                    {a.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-hover text-muted text-xs">
                        Video
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 rounded-full bg-accent text-white text-[10px] px-1.5 py-0.5">
                      +
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Caption</h3>
          {isReview ? (
            <p className="text-sm text-foreground whitespace-pre-wrap min-h-[3em]">
              {caption || <span className="text-muted italic">(no caption)</span>}
            </p>
          ) : (
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Write a caption..."
              rows={4}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Link</h3>
          {isReview ? (
            <p className="text-sm font-mono text-foreground break-all">{link || <span className="text-muted italic">(no link)</span>}</p>
          ) : (
            <input
              value={link}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder="https://..."
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm font-mono focus:border-accent focus:outline-none"
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Hashtags</h3>
          {isReview ? (
            <p className="text-sm text-foreground">
              {hashtagsText.trim() || <span className="text-muted italic">(no hashtags)</span>}
            </p>
          ) : (
            <>
              <input
                value={hashtagsText}
                onChange={(e) => onHashtagsChange(e.target.value)}
                placeholder="#example #another"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-muted">
                Space-separated. Only words starting with # are kept.
              </p>
            </>
          )}
        </div>

        {error && <ErrorBox error={error} />}
      </div>

      {/* Right: meta + action */}
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-xs text-muted mb-1">Publishing to</p>
          <p className="text-base font-semibold">
            {prettyPlatformName(recommendation.template.platform)}
          </p>
          <p className="text-xs text-muted mt-1 font-mono">
            {recommendation.template.format} · {recommendation.template.name}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">CTA</h3>
          <p className="text-sm text-foreground">
            {recommendation.cta.label}
          </p>
          <p className="text-[11px] text-muted mt-1 font-mono break-all">
            → {recommendation.cta.url}
          </p>
        </div>

        <div className="pt-2">
          {!isReview ? (
            <button
              onClick={onProceedToReview}
              disabled={chosen.length < recommendation.slotCount}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Review →
            </button>
          ) : (
            <button
              onClick={onPublish}
              disabled={publishing}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish now"}
            </button>
          )}
          {!isReview && chosen.length < recommendation.slotCount && (
            <p className="text-[11px] text-muted mt-2">
              Need at least {recommendation.slotCount} asset{recommendation.slotCount === 1 ? "" : "s"} to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetTile({ asset, onRemove }: { asset: AssetOption; onRemove?: () => void }) {
  return (
    <div className="relative aspect-square rounded border border-border overflow-hidden bg-surface-hover">
      {asset.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted text-xs">
          Video
        </div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 rounded-full bg-danger text-white text-[10px] w-5 h-5 leading-none hover:bg-danger/80"
          title="Remove asset"
        >
          ×
        </button>
      )}
    </div>
  );
}

function PublishedView({ result, template }: { result: PublishResponse; template: PostTemplate | null }) {
  const scheduledTime = new Date(result.scheduledAt);
  const now = Date.now();
  const isImmediate = scheduledTime.getTime() <= now + 60000;
  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-6 space-y-3">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-success/20 w-10 h-10 flex items-center justify-center text-success text-lg">
          ✓
        </div>
        <div>
          <h2 className="text-lg font-semibold">Queued for publishing</h2>
          <p className="text-xs text-muted mt-0.5">
            {template?.name} → {prettyPlatformName(result.publishingTarget)}
          </p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-foreground">
          {isImmediate
            ? "Should appear on the platform within the next few minutes."
            : `Scheduled for ${scheduledTime.toLocaleString()}.`}
        </p>
        <p className="text-xs text-muted font-mono">post_id: {result.postId}</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Link
          href="/dashboard/calendar"
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
        >
          View in Calendar →
        </Link>
        <Link
          href="/dashboard/unipost"
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}

interface ReachPickerProps {
  ctx: ReachContext;
  mode: ReachMode;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  radius: number;
  override: PlaceDetails | null;
  onModeChange: (mode: ReachMode) => void;
  onRadiusChange: (miles: number) => void;
  onOverride: (place: PlaceDetails) => void;
  onClearOverride: () => void;
  onContinue: () => void;
}

function ReachPickerView(props: ReachPickerProps) {
  const { ctx, mode, lat, lon, placeName, radius, override,
          onModeChange, onRadiusChange, onOverride, onClearOverride, onContinue } = props;

  const hasCoords = lat != null && lon != null;
  const isPaidMode = mode === "paid" || mode === "both";

  return (
    <div className="space-y-5">
      {/* Mode picker — three tabs */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
          How will this content reach your audience?
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ModeTab
            mode="organic"
            active={mode === "organic"}
            label="🌱 Organic"
            sublabel="Free reach via your followers"
            onClick={() => onModeChange("organic")}
          />
          <ModeTab
            mode="paid"
            active={mode === "paid"}
            label="💰 Paid"
            sublabel="Reach beyond your followers"
            onClick={() => onModeChange("paid")}
          />
          <ModeTab
            mode="both"
            active={mode === "both"}
            label="✨ Both"
            sublabel="Permanent on Page + amplified"
            onClick={() => onModeChange("both")}
            recommended
          />
        </div>
      </div>

      {/* Map + location override — only relevant for paid/both modes
          where targeting matters. Organic mode uses the Page's followers
          regardless of geographic targeting. */}
      {isPaidMode && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                Targeting center
              </div>
              <div className="mt-1 text-sm font-medium">
                {placeName || (hasCoords ? `${lat?.toFixed(4)}, ${lon?.toFixed(4)}` : "(no location)")}
                {override && (
                  <span className="ml-2 text-[10px] rounded-full bg-warning/15 text-warning px-2 py-0.5">
                    overridden for this post
                  </span>
                )}
                {!override && ctx.canonical.source === "fb_page" && (
                  <span className="ml-2 text-[10px] text-muted">
                    (from your connected Facebook Page)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {override && (
                <button
                  onClick={onClearOverride}
                  className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground"
                >
                  Use canonical
                </button>
              )}
            </div>
          </div>

          {/* Static map */}
          {hasCoords ? (
            <StaticMap lat={lat as number} lon={lon as number} radiusMiles={radius} />
          ) : (
            <div className="rounded border border-border bg-surface-hover p-6 text-center text-xs text-muted">
              No coordinates resolved for this site yet.
              {ctx.canonical.source === "site_location" && ctx.canonical.placeName && (
                <span> Pick a precise location below to render the map.</span>
              )}
            </div>
          )}

          {/* Radius slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium">Radius</label>
              <span className="text-xs font-mono">{radius} mi</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Override location autocomplete */}
          <LocationOverrideInput onPlaceResolved={onOverride} />
        </div>
      )}

      {/* Forecast placeholder — full delivery_estimate integration lands
          in the next chunk (Phase 3 of the Reach build). For now show the
          structure so subscribers see what's coming. */}
      {isPaidMode && hasCoords && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">
            Reach forecast
          </div>
          <p className="text-xs text-muted">
            Live audience size + budget estimate from Meta&apos;s Marketing API
            wires in next. For now, expect ~1,500–3,500 people reachable in this
            area at $7/day for 5 days. We&apos;ll plumb the real numbers shortly.
          </p>
        </div>
      )}

      {/* Continue */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onContinue}
          disabled={isPaidMode && !hasCoords}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Continue with {mode === "organic" ? "Organic" : mode === "paid" ? "Paid" : "Both"} →
        </button>
      </div>
    </div>
  );
}

function ModeTab({
  mode: _mode,
  active,
  label,
  sublabel,
  recommended,
  onClick,
}: {
  mode: ReachMode;
  active: boolean;
  label: string;
  sublabel: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border-2 p-4 text-left transition-all ${
        active
          ? "border-accent bg-accent/5 shadow-md"
          : "border-border bg-surface hover:border-accent/40"
      }`}
    >
      {recommended && (
        <span className="absolute top-2 right-2 rounded-full bg-success/15 text-success text-[10px] px-2 py-0.5">
          Recommended
        </span>
      )}
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-[11px] text-muted leading-snug">{sublabel}</div>
    </button>
  );
}

function StaticMap({ lat, lon, radiusMiles }: { lat: number; lon: number; radiusMiles: number }) {
  // Approximate zoom from radius — wider radius = lower zoom
  const zoom = radiusMiles <= 5 ? 12 : radiusMiles <= 15 ? 11 : radiusMiles <= 30 ? 10 : 9;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: String(zoom),
    size: "640x320",
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lon}`,
  });
  // Approximate radius as a circle via path with encoded approximation —
  // Google Static Maps doesn't support true circles, but we can render
  // a polygon-based circle of N segments. For Phase 1 simplicity we just
  // show the marker; circle visualization upgrades to interactive map
  // (Maps JavaScript API or Mapbox) in a follow-up.
  if (apiKey) params.set("key", apiKey);
  const url = `https://maps.googleapis.com/maps/api/staticmap?${params}`;
  return (
    <div className="overflow-hidden rounded border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Targeting area map"
        className="w-full h-auto block"
        loading="lazy"
      />
    </div>
  );
}

function LocationOverrideInput({ onPlaceResolved }: { onPlaceResolved: (p: PlaceDetails) => void }) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showOverride, setShowOverride] = useState(false);

  useEffect(() => {
    if (!showOverride) return;
    if (query.length < 3) {
      setPredictions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/google/places-search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setPredictions(data.predictions || []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, showOverride]);

  async function pickPrediction(p: PlacePrediction) {
    setResolving(true);
    try {
      const res = await fetch(`/api/google/places-details/${encodeURIComponent(p.placeId)}`);
      if (res.ok) {
        const details: PlaceDetails = await res.json();
        onPlaceResolved(details);
        setShowOverride(false);
        setQuery("");
        setPredictions([]);
      }
    } finally {
      setResolving(false);
    }
  }

  if (!showOverride) {
    return (
      <button
        onClick={() => setShowOverride(true)}
        className="text-xs text-blue-700 hover:underline"
      >
        Override location for this post →
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a city or ZIP..."
        autoFocus
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
      />
      {searching && <p className="text-[10px] text-muted">Searching...</p>}
      {predictions.length > 0 && (
        <div className="rounded border border-border bg-surface max-h-48 overflow-y-auto">
          {predictions.map((p) => (
            <button
              key={p.placeId}
              onClick={() => pickPrediction(p)}
              disabled={resolving}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50"
            >
              {p.placeName}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => { setShowOverride(false); setQuery(""); setPredictions([]); }}
        className="text-[10px] text-muted hover:text-foreground"
      >
        Cancel override
      </button>
    </div>
  );
}

function NoTemplatesEmpty({ connectedCount }: { connectedCount: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center">
      <p className="text-sm font-medium mb-2">No templates available yet</p>
      <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
        {connectedCount === 0
          ? "Connect at least one social platform to see publishing templates here. Blog templates are available without any external connection."
          : "Templates exist for your connected platforms but couldn't be loaded. Try refreshing."}
      </p>
      <Link
        href="/dashboard/accounts"
        className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Manage Connections
      </Link>
    </div>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
      <p className="text-sm text-danger">{error}</p>
    </div>
  );
}

function CenterSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function prettyPlatformName(slug: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    pinterest: "Pinterest",
    blog: "Blog",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    gbp: "Google Business Profile",
    twitter: "X (Twitter)",
  };
  return map[slug] ?? slug;
}
