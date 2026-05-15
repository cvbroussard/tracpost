"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast, confirm as confirmDialog } from "@/components/feedback";
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
  /** Site's services catalog (rows from `services` table) — for the
      Services picker (Row 6) and the auto-tag inspector. */
  services?: Array<{ id: string; name: string; slug: string }>;
  /** Site's branches catalog (rows from `branches` table) — for the
      Branches picker (Row 7). */
  branches?: Array<{ id: string; name: string; slug: string }>;
  /** Site's service-area overlay rows (joined to canonical for display
      name) — id is `site_service_areas.id`. For Service Areas picker
      (Row 8). */
  serviceAreas?: Array<{ id: string; name: string; slug: string }>;
  brandLabel?: string | null;
  projectLabel?: string | null;
  serviceLabel?: string | null;
  branchLabel?: string | null;
  serviceAreaLabel?: string | null;
  initialBrandIds?: string[];
  initialProjectIds?: string[];
  initialServiceIds?: string[];
  initialBranchIds?: string[];
  initialServiceAreaIds?: string[];
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
    serviceAreaIds?: string[],
    sceneTypes?: string[],
  ) => void;
  onDeleted?: () => void;
  onBrandCreated?: (brand: Brand) => void;
  onProjectCreated?: (project: Project) => void;
  onServiceCreated?: (service: { id: string; name: string; slug: string }) => void;
  onBranchCreated?: (branch: { id: string; name: string; slug: string }) => void;
  onServiceAreaCreated?: (area: { id: string; name: string; slug: string }) => void;
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
  serviceAreas = [],
  brandLabel,
  projectLabel,
  serviceLabel,
  branchLabel,
  serviceAreaLabel,
  initialBrandIds = [],
  initialProjectIds = [],
  initialServiceIds = [],
  initialBranchIds = [],
  initialServiceAreaIds = [],
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
  onServiceAreaCreated,
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
  // saved* mirror for Story Angle tags — same three-state pattern as
  // brands/projects/personas (per project_tracpost_three_state_pills.md).
  // Auto-tag-suggest writes to `tags` directly; without a saved mirror,
  // pre-save preselects look identical to saved truth.
  const [savedTags, setSavedTags] = useState<string[]>(initialTags || []);
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
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceIds);
  const [branchIds, setBranchIds] = useState<string[]>(initialBranchIds);
  const [serviceAreaIds, setServiceAreaIds] = useState<string[]>(initialServiceAreaIds);
  // saved* mirror initialBrandIds/etc but advance on every successful save.
  // Used to distinguish "confirmed" pills (saved truth, deep color) from
  // "preselected" pills (auto-tag pending, light color, may be unchecked
  // before save).
  const [savedBrandIds, setSavedBrandIds] = useState<string[]>(initialBrandIds);
  const [savedProjectIds, setSavedProjectIds] = useState<string[]>(initialProjectIds);
  const [savedPersonaIds, setSavedPersonaIds] = useState<string[]>(initialPersonaIds);
  const [savedServiceIds, setSavedServiceIds] = useState<string[]>(initialServiceIds);
  const [savedBranchIds, setSavedBranchIds] = useState<string[]>(initialBranchIds);
  const [savedServiceAreaIds, setSavedServiceAreaIds] = useState<string[]>(initialServiceAreaIds);
  const [savedSceneTypesArr, setSavedSceneTypesArr] = useState<string[]>(initialSceneTypes);
  // Local catalog mirrors so quick-create flows can append to the picker
  // without a server refetch.
  const [localServices, setLocalServices] = useState(services);
  const [localBranches, setLocalBranches] = useState(branches);
  const [localServiceAreas, setLocalServiceAreas] = useState(serviceAreas);
  const [localPersonas, setLocalPersonas] = useState(personaList);

  // Reset state when navigating to a different asset
  useEffect(() => {
    setFaceData(initialFaces);
    setNote(initialNote);
    setPillar(initialPillar);
    setSceneTypesArr(initialSceneTypes);
    setTags(initialTags || []);
    setSavedTags(initialTags || []);
    setBrandIds(initialBrandIds);
    setProjectIds(initialProjectIds);
    setPersonaIds(initialPersonaIds);
    setServiceIds(initialServiceIds);
    setBranchIds(initialBranchIds);
    setServiceAreaIds(initialServiceAreaIds);
    setSavedBrandIds(initialBrandIds);
    setSavedProjectIds(initialProjectIds);
    setSavedPersonaIds(initialPersonaIds);
    setSavedServiceIds(initialServiceIds);
    setSavedBranchIds(initialBranchIds);
    setSavedServiceAreaIds(initialServiceAreaIds);
    setSavedSceneTypesArr(initialSceneTypes);
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
  const [localBrands, setLocalBrands] = useState(brands);
  const [localProjects, setLocalProjects] = useState(projects);
  const [newBrandName, setNewBrandName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newServiceAreaName, setNewServiceAreaName] = useState("");
  const [newPersonaName, setNewPersonaName] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [creatingServiceArea, setCreatingServiceArea] = useState(false);
  const [creatingPersona, setCreatingPersona] = useState(false);
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

  // Auto-tag inspector state (LOCKED 2026-05-10).
  // Per memory/project_tracpost_auto_tag_inspector_design.md: cross-group
  // catalog scan + NER produces per-group results. Subscriber sees applied
  // matches (existing-catalog hits, server-side auto-linked) and suggested
  // new (NER proposals — brand-only). All matches additive, no suppression.
  type InspectorMatch = { entity_id: string; name: string; match_text: string; match_start: number; context_excerpt: string };
  type InspectorNew = { name: string; slug: string; context: string; source?: string; keyword?: string };
  type InspectorGroup = { applied_matches: InspectorMatch[]; suggested_new: InspectorNew[] };
  type InspectorTagGroup = "brand" | "service" | "project" | "persona" | "branch" | "service_area";
  type InspectorState = Record<InspectorTagGroup, InspectorGroup>;
  const [inspectorState, setInspectorState] = useState<InspectorState | null>(null);
  const [autoTagging, setAutoTagging] = useState(false);
  // Track that a suggestion run completed (success or no-result). Used
  // to render the panel even when zero matches surfaced so subscriber can
  // tell the system ran. Null = never ran this session.
  const [lastSuggestRunAt, setLastSuggestRunAt] = useState<number | null>(null);
  const [autoAppliedTagCount, setAutoAppliedTagCount] = useState(0);
  // Track WHICH tag IDs were auto-applied so the result card can render
  // them as labeled pills (not just a count). Resets per auto-tag run.
  const [autoAppliedTagIds, setAutoAppliedTagIds] = useState<string[]>([]);
  // Same idea for scene composition — track which scene_type IDs were
  // freshly applied by this auto-tag run so the card can surface them.
  const [autoAppliedSceneTypeIds, setAutoAppliedSceneTypeIds] = useState<string[]>([]);
  const [nerWarnings, setNerWarnings] = useState<string[]>([]);

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

  // Track the last transcript we ran auto-tag-suggest against. Used to
  // guard against double-firing when the same transcript reaches us
  // BOTH eagerly (staged state, pre-commit) AND via onCommitted.
  const lastProcessedTranscriptRef = useRef<string>("");

  // Scroll-to-top on asset change — when the modal swaps to the next asset
  // via Save & Next, the scrollable inner panel keeps the prior asset's
  // scroll offset, dropping the subscriber halfway down the new asset's
  // content. Reset to top whenever assetId changes.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [assetId]);

  const runAutoTagSuggest = useCallback(async (recordingId: string, transcript: string) => {
    if (!transcript || transcript.trim().length < 5) return;
    if (lastProcessedTranscriptRef.current === transcript) return;
    lastProcessedTranscriptRef.current = transcript;
    setAutoTagging(true);
    setNerWarnings([]);
    setAutoAppliedTagCount(0);
    void recordingId;
    try {
      const res = await fetch("/api/auto-tag-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          site_id: siteId,
          source_asset_id: assetId,
        }),
      });
      if (!res.ok) {
        console.warn("Auto-tag suggest HTTP", res.status, await res.text().catch(() => ""));
        return;
      }
      const data = await res.json();

      // Story Angles: separate layer (editorial framing per-post). Apply
      // suggested pillar tags immediately to working Story Angle state.
      let appliedCount = 0;
      let appliedIds: string[] = [];
      const tagSuggestion = data.story_angles || data.content_tags || {};
      if (tagSuggestion.tagIds?.length > 0) {
        const allValidTagIds = new Set(pillarConfig.flatMap((p) => p.tags.map((t) => t.id)));
        const validNewTags = (tagSuggestion.tagIds as string[]).filter(
          (id) => allValidTagIds.has(id),
        );
        setTags((prev) => {
          const before = new Set(prev);
          const merged = Array.from(new Set([...prev, ...validNewTags]));
          appliedCount = merged.length - before.size;
          // Capture the IDs that were freshly applied (excludes tags
          // that were already on the asset before this run) so the
          // result card can render them as labeled pills.
          appliedIds = validNewTags.filter((id) => !before.has(id));
          return merged;
        });
      }
      setAutoAppliedTagCount(appliedCount);
      setAutoAppliedTagIds(appliedIds);

      // Scene composition — Haiku call returns scene_type IDs that
      // describe what's literally shown. Merge into working scene_types
      // (additive within this run; tag UI shows the result for review).
      const sceneTypesFromApi = Array.isArray(data.scene_types)
        ? (data.scene_types as string[])
        : [];
      let appliedSceneIds: string[] = [];
      if (sceneTypesFromApi.length > 0) {
        setSceneTypesArr((prev) => {
          const before = new Set(prev);
          appliedSceneIds = sceneTypesFromApi.filter((id) => !before.has(id));
          return Array.from(new Set([...prev, ...sceneTypesFromApi]));
        });
      }
      setAutoAppliedSceneTypeIds(appliedSceneIds);

      const groupsResp = (data.groups || {}) as Partial<InspectorState>;
      const groups: InspectorState = {
        brand: groupsResp.brand || { applied_matches: [], suggested_new: [] },
        service: groupsResp.service || { applied_matches: [], suggested_new: [] },
        project: groupsResp.project || { applied_matches: [], suggested_new: [] },
        persona: groupsResp.persona || { applied_matches: [], suggested_new: [] },
        branch: groupsResp.branch || { applied_matches: [], suggested_new: [] },
        service_area: groupsResp.service_area || { applied_matches: [], suggested_new: [] },
      };

      // Push applied-match IDs into each group's working state. Server
      // already auto-linked to asset_*_join tables; this keeps the bottom
      // pickers visually in sync (preselected pills) AND prevents doSave's
      // DELETE+INSERT cascade from wiping what auto-tag just inserted.
      const mergeIds = (
        prev: string[],
        applied: InspectorMatch[],
      ): string[] => Array.from(new Set([...prev, ...applied.map((m) => m.entity_id)]));
      if (groups.brand.applied_matches.length > 0) setBrandIds((prev) => mergeIds(prev, groups.brand.applied_matches));
      if (groups.service.applied_matches.length > 0) setServiceIds((prev) => mergeIds(prev, groups.service.applied_matches));
      if (groups.project.applied_matches.length > 0) setProjectIds((prev) => mergeIds(prev, groups.project.applied_matches));
      if (groups.persona.applied_matches.length > 0) setPersonaIds((prev) => mergeIds(prev, groups.persona.applied_matches));
      if (groups.branch.applied_matches.length > 0) setBranchIds((prev) => mergeIds(prev, groups.branch.applied_matches));
      if (groups.service_area.applied_matches.length > 0) setServiceAreaIds((prev) => mergeIds(prev, groups.service_area.applied_matches));

      setInspectorState(groups);
      setNerWarnings(Array.isArray(data.ner_warnings) ? data.ner_warnings : []);
    } catch (err) {
      console.warn("Auto-tag suggest failed:", err);
    } finally {
      setAutoTagging(false);
      setLastSuggestRunAt(Date.now());
    }
  }, [siteId, assetId, pillarConfig]);

  // Confirm a NEW-entity suggestion. Generic dispatcher across all 6
  // groups — different POST endpoints + different response shapes per
  // group, but all share the post-create local-state sync pattern
  // (push to localXxx + working xxxIds + promote to applied_matches).
  async function confirmNewEntity(group: InspectorTagGroup, c: InspectorNew, recordingId: string | null) {
    const endpointByGroup: Record<InspectorTagGroup, string> = {
      brand: "/api/brands",
      service: "/api/services",
      project: "/api/projects",
      persona: "/api/personas",
      branch: "/api/branches",
      service_area: "/api/service-areas",
    };
    const endpoint = endpointByGroup[group];
    try {
      const reqBody: Record<string, unknown> = {
        name: c.name,
        site_id: siteId,
        seed_source: c.source === "keyword" ? "keyword_cue" : "audio_transcript",
        seed_recording_id: recordingId,
        seed_asset_id: assetId,
      };
      if (group === "service_area") reqBody.kind = "city";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) {
        console.warn(`${group} confirm HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      // Response shape varies per endpoint — extract entity defensively
      const created = data.brand || data.service || data.project ||
        data.persona || data.branch || data.overlay || data.service_area || data;
      if (!created?.id) return;
      // Push to local catalog + working state + saved* graduate skip
      // (saved* will graduate on next successful save)
      const entry = { id: created.id as string, name: (created.name || c.name) as string, slug: (created.slug || c.slug) as string };
      switch (group) {
        case "brand":
          setLocalBrands((prev) => prev.some((b) => b.id === entry.id) ? prev : [...prev, { ...entry, url: created.url || null } as Brand].sort((a, b) => a.name.localeCompare(b.name)));
          setBrandIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          onBrandCreated?.({ ...entry, url: created.url || null } as Brand);
          break;
        case "service":
          setLocalServices((prev) => prev.some((s) => s.id === entry.id) ? prev : [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)));
          setServiceIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          onServiceCreated?.(entry);
          break;
        case "project":
          setLocalProjects((prev) => prev.some((p) => p.id === entry.id) ? prev : [...prev, entry as Project].sort((a, b) => a.name.localeCompare(b.name)));
          setProjectIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          onProjectCreated?.(entry as Project);
          break;
        case "persona":
          setLocalPersonas((prev) => prev.some((p) => p.id === entry.id) ? prev : [...prev, { id: entry.id, name: entry.name, type: "person" }].sort((a, b) => a.name.localeCompare(b.name)));
          setPersonaIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          break;
        case "branch":
          setLocalBranches((prev) => prev.some((b) => b.id === entry.id) ? prev : [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)));
          setBranchIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          onBranchCreated?.(entry);
          break;
        case "service_area":
          setLocalServiceAreas((prev) => prev.some((sa) => sa.id === entry.id) ? prev : [...prev, entry].sort((a, b) => a.name.localeCompare(b.name)));
          setServiceAreaIds((prev) => prev.includes(entry.id) ? prev : [...prev, entry.id]);
          onServiceAreaCreated?.(entry);
          break;
      }
      // Promote suggested_new → applied_matches (visual graduation)
      setInspectorState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [group]: {
            applied_matches: [
              ...prev[group].applied_matches,
              { entity_id: entry.id, name: entry.name, match_text: c.name, match_start: -1, context_excerpt: c.context },
            ],
            suggested_new: prev[group].suggested_new.filter((s) => s.slug !== c.slug),
          },
        };
      });
    } catch (err) {
      console.warn(`${group} confirm failed:`, err);
    }
  }

  function dismissAllSuggestions() {
    setInspectorState(null);
  }

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

  async function quickCreateService() {
    if (!newServiceName.trim()) return;
    setCreatingService(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newServiceName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.service || data;
        setLocalServices((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setServiceIds((prev) => [...prev, created.id]);
        setNewServiceName("");
        onServiceCreated?.(created);
      }
    } catch { /* ignore */ }
    setCreatingService(false);
  }

  async function quickCreateBranch() {
    if (!newBranchName.trim()) return;
    setCreatingBranch(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBranchName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.branch || data;
        setLocalBranches((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setBranchIds((prev) => [...prev, created.id]);
        setNewBranchName("");
        onBranchCreated?.(created);
      }
    } catch { /* ignore */ }
    setCreatingBranch(false);
  }

  async function quickCreatePersona() {
    if (!newPersonaName.trim()) return;
    setCreatingPersona(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPersonaName.trim(),
          site_id: siteId,
          type: "person",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.persona || data;
        setLocalPersonas((prev) => [...prev, { id: created.id as string, name: created.name as string, type: (created.type as string) || "person" }].sort((a, b) => a.name.localeCompare(b.name)));
        setPersonaIds((prev) => [...prev, created.id]);
        setNewPersonaName("");
      }
    } catch { /* ignore */ }
    setCreatingPersona(false);
  }

  async function quickCreateServiceArea() {
    if (!newServiceAreaName.trim()) return;
    setCreatingServiceArea(true);
    try {
      const res = await fetch("/api/service-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceAreaName.trim(),
          site_id: siteId,
          kind: "city",
          seed_source: "manual_modal",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // /api/service-areas returns the overlay row + canonical
        const overlay = data.overlay || data.service_area || data;
        const canonical = data.canonical || {};
        const created = {
          id: overlay.id || overlay.overlay_id,
          name: canonical.name || newServiceAreaName.trim(),
          slug: canonical.slug || "",
        };
        setLocalServiceAreas((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setServiceAreaIds((prev) => [...prev, created.id]);
        setNewServiceAreaName("");
        onServiceAreaCreated?.(created);
      }
    } catch { /* ignore */ }
    setCreatingServiceArea(false);
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
    if (JSON.stringify([...sceneTypesArr].sort()) !== JSON.stringify([...savedSceneTypesArr].sort())) {
      body.scene_types = sceneTypesArr;
    }
    if (JSON.stringify(tags) !== JSON.stringify(initialTags || [])) body.content_tags = tags;
    if (JSON.stringify(brandIds.sort()) !== JSON.stringify(initialBrandIds.sort())) body.brand_ids = brandIds;
    if (JSON.stringify(projectIds.sort()) !== JSON.stringify(initialProjectIds.sort())) body.project_ids = projectIds;
    if (JSON.stringify(personaIds.sort()) !== JSON.stringify(initialPersonaIds.sort())) body.persona_ids = personaIds;
    if (JSON.stringify(serviceIds.sort()) !== JSON.stringify(initialServiceIds.sort())) body.service_ids = serviceIds;
    if (JSON.stringify(branchIds.sort()) !== JSON.stringify(initialBranchIds.sort())) body.branch_ids = branchIds;
    if (JSON.stringify(serviceAreaIds.sort()) !== JSON.stringify(initialServiceAreaIds.sort())) body.service_area_ids = serviceAreaIds;

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
      setSavedServiceAreaIds(serviceAreaIds);
      setSavedTags(tags);
      setSavedSceneTypesArr(sceneTypesArr);
      onSaved(note, pillar, tags, brandIds, projectIds, personaIds, serviceIds, branchIds, serviceAreaIds, sceneTypesArr);
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
    setSavedServiceAreaIds(serviceAreaIds);
    setSavedTags(tags);
    setSavedSceneTypesArr(sceneTypesArr);
    onSaved(note, pillar, tags, brandIds, projectIds, personaIds, serviceIds, branchIds, serviceAreaIds, sceneTypesArr);
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
    const sortedEq = (a: string[], b: string[]) =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const tagsDirty = !sortedEq(tags, savedTags);
    const brandsDirty = !sortedEq(brandIds, savedBrandIds);
    const projectsDirty = !sortedEq(projectIds, savedProjectIds);
    const personasDirty = !sortedEq(personaIds, savedPersonaIds);
    const servicesDirty = !sortedEq(serviceIds, savedServiceIds);
    const branchesDirty = !sortedEq(branchIds, savedBranchIds);
    const serviceAreasDirty = !sortedEq(serviceAreaIds, savedServiceAreaIds);
    const scenesDirty = !sortedEq(sceneTypesArr, savedSceneTypesArr);
    const tagSelectionDirty = tagsDirty || brandsDirty || projectsDirty ||
      personasDirty || servicesDirty || branchesDirty || serviceAreasDirty || scenesDirty;
    const isDirty = briefingDirty || voDirty || typedDirty || tagSelectionDirty;
    if (isDirty) {
      // Build a specific message so subscriber knows WHAT they'd lose
      const parts: string[] = [];
      if (briefingDirty || voDirty) parts.push("a recording");
      if (typedDirty) parts.push("typed narrative");
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

            {/* AUTO-TAG INSPECTOR — surfaces after audio.commit().
                Per project_tracpost_auto_tag_inspector_design.md
                (LOCKED 2026-05-10): cross-group catalog scan + NER
                produces per-group {applied_matches, suggested_new}.
                All hits surface, no suppression. Story Angles are a
                separate layer (editorial framing per-post, not asset
                descriptors) — applied silently to working tag state.
                Panel renders even when zero matches surfaced so
                subscriber can tell the system ran. */}
            {(autoTagging || lastSuggestRunAt !== null) && (() => {
              const groupConfig: Array<{ key: InspectorTagGroup; label: string; toggleSet: (fn: (prev: string[]) => string[]) => void; selectedSet: string[]; savedSet: string[] }> = [
                { key: "brand", label: brandLabel || "Brands", toggleSet: setBrandIds, selectedSet: brandIds, savedSet: savedBrandIds },
                { key: "service", label: serviceLabel || "Services", toggleSet: setServiceIds, selectedSet: serviceIds, savedSet: savedServiceIds },
                { key: "project", label: projectLabel || "Projects", toggleSet: setProjectIds, selectedSet: projectIds, savedSet: savedProjectIds },
                { key: "persona", label: personaLabel || "People", toggleSet: setPersonaIds, selectedSet: personaIds, savedSet: savedPersonaIds },
                { key: "branch", label: branchLabel || "Locations", toggleSet: setBranchIds, selectedSet: branchIds, savedSet: savedBranchIds },
                { key: "service_area", label: serviceAreaLabel || "Service Areas", toggleSet: setServiceAreaIds, selectedSet: serviceAreaIds, savedSet: savedServiceAreaIds },
              ];
              const totalApplied = inspectorState
                ? groupConfig.reduce((sum, g) => sum + (inspectorState[g.key]?.applied_matches.length || 0), 0)
                : 0;
              const totalNew = inspectorState
                ? groupConfig.reduce((sum, g) => sum + (inspectorState[g.key]?.suggested_new.length || 0), 0)
                : 0;
              return (
              <div className="mb-3 rounded border border-accent/40 bg-accent/5 px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-accent">
                    {autoTagging ? "✨ Analyzing your recording…" : "✨ Auto-tag results"}
                  </span>
                  {!autoTagging && (
                    <button
                      type="button"
                      onClick={dismissAllSuggestions}
                      className="text-[10px] text-muted hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
                {!autoTagging && (autoAppliedTagCount > 0 || totalApplied > 0) && (
                  <div className="mb-2 text-[10px] text-success">
                    {autoAppliedTagCount > 0 && `Applied ${autoAppliedTagCount} Story Angle tag${autoAppliedTagCount > 1 ? "s" : ""}`}
                    {autoAppliedTagCount > 0 && totalApplied > 0 && " · "}
                    {totalApplied > 0 && `Linked ${totalApplied} existing tag${totalApplied > 1 ? "s" : ""} to this asset`}
                  </div>
                )}
                {!autoTagging && nerWarnings.length > 0 && (
                  <div className="mb-2 text-[10px] text-warning">
                    ⚠ Heads up — review these auto-matches before saving (uncheck any that look wrong): {nerWarnings.join(" · ")}
                  </div>
                )}
                {/* Story Angle pills — same shape as the per-group sections
                    below, but rendered separately because story angles flow
                    into content_tags (not asset_* join tables). Surfaces
                    WHICH tags were applied, not just the count. */}
                {!autoTagging && autoAppliedTagIds.length > 0 && (() => {
                  const labelByTagId = new Map(
                    pillarConfig.flatMap((p) => p.tags.map((t) => [t.id, t.label] as const))
                  );
                  return (
                    <div className="mb-2">
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Story Angles</div>
                      <div className="flex flex-wrap items-start gap-1.5">
                        {autoAppliedTagIds.map((tagId) => {
                          const label = labelByTagId.get(tagId) || tagId;
                          const stillSelected = tags.includes(tagId);
                          return (
                            <button
                              key={`story:${tagId}`}
                              type="button"
                              onClick={() => setTags((prev) => stillSelected ? prev.filter((id) => id !== tagId) : [...prev, tagId])}
                              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                stillSelected
                                  ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                                  : "bg-surface-hover text-muted hover:text-foreground"
                              }`}
                            >
                              ✓ {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Scene Composition pills — closed-enum visual depiction
                    layer (after / wide_shot / lifestyle / etc). Same Haiku
                    call as Story Angles produces both. */}
                {!autoTagging && autoAppliedSceneTypeIds.length > 0 && (
                  <div className="mb-2">
                    <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Scene Composition</div>
                    <div className="flex flex-wrap items-start gap-1.5">
                      {autoAppliedSceneTypeIds.map((sceneId) => {
                        const scene = SCENE_TYPES.find((s) => s.id === sceneId);
                        const label = scene?.label || sceneId;
                        const stillSelected = sceneTypesArr.includes(sceneId);
                        return (
                          <button
                            key={`scene:${sceneId}`}
                            type="button"
                            onClick={() => setSceneTypesArr((prev) => stillSelected ? prev.filter((id) => id !== sceneId) : [...prev, sceneId])}
                            title={scene?.description}
                            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                              stillSelected
                                ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                                : "bg-surface-hover text-muted hover:text-foreground"
                            }`}
                          >
                            ✓ {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!autoTagging && inspectorState && groupConfig.map((g) => {
                  const groupData = inspectorState[g.key];
                  if (!groupData) return null;
                  if (groupData.applied_matches.length === 0 && groupData.suggested_new.length === 0) return null;
                  return (
                    <div key={g.key} className="mb-2">
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">{g.label}</div>
                      <div className="flex flex-wrap items-start gap-1.5">
                        {groupData.applied_matches.map((m) => {
                          const selected = g.selectedSet.includes(m.entity_id);
                          const confirmed = selected && g.savedSet.includes(m.entity_id);
                          const preselected = selected && !confirmed;
                          // Provenance: match_text "📍 GPS" → GPS-derived
                          // (asset's EXIF coords matched a service area's
                          // viewport). Anything else → transcript-derived
                          // (NER + catalog match against subscriber's words).
                          // Badge tells subscriber WHY each tag was suggested
                          // so they can apply intuition for confirm/reject —
                          // and resolve any conflict between signals at the
                          // single Save decision boundary.
                          const isGpsDerived = m.match_text === "📍 GPS";
                          const provenanceBadge = isGpsDerived ? "📍" : "🎤";
                          const provenanceTitle = isGpsDerived
                            ? `From photo location: ${m.context_excerpt}`
                            : `From transcript: ${m.context_excerpt}`;
                          return (
                            <button
                              key={`applied:${m.entity_id}`}
                              type="button"
                              onClick={() => g.toggleSet((prev) => selected ? prev.filter((id) => id !== m.entity_id) : [...prev, m.entity_id])}
                              title={provenanceTitle}
                              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                confirmed
                                  ? "bg-accent text-white"
                                  : preselected
                                    ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                                    : "bg-surface-hover text-muted hover:text-foreground"
                              }`}
                            >
                              ✓ {m.name} <span className="opacity-60 text-[9px]">{provenanceBadge}</span>
                            </button>
                          );
                        })}
                        {groupData.suggested_new.map((s) => (
                          <button
                            key={`new:${s.slug}`}
                            type="button"
                            onClick={() => void confirmNewEntity(g.key, s, recordings[0]?.id || null)}
                            title={s.source === "keyword" ? `Keyword "${s.keyword}" — ${s.context}` : s.context}
                            className="rounded bg-surface-hover px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent/20 hover:text-accent"
                          >
                            + {s.name}
                            {s.source === "keyword" && (
                              <span className="ml-1 text-[9px] text-muted">({s.keyword})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!autoTagging && totalApplied === 0 && totalNew === 0 && autoAppliedTagCount === 0 && (
                  <div className="text-[10px] italic text-muted">
                    No tag matches detected in this recording. (Try mentioning specific brand names, project names, service names, or city names if you expected suggestions.)
                  </div>
                )}
                {!autoTagging && (totalApplied > 0 || totalNew > 0) && (
                  <div className="mt-1 text-[10px] text-muted">
                    Tap ✓ pills to uncheck false matches. Tap + pills to add new entries. Save to commit.
                  </div>
                )}
              </div>
              );
            })()}

            {/* TRANSCRIPTION SECTION — top of the content stack
                (2026-05-11 reorder). Renders right under the
                RecordingBar/auto-tag inspector so subscriber sees
                the canonical narrative source first. Latest transcript
                expanded; earlier ones collapsed in the accordion. */}
            <div className="mb-3 rounded border border-border bg-surface px-3 py-2.5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-foreground">Transcription</span>
                  <span className="text-[10px] text-muted">— Recordings for this asset only (latest first).</span>
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
              ) : !recordingsLoaded ? (
                <div className="text-[11px] italic text-muted">Loading recordings for this asset…</div>
              ) : recordings.length > 0 && recordings[0].transcript ? (
                <>
                  {replaceTargetId && (
                    <div className="mb-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                      ⚠ Replace mode: this transcript will be archived when you save your new recording. Asset stays briefed.
                    </div>
                  )}
                  <div className="rounded bg-background/40 p-2 text-[12px] text-foreground/90">
                    {recordings[0].transcript}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Manual auto-tag trigger. Fires NER+catalog scan
                        // on the staged or saved transcript so subscriber
                        // can review results BEFORE committing the modal.
                        // Idempotent — same transcript twice is a no-op.
                        const transcript = audio.previewTranscript || recordings[0]?.transcript || "";
                        if (transcript.trim().length >= 5) {
                          void runAutoTagSuggest("", transcript);
                        }
                      }}
                      disabled={autoTagging || (audio.state !== "staged" && !recordings[0]?.transcript)}
                      className="text-[10px] text-accent underline hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      title="Run auto-tag suggestions on the current transcript. Cheaper than waiting for Save — lets you re-record if you want before spending the AI call."
                    >
                      ✨ Suggest tags
                    </button>
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
                    Legacy context note for this asset — will migrate to a recording on next save.
                  </div>
                </div>
              ) : (
                <div className="text-[11px] italic text-muted">
                  No recordings for this asset yet — record one above or type it in.
                </div>
              )}
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

            {/* LEGACY CONTEXT NOTE — handwritten cue card subscriber reads
                from while recording. Now positioned after Scene so the
                subscriber's reading flow is: Transcription review → Scene
                review → Legacy cue card (the prompt for the next take).
                Surfaces only when the asset has a non-empty context_note.
                Disappears once context_note column is dropped. */}
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

            {/* STORY ANGLE SECTION — moved BELOW Transcription (2026-05-11) */}
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
                          const confirmed = checked && savedTags.includes(t.id);
                          const preselected = checked && !confirmed;
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
                              title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                confirmed
                                  ? "bg-accent text-white"
                                  : preselected
                                    ? "bg-accent/20 text-accent ring-1 ring-accent/40"
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
        </div>

        {/* Bottom Tags section retired 2026-05-09 — Story Angle card above
            owns all pillar tag selection. Selected pills are visible inline
            on each pillar row; no need for a separate chip strip. */}

        {/* Row 3: Brands — hard-exposed regardless of label/empty state */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{brandLabel || "Brands"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localBrands.map((b) => {
                const selected = brandIds.includes(b.id);
                const confirmed = selected && savedBrandIds.includes(b.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      setBrandIds((prev) =>
                        selected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {b.name}
                    {b.url && selected && (
                      <span className={`ml-1 ${confirmed ? "text-white/60" : "text-accent/50"}`}>↗</span>
                    )}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateBrand()}
                  placeholder={`+ ${brandLabel || "Brand"}`}
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

        {/* Row 4: Projects — hard-exposed regardless of label/empty state */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{projectLabel || "Projects"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localProjects.map((p) => {
                const selected = projectIds.includes(p.id);
                const confirmed = selected && savedProjectIds.includes(p.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setProjectIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
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
                  placeholder={`+ ${projectLabel || "Project"}`}
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

        {/* Row 5: Personas — hard-exposed regardless of label/empty state.
            Quick-create flow uses /api/personas with type=person + consent
            unset (subscriber refines in /dashboard/tagging). */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{personaLabel || "People"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localPersonas.map((p) => {
                const selected = personaIds.includes(p.id);
                const confirmed = selected && savedPersonaIds.includes(p.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPersonaIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-purple-500 text-white"
                        : preselected
                          ? "bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newPersonaName}
                  onChange={(e) => setNewPersonaName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreatePersona()}
                  placeholder={`+ ${personaLabel || "Person"}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newPersonaName.trim() && (
                  <button
                    onClick={quickCreatePersona}
                    disabled={creatingPersona}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingPersona ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>

        {/* Row 6: Services — hard-exposed regardless of label/empty state */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{serviceLabel || "Services"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localServices.map((s) => {
                const selected = serviceIds.includes(s.id);
                const confirmed = selected && savedServiceIds.includes(s.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setServiceIds((prev) =>
                        selected ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateService()}
                  placeholder={`+ ${serviceLabel || "Service"}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newServiceName.trim() && (
                  <button
                    onClick={quickCreateService}
                    disabled={creatingService}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingService ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>

        {/* Row 7: Branches — hard-exposed regardless of label/empty state */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{branchLabel || "Locations"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localBranches.map((b) => {
                const selected = branchIds.includes(b.id);
                const confirmed = selected && savedBranchIds.includes(b.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      setBranchIds((prev) =>
                        selected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateBranch()}
                  placeholder={`+ ${branchLabel || "Location"}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newBranchName.trim() && (
                  <button
                    onClick={quickCreateBranch}
                    disabled={creatingBranch}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingBranch ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>

        {/* Row 8: Service Areas — hard-exposed regardless of label/empty state */}
        <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{serviceAreaLabel || "Service Areas"}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localServiceAreas.map((sa) => {
                const selected = serviceAreaIds.includes(sa.id);
                const confirmed = selected && savedServiceAreaIds.includes(sa.id);
                const preselected = selected && !confirmed;
                return (
                  <button
                    key={sa.id}
                    onClick={() =>
                      setServiceAreaIds((prev) =>
                        selected ? prev.filter((id) => id !== sa.id) : [...prev, sa.id]
                      )
                    }
                    title={preselected ? "Auto-tag preselect — uncheck to skip, or Save to confirm" : undefined}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      confirmed
                        ? "bg-accent text-white"
                        : preselected
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {sa.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newServiceAreaName}
                  onChange={(e) => setNewServiceAreaName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateServiceArea()}
                  placeholder={`+ ${serviceAreaLabel || "Service Area"}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newServiceAreaName.trim() && (
                  <button
                    onClick={quickCreateServiceArea}
                    disabled={creatingServiceArea}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingServiceArea ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
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
