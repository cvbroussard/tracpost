"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "@/components/feedback";
import type { PillarGroup } from "./tag-picker";
import { FaceOverlay } from "./face-overlay";
import { useAudioBriefing } from "@/hooks/use-audio-briefing";
import { RecordingBar } from "@/components/recording-bar";
import { SCENE_TYPES } from "@/lib/scene-types";

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
  brandLabel?: string | null;
  projectLabel?: string | null;
  initialBrandIds?: string[];
  initialProjectIds?: string[];
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
  onSaved: (note: string, pillar: string, tags: string[], brandIds?: string[], projectIds?: string[], personaIds?: string[]) => void;
  onDeleted?: () => void;
  onBrandCreated?: (brand: Brand) => void;
  onProjectCreated?: (project: Project) => void;
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
  brandLabel,
  projectLabel,
  initialBrandIds = [],
  initialProjectIds = [],
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
  // Subscriber-controlled multi-arrays for Story Angle (via tags) and
  // Scene Composition. Pillars are now DERIVED from tags rather than
  // independently selected — tag click in the Story Angle card is the
  // single source of truth. Scene types stay as their own array.
  const [sceneTypesArr, setSceneTypesArr] = useState<string[]>(initialSceneTypes);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  // pillarsArr derived from tags + pillarConfig (parents of selected tags).
  // Computed inline at save time; no setter needed.
  const pillarsArr = Array.from(
    new Set(
      tags
        .map((tagId) => pillarConfig.find((p) => p.tags.some((t) => t.id === tagId))?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  // initialPillarsArr captures the seeded value to compute the save-time diff.
  const initialPillarsArr = initialPillars.length > 0 ? initialPillars : initialPillar ? [initialPillar] : [];
  const [brandIds, setBrandIds] = useState<string[]>(initialBrandIds);
  const [projectIds, setProjectIds] = useState<string[]>(initialProjectIds);
  const [personaIds, setPersonaIds] = useState<string[]>(initialPersonaIds);

  // Reset state when navigating to a different asset
  useEffect(() => {
    setFaceData(initialFaces);
    setNote(initialNote);
    setPillar(initialPillar);
    setSceneTypesArr(initialSceneTypes);
    setTags(initialTags || []);
    setBrandIds(initialBrandIds);
    setProjectIds(initialProjectIds);
    setPersonaIds(initialPersonaIds);
    setVerifications(aiVerifications || []);
    setAiGenerated(initialAiGenerated);
    setTypedMode(false);
    setTypedDraft("");
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
  const [localBrands, setLocalBrands] = useState(brands);
  const [localProjects, setLocalProjects] = useState(projects);
  const [newBrandName, setNewBrandName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
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
      (_recordingId: string, _transcript: string) => {
        // Bust the local recordings cache so the Transcription Section
        // picks up the new latest. Latest wins.
        void _recordingId;
        void _transcript;
        void refetchRecordings();
      },
      // refetchRecordings declared below; safe because the callback only
      // fires after assets are mounted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
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
      const offsetSeconds = v.currentTime;
      // Best-effort play; some browsers require user-gesture coupling
      // which is satisfied because this fires inside the click handler.
      v.play().catch(() => { /* swallow autoplay rejection */ });
      return { video_offset_seconds: offsetSeconds };
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
  }, [siteId]);

  async function quickCreateBrand() {
    if (!newBrandName.trim()) return;
    setCreatingBrand(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBrandName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalBrands((prev) => [...prev, data.brand].sort((a: Brand, b: Brand) => a.name.localeCompare(b.name)));
        setBrandIds((prev) => [...prev, data.brand.id]);
        setNewBrandName("");
        onBrandCreated?.(data.brand);
      }
    } catch { /* ignore */ }
    setCreatingBrand(false);
  }

  async function quickCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalProjects((prev) => [...prev, data.project].sort((a: Project, b: Project) => a.name.localeCompare(b.name)));
        setProjectIds((prev) => [...prev, data.project.id]);
        setNewProjectName("");
        onProjectCreated?.(data.project);
      }
    } catch { /* ignore */ }
    setCreatingProject(false);
  }

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

    // Second: typed-input path. If the subscriber typed in the
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

    // Third: the asset PATCH for tags / scene types / brands / etc.
    const body: Record<string, unknown> = {};
    // pillar / pillars no longer sent on save. Pillar membership derives
    // from content_tags at read time.
    void pillar; void pillarsArr; void initialPillarsArr;
    if (JSON.stringify([...sceneTypesArr].sort()) !== JSON.stringify([...initialSceneTypes].sort())) {
      body.scene_types = sceneTypesArr;
    }
    if (JSON.stringify(tags) !== JSON.stringify(initialTags || [])) body.content_tags = tags;
    if (JSON.stringify(brandIds.sort()) !== JSON.stringify(initialBrandIds.sort())) body.brand_ids = brandIds;
    if (JSON.stringify(projectIds.sort()) !== JSON.stringify(initialProjectIds.sort())) body.project_ids = projectIds;
    if (JSON.stringify(personaIds.sort()) !== JSON.stringify(initialPersonaIds.sort())) body.persona_ids = personaIds;

    if (Object.keys(body).length === 0) {
      onSaved(note, pillar, tags, brandIds, projectIds, personaIds);
      return true;
    }

    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return false;

    onSaved(note, pillar, tags, brandIds, projectIds, personaIds);
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

  // Master Cancel — discard all staged recordings AND clear typed draft.
  // Stays on the modal. No prompt: the subscriber explicitly clicked Cancel.
  function handleCancel() {
    audio.discard();
    voiceOver.discard();
    setTypedMode(false);
    setTypedDraft("");
  }

  // Close — dirty-form check, then close. Routes through window.confirm
  // for now (full dirty-form guard arrives with task #183).
  function handleClose() {
    const briefingDirty = audio.state === "staged" || audio.state === "recording";
    const voDirty = voiceOver.state === "staged" || voiceOver.state === "recording";
    const typedDirty = typedMode && typedDraft.trim().length > 0;
    if (briefingDirty || voDirty || typedDirty) {
      const ok = window.confirm("You have unsaved recordings or typed text. Close and discard them?");
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

        {/* Content — restructured 2026-05-10 per the recording-as-canonical
            pivot. New stack:
              1. RecordingBar (image=1 group; video=2 groups: briefing + V/O)
              2. Scene Section (image LEFT, Scene Composition RIGHT)
              3. Story Angle Section (full-width)
              4. Transcription Section (latest transcript + history + Type-instead)
            Tool selectors (brand/project/persona) follow below. */}
        <div className="px-6 pt-4">

            {/* RECORDING BAR v2 — sticky top, consolidated 6-button toolbar.
                Capture cluster (Record + V/O) on the left, action cluster
                (Cancel/Save/Save & Next/Close) on the right. State indicators
                + staged transcript previews flow below. */}
            <div className="sticky top-[57px] z-10 -mx-6 mb-3 border-b border-border bg-surface px-6 py-2">
              <RecordingBar
                audio={audio}
                voiceOver={voiceOver}
                isVideo={mediaType?.startsWith("video") || mediaType === "video"}
                onCancel={handleCancel}
                onSave={handleSaveStay}
                onSaveAndNext={handleSaveAndNext}
                onClose={handleClose}
                saving={saving}
                hasNext={hasNext && !!onNext}
              />
            </div>

            {/* SCENE SECTION — image LEFT, Scene Composition RIGHT, 2-col.
                Image container uses position:relative + absolute children
                so the media never exceeds the SC card's height. Grid's
                items-stretch makes both columns the same row height; the
                absolute media + object-contain confines the visual to that. */}
            <div className="mb-3 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              <div className="relative min-h-[200px] overflow-hidden bg-background">
                {mediaType?.startsWith("video") || mediaType === "video" ? (
                  <video
                    ref={videoRef}
                    src={imageUrl}
                    controls
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : faceData && faceData.length > 0 ? (
                  <FaceOverlay
                    imageUrl={imageUrl}
                    faces={faceData}
                    detectionWidth={faceDetectionWidth}
                    detectionHeight={faceDetectionHeight}
                    personas={personaList}
                    assetId={assetId}
                    onFaceNamed={(faceIndex, personaId, personaName) => {
                      setFaceData((prev) =>
                        prev ? prev.map((f, i) =>
                          i === faceIndex ? { ...f, personaId, personaName } : f
                        ) : prev
                      );
                    }}
                  />
                ) : (
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
              </div>
              <div>
                {SCENE_TYPES.length > 0 && (
                  <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2.5">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-accent">Scene Composition</span>
                        <span className="text-[10px] text-muted">— What&apos;s actually shown.</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {SCENE_TYPES.map((s) => {
                        const checked = sceneTypesArr.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-accent/5"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSceneTypesArr((prev) => [...prev, s.id]);
                                } else {
                                  setSceneTypesArr((prev) => prev.filter((id) => id !== s.id));
                                }
                              }}
                              className="mt-0.5 shrink-0"
                            />
                            <span className="flex-1 text-[11px]">
                              <span className="font-medium text-foreground">{s.label}</span>
                              <span className="ml-1 text-muted">— {s.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LEGACY CONTEXT NOTE — read-only "cue card" for handwritten
                notes from the pre-recording era. Surfaces only when the
                asset has a non-empty context_note (B2K and EK both have
                rich handwritten notes that are useful as a script/prompt
                while recording). Disappears once context_note is dropped
                in migration #109. */}
            {initialNote && initialNote.trim() && (
              <div className="mb-3 rounded border border-warning/30 bg-warning/5 px-3 py-2.5">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-warning">Legacy Context Note</span>
                  <span className="text-[10px] text-muted">— Handwritten cue card. Read from this while recording.</span>
                </div>
                <div className="whitespace-pre-wrap rounded bg-background/40 p-2 text-[12px] leading-relaxed text-foreground/90">
                  {initialNote}
                </div>
              </div>
            )}

            {/* STORY ANGLE SECTION — full-width, second priority */}
            {pillarConfig.length > 0 && (
              <div className="mb-3 rounded border border-accent/30 bg-accent/5 px-3 py-2.5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium text-accent">Story Angle</span>
                    <span className="text-[10px] text-muted">
                      — What this asset is meant to say. Pick the tags that fit; pillar membership follows automatically.
                    </span>
                  </div>
                  <a
                    href="/help/asset-tagging"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[10px] text-muted underline hover:text-foreground"
                  >
                    Learn more
                  </a>
                </div>
                <div className="space-y-3">
                  {pillarConfig.map((p) => (
                    <div key={p.id} className="rounded px-2 py-1.5">
                      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[11px] font-semibold text-foreground">{p.label}</span>
                        {p.description && (
                          <span className="text-[10px] text-muted">— {p.description}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.tags.map((t) => {
                          const checked = tags.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => {
                                if (checked) {
                                  setTags((prev) => prev.filter((id) => id !== t.id));
                                } else {
                                  setTags((prev) => [...prev, t.id]);
                                }
                              }}
                              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                checked
                                  ? "bg-accent text-white"
                                  : "bg-surface-hover text-muted hover:text-foreground"
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                        {p.tags.length === 0 && (
                          <span className="text-[10px] italic text-muted">
                            No tags configured — edit in Business settings
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TRANSCRIPTION SECTION — third priority. Shows the asset's
                canonical narrative (latest recording transcript) with a
                history accordion and a "Type instead" escape hatch. During
                the migration window, falls back to the legacy context_note
                if no recordings exist for the asset. */}
            <div className="mb-3 rounded border border-border bg-surface px-3 py-2.5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-foreground">Transcription</span>
                  <span className="text-[10px] text-muted">— Asset narrative (from latest recording).</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!typedMode) {
                      setTypedDraft(recordings[0]?.transcript || initialNote || "");
                    }
                    setTypedMode((m) => !m);
                  }}
                  className="text-[10px] text-muted underline hover:text-foreground"
                >
                  {typedMode ? "Cancel typing" : "Type instead"}
                </button>
              </div>

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
              ) : recordings.length > 0 && recordings[0].transcript ? (
                <>
                  <div className="rounded bg-background/40 p-2 text-[12px] text-foreground/90">
                    {recordings[0].transcript}
                  </div>
                  {recordings.length > 1 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[10px] text-muted hover:text-foreground">
                        + {recordings.length - 1} earlier recording{recordings.length > 2 ? "s" : ""}
                      </summary>
                      <div className="mt-1 space-y-1.5">
                        {recordings.slice(1).map((r) => (
                          <div
                            key={r.id}
                            className="rounded border border-border bg-background/30 p-1.5 text-[11px] text-muted"
                          >
                            <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted/70">
                              {new Date(r.created_at).toLocaleString()} · {r.source}
                            </div>
                            {r.transcript}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : initialNote ? (
                <div className="rounded bg-background/40 p-2 text-[12px] text-foreground/90 italic">
                  {initialNote}
                  <div className="mt-1 text-[9px] uppercase tracking-wide text-muted/70">
                    Legacy context note — will migrate to a recording on next save.
                  </div>
                </div>
              ) : (
                <div className="text-[11px] italic text-muted">
                  {recordingsLoaded
                    ? "No narrative yet — record one above or type it in."
                    : "Loading…"}
                </div>
              )}
            </div>
        </div>

        {/* Bottom Tags section retired 2026-05-09 — Story Angle card above
            owns all pillar tag selection. Selected pills are visible inline
            on each pillar row; no need for a separate chip strip. */}

        {/* Row 3: Brands */}
        {brandLabel && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{brandLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localBrands.map((b) => {
                const selected = brandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      setBrandIds((prev) =>
                        selected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {b.name}
                    {b.url && selected && (
                      <span className="ml-1 text-accent/50">↗</span>
                    )}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateBrand()}
                  placeholder={`+ ${brandLabel}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newBrandName.trim() && (
                  <button
                    onClick={quickCreateBrand}
                    disabled={creatingBrand}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingBrand ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Row 4: Projects */}
        {projectLabel && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{projectLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localProjects.map((p) => {
                const selected = projectIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setProjectIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateProject()}
                  placeholder={`+ ${projectLabel}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newProjectName.trim() && (
                  <button
                    onClick={quickCreateProject}
                    disabled={creatingProject}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingProject ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Row 5: Personas */}
        {personaLabel && personaList.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{personaLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {personaList.map((p) => {
                const selected = personaIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPersonaIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
          {/* Cancel / Save / Save & Next / Close moved to the top RecordingBar v2.
              Footer-right keeps only Prev for symmetry with the keyboard ←
              shortcut. The save-state buttons are at the top now. */}
          <div className="flex items-center gap-2">
            {hasPrev && (
              <button
                onClick={onPrev}
                className="px-3 py-2 text-xs text-muted hover:text-foreground"
              >
                ← Prev
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
