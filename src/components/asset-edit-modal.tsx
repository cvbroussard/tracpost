"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast, confirm as confirmDialog } from "@/components/feedback";
import type { PillarGroup } from "./tag-picker";
// FaceOverlay retired 2026-05-19 with the personas entity removal.
import { useAudioBriefing } from "@/hooks/use-audio-briefing";
import { useAssetAnalysis } from "@/hooks/use-asset-analysis";
import { subscriberAssetAnalysisApi } from "@/lib/asset-analysis-api";
import { AnalyzeResultsPanel } from "@/components/analyze-results-panel";
import {
  AutoTagBar,
  PrimaryToggleButton as AudioToggleButton,
  StateIndicator as AudioStateIndicator,
  StagedPreview as AudioStagedPreview,
} from "@/components/auto-tag-bar";
import { AssetCategoriesSection } from "@/components/asset-categories-section";
import { AssetTagsStrip } from "@/components/asset-tags-strip";
import { AssetPrivacySection } from "@/components/asset-privacy-section";

interface RecordingRow {
  id: string;
  source_asset_id: string | null;
  storage_url: string | null;
  mime_type: string | null;
  duration_ms: number | null;
  transcript: string | null;
  transcribed_at: string | null;
  source: string;
  created_at: string;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface AssetEditModalProps {
  assetId: string;
  siteId: string;
  imageUrl: string;
  mediaType: string;
  initialNote: string;
  initialPillar: string;
  /** Multi-pillar array — Story Angle column. AI seeds with [primary], subscriber multi-selects from full menu. */
  initialPillars?: string[];
  /** Multi-scene-type array — Scene Composition column. AI pre-fills, subscriber edits. */
  initialSceneTypes?: string[];
  initialTags: string[];
  pillarConfig: PillarGroup[];
  availablePillars?: string[];
  brands?: Brand[];
  projects?: Project[];
  /** Site's services catalog (rows from `services` table) — for the
      Services picker (Row 6) and the auto-tag inspector. */
  services?: Array<{ id: string; name: string; slug: string }>;
  /** Site's branches catalog (rows from `branches` table) — for the
      Branches picker (Row 7). */
  branches?: Array<{ id: string; name: string; slug: string }>;
  brandLabel?: string | null;
  projectLabel?: string | null;
  serviceLabel?: string | null;
  branchLabel?: string | null;
  initialBrandIds?: string[];
  initialProjectIds?: string[];
  initialServiceIds?: string[];
  initialBranchIds?: string[];
  personaLabel?: string | null;
  initialPersonaIds?: string[];
  source?: string | null;
  qualityScore?: number | null;
  sceneType?: string | null;
  /** ISO timestamp when subscriber archived this asset, null if active. Per
      project_tracpost_deletion_policy.md, archive is soft-delete: hidden
      from library + orchestrator pool but data persists until subscription
      cancellation + retention sweep. */
  archivedAt?: string | null;
  /** Per #161, subscriber's declaration that this asset is AI-generated /
      AI-modified. Surfaced as a toggle pill in the metadata badge row.
      Was previously per-item toggle on the capture-page staging UI; now
      lives here in the modal where other asset metadata is managed. */
  initialAiGenerated?: boolean;
  /** AI's suggested content pillar (auto-applied; subscriber confirms via #167) */
  aiSuggestedPillar?: string | null;
  /**
   * Existing verification records on this asset. Each entry tracks whether
   * subscriber has confirmed or rejected an AI suggestion. Verifications
   * persist across modal sessions; once verified, items hide from the panel.
   */
  aiVerifications?: Array<{
    field: string;
    value: unknown;
    status: "confirmed" | "rejected";
    verified_at?: string;
  }> | null;
  captionSource?: string | null;
  faces?: Array<{
    box: { x: number; y: number; width: number; height: number };
    score: number;
    personaId: string | null;
    personaName: string | null;
    distance: number | null;
    embedding: number[];
    index: number;
  }> | null;
  faceDetectionWidth?: number;
  faceDetectionHeight?: number;
  personas?: Array<{ id: string; name: string; type: string }>;
  initialMetadata?: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (
    note: string,
    pillar: string,
    tags: string[],
    brandIds?: string[],
    projectIds?: string[],
    personaIds?: string[],
    serviceIds?: string[],
    branchIds?: string[],
    sceneTypes?: string[],
  ) => void;
  onDeleted?: () => void;
  onBrandCreated?: (brand: Brand) => void;
  onProjectCreated?: (project: Project) => void;
  onServiceCreated?: (service: { id: string; name: string; slug: string }) => void;
  onBranchCreated?: (branch: { id: string; name: string; slug: string }) => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export function AssetEditModal({
  assetId,
  siteId,
  imageUrl,
  mediaType,
  initialNote,
  initialPillar,
  initialPillars = [],
  initialSceneTypes = [],
  initialTags,
  pillarConfig,
  brands = [],
  projects = [],
  services = [],
  branches = [],
  brandLabel,
  projectLabel,
  serviceLabel,
  branchLabel,
  initialBrandIds = [],
  initialProjectIds = [],
  initialServiceIds = [],
  initialBranchIds = [],
  personaLabel,
  initialPersonaIds = [],
  source,
  qualityScore,
  sceneType,
  archivedAt,
  initialAiGenerated = false,
  aiSuggestedPillar,
  aiVerifications,
  captionSource,
  faces: initialFaces = null,
  faceDetectionWidth,
  faceDetectionHeight,
  personas: personaList = [],
  onClose,
  onSaved,
  onDeleted,
  initialMetadata,
  onBrandCreated,
  onProjectCreated,
  onServiceCreated,
  onBranchCreated,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
}: AssetEditModalProps) {
  const [faceData, setFaceData] = useState(initialFaces);
  const [note, setNote] = useState(initialNote);
  // Local verifications state — initialized from props, mutated optimistically
  // when subscriber clicks confirm/reject (#167). Server PATCH happens
  // immediately; on failure we revert.
  const [verifications, setVerifications] = useState(aiVerifications || []);
  // AI-generated declaration state. Toggle in the metadata badge row
  // (per the streamlined-upload restructure — AI flag moved out of the
  // capture page and into the modal). Optimistic UI; PATCH fires on
  // toggle and stamps ai_flag_source = "subscriber_declared".
  const [aiGenerated, setAiGenerated] = useState(initialAiGenerated);
  const [savingAi, setSavingAi] = useState(false);
  const _hasGeneratedText = !!(initialMetadata?.generated_text as Record<string, unknown>)?.generated_at;
  const [pillar, setPillar] = useState(initialPillar);
  // Analysis core — tag working-state, the cascade, and the auto-tag
  // inspector — lives in useAssetAnalysis so the manager-side Analysis
  // surface can reuse it. Destructured into the same names the modal's
  // JSX + doSave + handleClose already use, so behavior is unchanged.
  const analysis = useAssetAnalysis({
    assetId,
    siteId,
    api: subscriberAssetAnalysisApi,
    pillarConfig,
    brands,
    projects,
    services,
    branches,
    personas: personaList,
    initialTags,
    initialSceneTypes,
    initialPillars,
    initialPillar,
    initialBrandIds,
    initialProjectIds,
    initialServiceIds,
    initialBranchIds,
    initialPersonaIds,
    onBrandCreated,
    onProjectCreated,
    onServiceCreated,
    onBranchCreated,
  });
  // Only the names the modal itself still uses (doSave / handleClose /
  // suggestFromNote / hashtag / AutoTagBar). The auto-tag inspector's state
  // is consumed by <AnalyzeResultsPanel>, which takes the whole `analysis`.
  const {
    sceneTypesArr, savedSceneTypesArr, setSavedSceneTypesArr,
    tags, setTags, savedTags, setSavedTags,
    pillarsArr, initialPillarsArr,
    brandIds, setBrandIds, savedBrandIds, setSavedBrandIds,
    projectIds, setProjectIds, savedProjectIds, setSavedProjectIds,
    personaIds, savedPersonaIds, setSavedPersonaIds,
    serviceIds, savedServiceIds, setSavedServiceIds,
    branchIds, savedBranchIds, setSavedBranchIds,
    localBrands, localProjects,
    cascadeRef, cascadeBusy, cascadeHasPreview, handleCascadeStateChange,
    categoriesData, handleCategoriesData,
    runAutoTagSuggest,
  } = analysis;

  // Variant thumbnails — rendered below the source media. Loaded on
  // mount + after Save (cascade fires variant render in background;
  // re-fetch happens via cascadeHasPreview transitions). Cheap GET.
  const [variants, setVariants] = useState<Array<{
    id: string;
    template_id: string | null;
    storage_url: string;
    variant_status: string;
    quality_score: number | string | null;
    generated_at: string;
    template_label: string | null;
    aspect_ratio: string | null;
  }>>([]);
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    void fetch(`/api/assets/${assetId}/variants`)
      .then((r) => (r.ok ? r.json() : { variants: [] }))
      .then((d) => { if (!cancelled) setVariants(d.variants ?? []); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [assetId, cascadeHasPreview]);

  // Reset briefing state when navigating to a different asset. The tag /
  // analysis working-state reset is owned by useAssetAnalysis.
  useEffect(() => {
    setFaceData(initialFaces);
    setNote(initialNote);
    setPillar(initialPillar);
    setVerifications(aiVerifications || []);
    setAiGenerated(initialAiGenerated);
    setTypedMode(false);
    setTypedDraft("");
    setReplaceTargetId(null);
    audio.cancel();
    voiceOver.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  async function toggleAiGenerated() {
    const next = !aiGenerated;
    setAiGenerated(next); // optimistic
    setSavingAi(true);
    try {
      await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_generated: next }),
      });
    } catch {
      setAiGenerated(!next); // revert
    }
    setSavingAi(false);
  }
  const [saving, setSaving] = useState(false);
  // Generate button removed — text generation is automatic in the
  // pipeline cron. Caption + pin_headline + display_caption + alt_text
  // + social_hook are generated during triage and saved to metadata.
  // Tenant sees the auto-caption on first visit. Edits context_note
  // directly if they want to change it.
  const [confirmDelete, setConfirmDelete] = useState<boolean | "replace">(false);
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [suggesting, setSuggesting] = useState(false);
  // Story Angle card owns all pillar tag selection — no under-image
  // split, no separate bottom Tags section. Pillar selection derived
  // from tags. (Earlier `showFullPicker`, `sortedPillarsByTagCount`,
  // `pillarsUnderImage`, `pillarsBelowFold` retired with the restructure.)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Replace transcript workflow: subscriber clicks "Replace this
  // transcript" → stash the current latest recording_id; on commit
  // of the new recording, archive the prior. Hoisted above audio
  // hook so onCommitted callback can capture it as a dependency.
  // Asset stays briefed throughout — only the narrative source
  // changes; debriefed state is reserved for whole-asset archiving.
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // Audio briefing — recording is canonical asset narrative
  // (LOCKED 2026-05-10). Stage-on-stop + commit-on-save flow: the
  // subscriber's recording stays in browser memory until commit, then
  // ships to R2 + creates a recording row. The committed recording's
  // transcript becomes the asset's narrative. No append to context_note.
  const audio = useAudioBriefing({
    siteId,
    sourceAssetId: assetId,
    source: "briefing",
    onCommitted: useCallback(
      (recordingId: string, transcript: string) => {
        // Bust the local recordings cache so the Transcription Section
        // picks up the new latest. Latest wins.
        void refetchRecordings();
        // Fire audio-first auto-tagging suggestions per
        // auto_tagging_audit (LOCKED 2026-05-10).
        void runAutoTagSuggest(recordingId, transcript);
        // Replace workflow: if the subscriber initiated this recording
        // via the "Replace transcript" button, archive the prior
        // latest so the new one cleanly takes its place. Asset stays
        // briefed (content_tags untouched).
        if (replaceTargetId && replaceTargetId !== recordingId) {
          void (async () => {
            await archiveRecording(replaceTargetId);
            await refetchRecordings();
            setReplaceTargetId(null);
          })();
        }
      },
      // refetchRecordings + runAutoTagSuggest + replaceTargetId
      // declared below; the callback only fires after audio.commit().
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [replaceTargetId],
    ),
    onError: useCallback((err: Error) => {
      console.warn("Audio briefing error:", err.message);
    }, []),
  });

  // Video element ref for V/O coupling. Voice-over Start triggers
  // video.play() AND captures video.currentTime as the anchor offset
  // for time-anchored transcript segments. V/O Pause triggers
  // video.pause() so audio + video pause together.
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Voice-over capture — only used for video assets. Independent recording
  // group with its own state machine. Commit follows the same pattern.
  // Coupled to the video player via onStart/onStopRequested lifecycle hooks.
  const voiceOver = useAudioBriefing({
    siteId,
    sourceAssetId: assetId,
    source: "voice_over",
    onStart: useCallback(() => {
      const v = videoRef.current;
      if (!v) return undefined;
      // Always rewind to frame 0 — V/O narration anchors to the start of
      // the video so audio-to-video alignment is deterministic across
      // takes. Whisper segment at audio time T = video position T.
      v.currentTime = 0;
      // Best-effort play; some browsers require user-gesture coupling
      // which is satisfied because this fires inside the click handler.
      v.play().catch(() => { /* swallow autoplay rejection */ });
      return { video_offset_seconds: 0 };
    }, []),
    onStopRequested: useCallback(() => {
      videoRef.current?.pause();
    }, []),
    onCommitted: useCallback(
      () => {
        void refetchRecordings();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    ),
    onError: useCallback((err: Error) => {
      console.warn("Voice-over error:", err.message);
    }, []),
  });

  // Recordings list for the Transcription Section (latest + history).
  // Refetched after every commit so the section stays current.
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [recordingsLoaded, setRecordingsLoaded] = useState(false);
  const refetchRecordings = useCallback(async () => {
    try {
      const res = await fetch(`/api/recordings?source_asset_id=${assetId}`);
      if (res.ok) {
        const { recordings: rows } = await res.json();
        setRecordings(rows || []);
      }
    } catch {
      /* ignore — section just stays stale */
    } finally {
      setRecordingsLoaded(true);
    }
  }, [assetId]);
  useEffect(() => {
    setRecordings([]);
    setRecordingsLoaded(false);
    refetchRecordings();
  }, [assetId, refetchRecordings]);

  // Type-instead toggle — accessibility / keyboard-preferring path.
  // When true, an inline textarea appears in the Transcription Section
  // for typed input. On save, if the typed text differs from the latest
  // narrative, a typed-input recording is created.
  const [typedMode, setTypedMode] = useState(false);
  const [typedDraft, setTypedDraft] = useState("");

  // Re-transcribe state. Per-row spinner shows which recording is
  // currently being re-processed. Staged map holds preview results
  // keyed by recording_id — populated by Transcribe, consumed by
  // Save (which PATCHes each one), cleared by Revert. Form is dirty
  // whenever staged.size > 0. Banner indicates any transcript was
  // refreshed in-session — prompts subscriber to re-Analyze after.
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcriptRefreshed, setTranscriptRefreshed] = useState(false);
  type StagedTranscript = {
    transcript: string;
    transcribe_provider: string;
    segments: Array<{ start: number; end: number; text: string }>;
    language: string | null;
  };
  const [stagedTranscripts, setStagedTranscripts] = useState<Map<string, StagedTranscript>>(new Map());

  const retranscribe = useCallback(async (recordingId: string) => {
    setTranscribingId(recordingId);
    try {
      const res = await fetch(`/api/recordings/${recordingId}/transcribe`, {
        method: "POST",
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(error || `Transcribe failed (${res.status})`);
      }
      const { preview } = await res.json();
      if (preview && typeof preview.transcript === "string") {
        // Stage in client state — DO NOT refetch (the DB hasn't changed).
        // Modal Save commits via PATCH; per-row Revert discards.
        setStagedTranscripts((prev) => {
          const next = new Map(prev);
          next.set(recordingId, {
            transcript: preview.transcript,
            transcribe_provider: preview.transcribe_provider,
            segments: preview.segments || [],
            language: preview.language ?? null,
          });
          return next;
        });
        setTranscriptRefreshed(true);
      }
    } catch (err) {
      console.warn("Re-transcribe failed:", err);
    } finally {
      setTranscribingId(null);
    }
  }, []);

  const revertStagedTranscript = useCallback((recordingId: string) => {
    setStagedTranscripts((prev) => {
      const next = new Map(prev);
      next.delete(recordingId);
      return next;
    });
  }, []);

  /** Commits all staged transcripts via PATCH. Called from the save
   * handler. Returns count of committed rows (for telemetry / future
   * toast). Failures per-row are logged but don't abort the batch. */
  const commitStagedTranscripts = useCallback(async (): Promise<number> => {
    if (stagedTranscripts.size === 0) return 0;
    let committed = 0;
    const entries = Array.from(stagedTranscripts.entries());
    for (const [recordingId, staged] of entries) {
      try {
        const res = await fetch(`/api/recordings/${recordingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transcript: staged.transcript,
            transcribe_provider: staged.transcribe_provider,
            segments: staged.segments,
            language: staged.language,
          }),
        });
        if (res.ok) committed++;
        else console.warn(`Commit transcript ${recordingId} failed: ${res.status}`);
      } catch (err) {
        console.warn(`Commit transcript ${recordingId} error:`, err);
      }
    }
    // Clear the staging map only after attempt — refetch will pull the
    // committed state from the DB.
    setStagedTranscripts(new Map());
    await refetchRecordings();
    return committed;
  }, [stagedTranscripts, refetchRecordings]);

  function startReplaceTranscript() {
    const latest = recordings[0];
    if (!latest) return;
    setReplaceTargetId(latest.id);
    audio.start();
  }

  async function archiveRecording(id: string) {
    try {
      await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
    } catch (err) {
      console.warn("Archive recording failed:", err);
    }
  }

  // Scroll-to-top on asset change — when the modal swaps to the next asset
  // via Save & Next, the scrollable inner panel keeps the prior asset's
  // scroll offset, dropping the subscriber halfway down the new asset's
  // content. Reset to top whenever assetId changes.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [assetId]);

  // Keyboard navigation — minimal pass.
  // Recording-bar keyboard re-wire (Space=briefing, V=voice-over, etc.) is
  // intentionally deferred per task #196 until the recording bar settles
  // through subscriber testing. This block keeps the prior briefing-pass
  // shortcuts working against the new state machine names.
  // Hotkeys:
  //   Space → Start (from idle/committed/error) | Stop (from recording/paused)
  //   P     → Pause / Resume toggle
  //   →     → Save + Next asset (commits any staged recordings first)
  //   ←     → Save + Prev asset (commits any staged recordings first)
  //   Esc   → Cancel recording (if recording/paused) else close modal
  useEffect(() => {
    function isEditableFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (audio.state === "recording") {
          e.preventDefault();
          audio.cancel();
        } else if (!isEditableFocused()) {
          e.preventDefault();
          handleClose();
        }
        return;
      }

      if (isEditableFocused()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (audio.state === "recording") {
          audio.stop();
        } else {
          audio.start();
        }
      } else if (e.key === "ArrowRight") {
        if (hasNext && onNext && !saving) {
          e.preventDefault();
          handleSaveAndNext();
        }
      } else if (e.key === "ArrowLeft") {
        if (hasPrev && onPrev && !saving) {
          e.preventDefault();
          (async () => {
            try {
              await doSave();
              onPrev();
            } catch { /* surfaced via toast inside doSave */ }
          })();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.state, hasNext, hasPrev, saving, onClose]);

  // Vendor hashtag autocomplete state
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [hashIndex, setHashIndex] = useState(0);
  const [hashStart, setHashStart] = useState(0);

  // Hashtag autocomplete uses brands
  const hashMatches = hashQuery !== null
    ? localBrands.filter((v) =>
        v.slug.startsWith(hashQuery.toLowerCase()) ||
        v.name.toLowerCase().startsWith(hashQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  function handleNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNote(val);
    suggestFromNote(val);

    // Detect # autocomplete trigger
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const hashMatch = before.match(/#([a-zA-Z0-9_]*)$/);
    if (hashMatch) {
      setHashQuery(hashMatch[1]);
      setHashStart(pos - hashMatch[0].length);
      setHashIndex(0);
    } else {
      setHashQuery(null);
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (hashQuery === null || hashMatches.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHashIndex((i) => Math.min(i + 1, hashMatches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHashIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertBrandTag(hashMatches[hashIndex]);
    } else if (e.key === "Escape") {
      setHashQuery(null);
    }
  }

  function insertBrandTag(brand: Brand) {
    const before = note.slice(0, hashStart);
    const after = note.slice(textareaRef.current?.selectionStart || hashStart + (hashQuery?.length || 0) + 1);
    const inserted = `#${brand.slug} `;
    const newNote = before + inserted + after;
    setNote(newNote);
    setHashQuery(null);

    // Auto-add brand to selection
    setBrandIds((prev) =>
      prev.includes(brand.id) ? prev : [...prev, brand.id]
    );

    // Restore cursor position
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = hashStart + inserted.length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  }

  // Debounced AI tag suggestion
  const suggestFromNote = useCallback((text: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (text.length < 50) return;

    suggestTimer.current = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/suggest-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, contextNote: text }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pillarId) setPillar(data.pillarId);
          if (data.tagIds?.length > 0) {
            // Merge new suggestions with existing — don't overwrite
            setTags((prev) => {
              const merged = new Set([...prev, ...data.tagIds]);
              return Array.from(merged);
            });
          }
        }
      } catch { /* ignore */ }
      setSuggesting(false);
    }, 800);
  }, [siteId, setTags]);

  /**
   * Subscriber confirms or rejects an AI suggestion (#167). Optimistic UI;
   * server PATCH writes to metadata.ai_verifications. Confirmed/rejected
   * items hide from the panel on next render.
   */
  async function recordVerification(field: string, value: unknown, status: "confirmed" | "rejected") {
    const newEntry = {
      field,
      value,
      status,
      verified_at: new Date().toISOString(),
    };
    setVerifications((prev) => {
      const idx = prev.findIndex((v) => v.field === field);
      if (idx >= 0) return prev.map((v, i) => (i === idx ? newEntry : v));
      return [...prev, newEntry];
    });
    try {
      await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_verifications: [{ field, value, status }] }),
      });
    } catch {
      // Best-effort: failure leaves the optimistic state. Surfacing a toast
      // would be nicer; deferred.
    }
  }

  async function doSave(): Promise<boolean> {
    // First: commit any staged recordings. Recording is the canonical
    // narrative now (LOCKED 2026-05-10), so its commit needs to land
    // before the asset PATCH so downstream readers see the new transcript.
    if (audio.state === "staged") {
      await audio.commit();
    }
    if (voiceOver.state === "staged") {
      await voiceOver.commit();
    }
    // Commit any re-transcribe previews staged via the per-recording
    // Transcribe action (2026-05-18). PATCHes each /api/recordings/[id]
    // with the new text + provider + segments. Failures per-row are
    // logged but don't abort the broader save.
    if (stagedTranscripts.size > 0) {
      await commitStagedTranscripts();
    }

    // Second: if a cascade preview is loaded, commit it. The modal
    // Save unifies the prior two-step Apply+Save ceremony (LOCKED
    // 2026-05-16): a loaded preview is a dirty region, Save persists
    // it the same way Save persists a staged recording. No-op when no
    // preview is loaded. Ordering: AFTER recording commit so the
    // transcript-DB row exists before cascade-commit's
    // asset_analysis write (defensive, the cascade artifact already
    // contains the transcript text so this is for downstream readers).
    if (cascadeRef.current?.hasPreview) {
      try {
        await cascadeRef.current.commitPreview();
      } catch (err) {
        console.error("Cascade commit failed during Save:", err);
        // Non-fatal — the asset PATCH below still runs, subscriber
        // can re-trigger Auto-tag from the bar to retry.
      }
    }

    // Third: typed-input path. If the subscriber typed in the
    // "Type instead" textarea and the text differs from the current
    // narrative, persist as a typed-input recording.
    if (typedMode && typedDraft.trim()) {
      const latestTranscript = recordings[0]?.transcript || "";
      if (typedDraft.trim() !== latestTranscript.trim()) {
        try {
          await fetch("/api/recordings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: siteId,
              source_asset_id: assetId,
              transcript: typedDraft.trim(),
              source: "typed_briefing",
            }),
          });
          await refetchRecordings();
        } catch {
          /* surface via toast in caller */
        }
      }
    }

    // Fourth: the asset PATCH for tags / scene types / brands / etc.
    const body: Record<string, unknown> = {};
    // pillar / pillars no longer sent on save. Pillar membership derives
    // from content_tags at read time.
    void pillar; void pillarsArr; void initialPillarsArr;
    if (JSON.stringify([...sceneTypesArr].sort()) !== JSON.stringify([...savedSceneTypesArr].sort())) {
      body.scene_types = sceneTypesArr;
    }
    if (JSON.stringify(tags) !== JSON.stringify(initialTags || [])) body.content_tags = tags;
    if (JSON.stringify(brandIds.sort()) !== JSON.stringify(initialBrandIds.sort())) body.brand_ids = brandIds;
    if (JSON.stringify(projectIds.sort()) !== JSON.stringify(initialProjectIds.sort())) body.project_ids = projectIds;
    if (JSON.stringify(personaIds.sort()) !== JSON.stringify(initialPersonaIds.sort())) body.persona_ids = personaIds;
    if (JSON.stringify(serviceIds.sort()) !== JSON.stringify(initialServiceIds.sort())) body.service_ids = serviceIds;
    if (JSON.stringify(branchIds.sort()) !== JSON.stringify(initialBranchIds.sort())) body.branch_ids = branchIds;

    if (Object.keys(body).length === 0) {
      // Nothing to PATCH but the recording commit may have changed truth.
      // Graduate any preselected pills to confirmed (parent re-render will
      // also flow updated initialBrandIds back, but graduating locally now
      // keeps the visual transition snappy).
      setSavedBrandIds(brandIds);
      setSavedProjectIds(projectIds);
      setSavedPersonaIds(personaIds);
      setSavedServiceIds(serviceIds);
      setSavedBranchIds(branchIds);
      setSavedTags(tags);
      setSavedSceneTypesArr(sceneTypesArr);
      onSaved(note, pillar, tags, brandIds, projectIds, personaIds, serviceIds, branchIds, sceneTypesArr);
      return true;
    }

    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return false;

    // Critical: BOTH save paths must update saved* mirrors. Missing
    // setSavedTags here was the bug behind story angle pills staying
    // light-blue (preselect state) after a successful save — they
    // never graduated to deep-blue (confirmed state) because savedTags
    // wasn't catching up to working state. Same for sceneTypesArr.
    setSavedBrandIds(brandIds);
    setSavedProjectIds(projectIds);
    setSavedPersonaIds(personaIds);
    setSavedServiceIds(serviceIds);
    setSavedBranchIds(branchIds);
    setSavedTags(tags);
    setSavedSceneTypesArr(sceneTypesArr);
    onSaved(note, pillar, tags, brandIds, projectIds, personaIds, serviceIds, branchIds, sceneTypesArr);
    return true;
  }

  // Save & stay — commits staged recordings + asset PATCH, but does NOT
  // close the modal. Subscriber can keep recording, edit tags, etc.
  async function handleSaveStay() {
    setSaving(true);
    try {
      const ok = await doSave();
      if (!ok) toast.error("Failed to save changes");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndNext() {
    if (!onNext) return;
    setSaving(true);
    try {
      await doSave();
      onNext();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  // Master Cancel — discard all staged recordings AND clear typed draft
  // AND drop any staged re-transcriptions. Stays on the modal. No
  // prompt: the subscriber explicitly clicked Cancel.
  function handleCancel() {
    audio.discard();
    voiceOver.discard();
    setTypedMode(false);
    setTypedDraft("");
    setStagedTranscripts(new Map());
  }

  // Close — full dirty-form check across recording, typed input, and
  // every tag working-state diff. The auto-tag inspector eagerly
  // populates working state via 'Suggest tags' (preselected pills);
  // closing without save would silently discard those changes.
  // Uses the in-app confirm dialog (styled via @/components/feedback)
  // instead of window.confirm — async via Promise.
  async function handleClose() {
    const briefingDirty = audio.state === "staged" || audio.state === "recording";
    const voDirty = voiceOver.state === "staged" || voiceOver.state === "recording";
    const typedDirty = typedMode && typedDraft.trim().length > 0;
    const transcribeDirty = stagedTranscripts.size > 0;
    const sortedEq = (a: string[], b: string[]) =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const tagsDirty = !sortedEq(tags, savedTags);
    const brandsDirty = !sortedEq(brandIds, savedBrandIds);
    const projectsDirty = !sortedEq(projectIds, savedProjectIds);
    const personasDirty = !sortedEq(personaIds, savedPersonaIds);
    const servicesDirty = !sortedEq(serviceIds, savedServiceIds);
    const branchesDirty = !sortedEq(branchIds, savedBranchIds);
    const scenesDirty = !sortedEq(sceneTypesArr, savedSceneTypesArr);
    const tagSelectionDirty = tagsDirty || brandsDirty || projectsDirty ||
      personasDirty || servicesDirty || branchesDirty || scenesDirty;
    const isDirty = briefingDirty || voDirty || typedDirty || transcribeDirty || tagSelectionDirty;
    if (isDirty) {
      // Build a specific message so subscriber knows WHAT they'd lose
      const parts: string[] = [];
      if (briefingDirty || voDirty) parts.push("a recording");
      if (typedDirty) parts.push("typed narrative");
      if (transcribeDirty) {
        parts.push(
          stagedTranscripts.size === 1
            ? "a re-transcription"
            : `${stagedTranscripts.size} re-transcriptions`,
        );
      }
      if (tagSelectionDirty) parts.push("tag changes");
      const what = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
      const ok = await confirmDialog({
        title: "Unsaved changes",
        body: `You have unsaved ${what}. Close and discard?`,
        confirmLabel: "Discard & close",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) return;
      handleCancel();
    }
    onClose();
  }


  const totalTagged = initialBrandIds.length + initialProjectIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        ref={scrollContainerRef}
        className="flex w-full max-w-5xl max-h-[90vh] flex-col border border-border bg-surface overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header — was a transparent overlay on the image; now its
            own row so close button + title sit together. */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-6 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Edit Source Asset</h3>
            {/* Briefing-readiness pill (was below the textarea; promoted
                here so subscribers see the autopilot-eligibility state at
                the top of the modal). Only renders when there's a positive
                readiness signal. */}
            {note.trim().length >= 40 && (
              <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
                ✓ Ready for autopilot
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Compact metadata strip — operator-tier signals (sceneType
                singular, qualityScore) removed; subscriber-relevant flags
                only. AI-generated toggle stays here as it's subscriber-
                actionable. */}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              source === "ai_generated" ? "bg-accent/20 text-accent" : "bg-surface-hover text-muted"
            }`}>
              {source === "ai_generated" ? "AI" : mediaType}
            </span>
            {captionSource && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                captionSource === "ai" ? "bg-accent/20 text-accent"
                  : captionSource === "corrected" ? "bg-warning/20 text-warning"
                  : "bg-success/20 text-success"
              }`}>
                {captionSource === "ai" ? "AI caption" : captionSource === "corrected" ? "corrected" : "manual"}
              </span>
            )}
            {totalTagged > 0 && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                {totalTagged} tagged
              </span>
            )}
            <button
              onClick={toggleAiGenerated}
              disabled={savingAi}
              title={aiGenerated
                ? "Marked as AI-generated — disclosure prefix added at publish (per platform compliance)"
                : "Mark this asset as AI-generated or AI-modified"}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                aiGenerated
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:text-foreground"
              } ${savingAi ? "opacity-50" : ""}`}
            >
              {aiGenerated ? "🤖 AI" : "+ Mark as AI"}
            </button>
            <button
              onClick={handleClose}
              className="ml-2 rounded bg-surface-hover px-2 py-1 text-xs text-muted hover:bg-surface-hover/80 hover:text-foreground"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content — restructured 2026-05-11 (second pass). New stack:
              1. RecordingBar (image=1 group; video=2 groups: briefing + V/O)
              2. Auto-tag inspector (when active — surfaces ✨ Suggest tags results)
              3. Transcription Section (latest expanded + earlier collapsed)
              4. Scene Section (image LEFT, Scene Composition RIGHT)
              5. Legacy Context Note (handwritten cue card — read while recording)
              6. Story Angle Section (full-width)
            Tool selectors (brand/project/persona/etc.) follow below.
            Subscriber's read-flow: see narrative source first, review what's
            in the image, then read the cue card for the NEXT take. */}
        <div className="px-6 pt-4">

            {/* AUTO-TAG BAR — sticky top, was RecordingBar (2026-05-16
                identity flip). Left cluster: Auto-tag trigger button
                (+ V/O for video). Right cluster: Cancel/Save/Save&Next/
                Close. Body slot: cascade preview + assignments rendered
                inline so the bar grows to accommodate. The Record button
                lives in the Transcription card below now. */}
            <div className="sticky top-[57px] z-10 -mx-6 mb-3 border-b border-border bg-surface px-6 py-2">
              <AutoTagBar
                audio={audio}
                voiceOver={voiceOver}
                isVideo={mediaType?.startsWith("video") || mediaType === "video"}
                onAutoTag={() => {
                  // Clear stale-transcript banner — subscriber is
                  // acting on it by re-running Analyze.
                  setTranscriptRefreshed(false);
                  cascadeRef.current?.triggerPreview();
                }}
                autoTagDisabled={
                  cascadeBusy ||
                  // Gate on transcript existence — the cascade is
                  // transcript-first (Stage 1 NER hard-requires it).
                  // Subscriber must record (or type) before auto-tag is
                  // available.
                  !(recordings.some((r) => (r.transcript || "").trim().length > 0) ||
                    audio.state === "staged")
                }
                autoTagLabel={
                  cascadeBusy
                    ? "Analyzing…"
                    : cascadeHasPreview
                    ? "⚡ Re-analyze"
                    : "⚡ Analyze"
                }
                onCancel={handleCancel}
                onSave={handleSaveStay}
                onSaveAndNext={handleSaveAndNext}
                onPrev={onPrev}
                onClose={handleClose}
                saving={saving}
                hasNext={hasNext && !!onNext}
                hasPrev={hasPrev && !!onPrev}
              >
                <AssetCategoriesSection
                  ref={cascadeRef}
                  assetId={assetId}
                  api={subscriberAssetAnalysisApi}
                  hideTrigger
                  className=""
                  onStateChange={handleCascadeStateChange}
                  onDataChange={handleCategoriesData}
                />
              </AutoTagBar>
            </div>

            {/* AUTO-TAG INSPECTOR — Analyze results (see AnalyzeResultsPanel). */}
            <AnalyzeResultsPanel
              analysis={analysis}
              pillarConfig={pillarConfig}
              brandLabel={brandLabel}
              projectLabel={projectLabel}
              branchLabel={branchLabel}
              latestRecordingId={recordings[0]?.id ?? null}
            />

            {/* TRANSCRIPTION SECTION — top of the content stack
                (2026-05-11 reorder). Renders right under the
                RecordingBar/auto-tag inspector so subscriber sees
                the canonical narrative source first. Latest transcript
                expanded; earlier ones collapsed in the accordion. */}
            <div className="mb-3 rounded border border-border bg-surface px-3 py-2.5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-foreground">Brief</span>
                  <span className="text-[10px] text-muted">— Recordings for this asset only (latest first).</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!typedMode) {
                      setTypedDraft(recordings[0]?.transcript || "");
                    }
                    setTypedMode((m) => !m);
                  }}
                  className="text-[10px] text-muted underline hover:text-foreground"
                >
                  {typedMode ? "Cancel typing" : "Type instead"}
                </button>
              </div>

              {/* Record button lives in the Transcription card permanently
                  (2026-05-16) — was in the top RecordingBar previously.
                  Whether or not a transcript exists, the subscriber starts
                  capture from inside this card. */}
              {!typedMode && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <AudioToggleButton audio={audio} idleLabel="Record" />
                  <AudioStateIndicator label="Briefing" audio={audio} />
                </div>
              )}
              {!typedMode && audio.state === "staged" && (
                <div className="mb-2">
                  <AudioStagedPreview label="Briefing" audio={audio} />
                </div>
              )}

              {typedMode ? (
                <textarea
                  ref={textareaRef}
                  value={typedDraft}
                  onChange={(e) => {
                    setTypedDraft(e.target.value);
                    handleNoteChange(e);
                  }}
                  onKeyDown={handleNoteKeyDown}
                  className="w-full text-sm"
                  style={{ minHeight: 80 }}
                  placeholder="Type the narrative for this asset…"
                />
              ) : !recordingsLoaded ? (
                <div className="text-[11px] italic text-muted">Loading recordings for this asset…</div>
              ) : recordings.length > 0 && recordings[0].transcript ? (
                <>
                  {replaceTargetId && (
                    <div className="mb-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                      ⚠ Replace mode: this transcript will be archived when you save your new recording. Asset stays briefed.
                    </div>
                  )}
                  {transcriptRefreshed && (
                    <div className="mb-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-accent">
                      ✨ Transcript updated — click <span className="font-semibold">⚡ Analyze</span> above to refresh tags from the new text.
                    </div>
                  )}
                  <RecordingRowView
                    recording={recordings[0]}
                    isLatest
                    transcribing={transcribingId === recordings[0].id}
                    staged={stagedTranscripts.get(recordings[0].id) || null}
                    onRetranscribe={() => retranscribe(recordings[0].id)}
                    onRevertStaged={() => revertStagedTranscript(recordings[0].id)}
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={startReplaceTranscript}
                      disabled={!!replaceTargetId || audio.state === "recording" || audio.state === "previewing" || audio.state === "staged" || audio.state === "committing"}
                      className="text-[10px] text-muted underline hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      title="Start a new recording that will replace this transcript on save. Old recording archives; asset stays briefed."
                    >
                      🔄 Replace this transcript
                    </button>
                    {replaceTargetId && (
                      <button
                        type="button"
                        onClick={() => { setReplaceTargetId(null); audio.discard(); }}
                        className="text-[10px] text-muted underline hover:text-foreground"
                      >
                        Cancel replace
                      </button>
                    )}
                  </div>
                  {recordings.length > 1 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[10px] text-muted hover:text-foreground">
                        + {recordings.length - 1} earlier recording{recordings.length > 2 ? "s" : ""} for this asset
                      </summary>
                      <div className="mt-1 space-y-1.5">
                        {recordings.slice(1).map((r) => (
                          <RecordingRowView
                            key={r.id}
                            recording={r}
                            isLatest={false}
                            transcribing={transcribingId === r.id}
                            staged={stagedTranscripts.get(r.id) || null}
                            onRetranscribe={() => retranscribe(r.id)}
                            onRevertStaged={() => revertStagedTranscript(r.id)}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="rounded border border-dashed border-border bg-background/40 px-3 py-3 text-center text-[11px] text-muted">
                  No transcription exists. Click <span className="font-medium text-foreground">Record</span> above to get started.
                </div>
              )}
            </div>

            {/* MEDIA RENDER — full-width, sits below Auto-tag bar +
                Transcription card. Was previously paired with Scene
                Composition in a 2-col grid; restructured 2026-05-16 so
                media stands alone and Scene Composition becomes a
                legacy stub below. */}
            <div className="mb-3 relative overflow-hidden bg-background min-h-[200px]">
              {mediaType?.startsWith("video") || mediaType === "video" ? (
                <video
                  ref={videoRef}
                  src={imageUrl}
                  controls
                  className="w-full max-h-[36vh] object-contain"
                />
              ) : (
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full max-h-[36vh] object-contain"
                />
              )}
            </div>

            {/* PROJECT BINDING — single-project manual assignment surface.
                Per 2026-05-19: projects are 100% subscriber-managed; the
                cascade no longer touches asset_projects. Single-project
                semantics by design — if subscriber wants the same asset
                in multiple projects, the right answer is to upload it
                again with a different project picker selection (and a
                project-specific transcript). Lifts the picker out of
                the dead auto-tag inspector surface so it's always
                visible and always editable. */}
            {localProjects.length > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-[11px]">
                <span className="text-muted">Project:</span>
                <select
                  value={projectIds[0] || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProjectIds(v ? [v] : []);
                  }}
                  className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                >
                  <option value="">— Unassigned —</option>
                  {localProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {projectIds.length > 0 && projectIds[0] !== savedProjectIds[0] && (
                  <span className="text-[10px] text-warning">unsaved</span>
                )}
              </div>
            )}

            {/* TAGS STRIP — confirmation row of what's currently attached
                to this asset (primary + secondary categories, brands,
                projects, service areas). Sits between source media and
                variants so subscriber sees visual confirmation the
                moment they click Save. Reads shared CategoriesResponse
                (no extra fetch) and hides when nothing is attached. */}
            <AssetTagsStrip data={categoriesData} />

            {/* PRIVACY SECTION — surfaces face detection state + the
                effective face publishing policy. Read-only (per-asset
                override deferred from v1). Three jobs: transparency,
                no-surprises publishing, action escape hatch when state
                is weird (waiver unsigned, suppress mode). Hides when
                detection hasn't run yet or for non-image media. */}
            <AssetPrivacySection assetId={assetId} />

            {/* VARIANT THUMBNAILS — strip of rendered platform variants
                directly below the source media. Each variant is the
                source asset re-rendered into a per-platform aspect
                ratio + format by sharp/ffmpeg (fires async after
                cascade commit; populates within 5-30s). When empty
                (cascade hasn't committed yet, or render still pending)
                this entire block hides. */}
            {variants.filter((v) => v.variant_status === "ready").length > 0 && (() => {
              const readyVariants = variants.filter((v) => v.variant_status === "ready");
              const pendingCount = variants.length - readyVariants.length;
              return (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-muted/70">
                    <span>Variants ({readyVariants.length})</span>
                    {pendingCount > 0 && (
                      <span className="text-[9px] text-muted/50 normal-case tracking-normal">
                        +{pendingCount} still rendering
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {readyVariants.map((v) => {
                      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(v.storage_url);
                      return (
                        <a
                          key={v.id}
                          href={v.storage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block overflow-hidden rounded border border-border bg-background hover:border-accent/60"
                          title={`${v.template_label || v.template_id || "variant"}${v.aspect_ratio ? ` · ${v.aspect_ratio}` : ""}`}
                        >
                          {isVideo ? (
                            <video src={v.storage_url} className="h-20 w-auto object-contain" muted />
                          ) : (
                            <img src={v.storage_url} alt="" className="h-20 w-auto object-contain" />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1 py-0.5 text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                            {v.template_label || v.template_id || "variant"}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Legacy stubs (Scene Composition, Story Angle, Brands,
                Projects, People, Locations) all removed 2026-05-17 —
                the cascade Auto-tag card at the top of the modal now
                surfaces every value those stubs would have shown,
                read-only. State vars + PATCH payload fields stay in
                the component as no-op tombstones until the cascade
                proves out across all subscriber sites. */}
        </div>

        {/* Asset Studio enhancement tools removed from the source-asset modal
            (2026-05-09). Per the apprentice→master architecture lock: tools
            belong on the VARIANT level, not the source. The source asset is
            briefed-once / set-and-forget; enhancement (tool application) is
            what transforms vanilla template variants into master final
            products. The studio surface lives at /manage/variant-studio. */}

        {/* Footer: actions */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          {confirmDelete === "replace" ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">Used in a blog post. Upload a replacement image/video (same type).</span>
              <input
                ref={replaceFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReplacing(true);
                  setReplaceError(null);
                  try {
                    if (file.type.startsWith("video/")) {
                      // Presigned direct-upload path for large files
                      const presignRes = await fetch(`/api/assets/${assetId}/replace`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
                      });
                      const presign = await presignRes.json();
                      if (!presignRes.ok || !presign.uploadUrl) {
                        setReplaceError(presign.error || "Could not prepare upload");
                        setReplacing(false);
                        return;
                      }
                      const put = await fetch(presign.uploadUrl, {
                        method: "PUT",
                        headers: { "Content-Type": file.type },
                        body: file,
                      });
                      if (!put.ok) {
                        setReplaceError("Upload to storage failed");
                        setReplacing(false);
                        return;
                      }
                    } else {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch(`/api/assets/${assetId}/replace`, {
                        method: "POST",
                        body: fd,
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        setReplaceError(data.error || "Replacement failed");
                        setReplacing(false);
                        return;
                      }
                    }
                    // Same URL, new bytes. Close the modal; library re-fetches
                    // via its parent; CDN will catch up within 24h.
                    onDeleted?.();
                    onClose();
                  } catch {
                    setReplaceError("Replacement failed");
                  } finally {
                    setReplacing(false);
                  }
                }}
              />
              <button
                onClick={() => replaceFileRef.current?.click()}
                disabled={replacing}
                className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {replacing ? "Uploading..." : "Choose replacement"}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setReplaceError(null); }}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
              {replaceError && <span className="text-[10px] text-danger">{replaceError}</span>}
            </div>
          ) : archivedAt ? (
            // Asset is currently archived — offer Restore instead of Archive.
            // Per project_tracpost_deletion_policy.md, restore clears
            // archived_at via PATCH {restore: true}.
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Archived</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/assets/${assetId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ restore: true }),
                    });
                    if (res.ok) {
                      onDeleted?.(); // reuse callback to trigger parent refresh
                      onClose();
                    }
                  } catch { /* ignore */ }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="rounded border border-accent text-accent px-3 py-1 text-xs font-medium hover:bg-accent/10 disabled:opacity-50"
              >
                {deleting ? "Restoring..." : "Restore"}
              </button>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">
                Archive this asset? Hidden from your library — restore anytime.
              </span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
                    if (res.ok) {
                      onDeleted?.();
                      onClose();
                    } else {
                      const data = await res.json();
                      if (data.requiresReplace) {
                        setConfirmDelete("replace");
                        setDeleting(false);
                        return;
                      }
                    }
                  } catch { /* ignore */ }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="rounded border border-danger/40 text-danger px-3 py-1 text-xs font-medium hover:bg-danger/10 disabled:opacity-50"
              >
                {deleting ? "Archiving..." : "Yes, archive"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 text-xs text-muted hover:text-foreground hover:underline"
            >
              Archive
            </button>
          )}
          {/* All navigation + save controls live in the top Auto-tag bar
              now. Footer-right kept as a hook for future controls. */}
          <div className="flex items-center gap-2" />
        </div>
      </div>
    </div>
  );
}

/**
 * One row in the Brief section's recording list. Shows file-style
 * label (timestamp · duration · format · source), the transcript,
 * provider + when last transcribed, and a per-row Transcribe action
 * so subscribers can re-derive the transcript without re-recording.
 * Decouples capture from processing — same audio, fresh STT.
 *
 * When `staged` is non-null, the row shows the staged preview text
 * instead of the persisted one, marks itself as pending Save, and
 * exposes a Revert button. Persistence happens via the modal's Save
 * action which PATCHes /api/recordings/[id] (decouples capture from
 * processing AND processing from persistence — 2026-05-18).
 */
function RecordingRowView({
  recording,
  isLatest,
  transcribing,
  staged,
  onRetranscribe,
  onRevertStaged,
}: {
  recording: RecordingRow;
  isLatest: boolean;
  transcribing: boolean;
  staged: { transcript: string; transcribe_provider: string } | null;
  onRetranscribe: () => void;
  onRevertStaged: () => void;
}) {
  const mimeExt = (() => {
    const m = (recording.mime_type || "").toLowerCase();
    if (m.includes("webm")) return "webm";
    if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
    if (m.includes("mp4") || m.includes("m4a")) return "m4a";
    if (m.includes("ogg") || m.includes("opus")) return "ogg";
    if (m.includes("wav")) return "wav";
    if (m.includes("flac")) return "flac";
    return null;
  })();
  const durLabel =
    recording.duration_ms != null
      ? `${Math.round(recording.duration_ms / 100) / 10}s`
      : null;
  const fileLabel = [
    new Date(recording.created_at).toLocaleString(),
    durLabel,
    mimeExt,
    recording.source,
  ]
    .filter(Boolean)
    .join(" · ");
  // Re-transcribe only makes sense for stored-audio recordings.
  // Typed input has no storage_url — disable the button there.
  const canRetranscribe = Boolean(recording.storage_url) && !transcribing;
  // When a staged preview exists, render the staged text in place of
  // the persisted transcript. Visual treatment marks the row as
  // pending Save and exposes a Revert affordance.
  const displayText = staged ? staged.transcript : recording.transcript;
  return (
    <div
      className={`rounded p-2 ${
        staged
          ? "border border-accent/40 bg-accent/5 text-[12px] text-foreground/90"
          : isLatest
          ? "bg-background/40 text-[12px] text-foreground/90"
          : "border border-border bg-background/30 p-1.5 text-[11px] text-muted"
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide text-muted/70">
          {fileLabel}
          {staged && (
            <span className="ml-2 rounded bg-accent/20 px-1 py-0.5 text-[8px] text-accent">
              STAGED — pending Save
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {staged && (
            <button
              type="button"
              onClick={onRevertStaged}
              className="text-[10px] text-muted hover:text-danger"
              title="Discard this staged transcription; original transcript stays"
            >
              ↶ Revert
            </button>
          )}
          <button
            type="button"
            onClick={onRetranscribe}
            disabled={!canRetranscribe}
            className="text-[10px] text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            title={
              recording.storage_url
                ? "Re-run transcription on this audio using the latest STT model + your current catalog vocabulary"
                : "Typed input — no audio to re-transcribe"
            }
          >
            {transcribing ? "Transcribing…" : staged ? "▶ Re-transcribe" : "▶ Transcribe"}
          </button>
        </div>
      </div>
      <div>{displayText}</div>
      {recording.transcribed_at && (
        <div className="mt-1 text-[9px] text-muted/60">
          Last transcribed {new Date(recording.transcribed_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
