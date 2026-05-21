import { useState, useRef, useCallback, useEffect } from "react";
import type { PillarGroup } from "@/components/tag-picker";
import type { AutoTagSectionHandle, CategoriesResponse } from "@/components/asset-categories-section";

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

// Auto-tag inspector types (LOCKED 2026-05-10).
// Per memory/project_tracpost_auto_tag_inspector_design.md: cross-group
// catalog scan + NER produces per-group {applied_matches, suggested_new}.
export type InspectorMatch = { entity_id: string; name: string; match_text: string; match_start: number; context_excerpt: string };
export type InspectorNew = { name: string; slug: string; context: string; source?: string; keyword?: string };
export type InspectorGroup = { applied_matches: InspectorMatch[]; suggested_new: InspectorNew[] };
export type InspectorTagGroup = "brand" | "service" | "project" | "persona" | "branch";
export type InspectorState = Record<InspectorTagGroup, InspectorGroup>;

/** Shape of the auto-tag-suggest response the hook consumes. */
type TagSuggestion = { tagIds?: string[] };
export interface AutoTagSuggestData {
  story_angles?: TagSuggestion;
  content_tags?: TagSuggestion;
  scene_types?: unknown;
  groups?: Partial<InspectorState>;
  ner_warnings?: unknown;
}

/** A catalog entity returned by the analysis API (brand/service/etc). */
export interface CreatedEntity {
  id: string;
  name?: string;
  slug?: string;
  url?: string | null;
}

/**
 * The data layer for asset analysis — injected so the same hook runs under
 * the subscriber-session API and the manager (tp_admin) API. The hook holds
 * zero URL knowledge; each surface passes its own adapter (see
 * src/lib/asset-analysis-api.ts).
 */
export interface AssetAnalysisApi {
  /** Run cross-group NER + catalog matching for a transcript. */
  suggestTags(input: {
    transcript: string;
    siteId: string;
    assetId: string;
  }): Promise<AutoTagSuggestData | null>;
  /** Create a new catalog entity from a confirmed suggested-new pill. */
  createEntity(input: {
    group: InspectorTagGroup;
    name: string;
    siteId: string;
    seedSource: "keyword_cue" | "audio_transcript";
    seedRecordingId: string | null;
    seedAssetId: string;
  }): Promise<CreatedEntity | null>;
}

export interface UseAssetAnalysisParams {
  assetId: string;
  siteId: string;
  /** Injected data layer — keeps the hook API-agnostic. */
  api: AssetAnalysisApi;
  pillarConfig: PillarGroup[];
  brands: Brand[];
  projects: Project[];
  services: Array<{ id: string; name: string; slug: string }>;
  branches: Array<{ id: string; name: string; slug: string }>;
  personas: Array<{ id: string; name: string; type: string }>;
  initialTags: string[];
  initialSceneTypes: string[];
  initialPillars: string[];
  initialPillar: string;
  initialBrandIds: string[];
  initialProjectIds: string[];
  initialServiceIds: string[];
  initialBranchIds: string[];
  initialPersonaIds: string[];
  onBrandCreated?: (brand: Brand) => void;
  onProjectCreated?: (project: Project) => void;
  onServiceCreated?: (service: { id: string; name: string; slug: string }) => void;
  onBranchCreated?: (branch: { id: string; name: string; slug: string }) => void;
}

/**
 * The asset analysis core — tag working-state, the cascade, and the
 * auto-tag inspector — lifted out of AssetEditModal so it can be reused
 * by the manager-side Media Production › Analysis surface.
 *
 * Briefing (recording / transcription) stays in AssetEditModal; this hook
 * is everything from analysis onward. The transcript is an INPUT — callers
 * pass it to runAutoTagSuggest; the hook never captures audio. All network
 * I/O goes through the injected `api` adapter.
 */
export function useAssetAnalysis({
  assetId,
  siteId,
  api,
  pillarConfig,
  brands,
  projects,
  services,
  branches,
  personas,
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
}: UseAssetAnalysisParams) {
  const [sceneTypesArr, setSceneTypesArr] = useState<string[]>(initialSceneTypes);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  // saved* mirror for Story Angle tags — same three-state pattern as
  // brands/projects (per project_tracpost_three_state_pills.md). Auto-tag-
  // suggest writes to `tags` directly; without a saved mirror, pre-save
  // preselects look identical to saved truth.
  const [savedTags, setSavedTags] = useState<string[]>(initialTags || []);

  // pillarsArr derived from tags + pillarConfig (parents of selected tags).
  const pillarsArr = Array.from(
    new Set(
      tags
        .map((tagId) => pillarConfig.find((p) => p.tags.some((t) => t.id === tagId))?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const initialPillarsArr = initialPillars.length > 0 ? initialPillars : initialPillar ? [initialPillar] : [];

  // Imperative handle on AssetCategoriesSection — the Auto-tag bar's
  // trigger button calls cascadeRef.current?.triggerPreview().
  const cascadeRef = useRef<AutoTagSectionHandle | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [cascadeHasPreview, setCascadeHasPreview] = useState(false);
  const handleCascadeStateChange = useCallback(
    (s: { isPreviewing: boolean; hasPreview: boolean }) => {
      setCascadeBusy(s.isPreviewing);
      setCascadeHasPreview(s.hasPreview);
    },
    [],
  );

  // Shared categories data — fed by AssetCategoriesSection's onDataChange.
  // Powers the AssetTagsStrip confirmation row; no extra fetch.
  const [categoriesData, setCategoriesData] = useState<CategoriesResponse | null>(null);
  const handleCategoriesData = useCallback((d: CategoriesResponse) => {
    setCategoriesData(d);
  }, []);

  const [brandIds, setBrandIds] = useState<string[]>(initialBrandIds);
  const [projectIds, setProjectIds] = useState<string[]>(initialProjectIds);
  const [personaIds, setPersonaIds] = useState<string[]>(initialPersonaIds);
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceIds);
  const [branchIds, setBranchIds] = useState<string[]>(initialBranchIds);
  // saved* mirror initial*Ids but advance on every successful save —
  // distinguishes "confirmed" pills (saved truth) from "preselected" pills
  // (auto-tag pending, may be unchecked before save).
  const [savedBrandIds, setSavedBrandIds] = useState<string[]>(initialBrandIds);
  const [savedProjectIds, setSavedProjectIds] = useState<string[]>(initialProjectIds);
  const [savedPersonaIds, setSavedPersonaIds] = useState<string[]>(initialPersonaIds);
  const [savedServiceIds, setSavedServiceIds] = useState<string[]>(initialServiceIds);
  const [savedBranchIds, setSavedBranchIds] = useState<string[]>(initialBranchIds);
  const [savedSceneTypesArr, setSavedSceneTypesArr] = useState<string[]>(initialSceneTypes);

  // Local catalog mirrors so quick-create flows can append to the picker
  // without a server refetch.
  const [localBrands, setLocalBrands] = useState(brands);
  const [localProjects, setLocalProjects] = useState(projects);
  const [localServices, setLocalServices] = useState(services);
  const [localBranches, setLocalBranches] = useState(branches);
  const [localPersonas, setLocalPersonas] = useState(personas);

  // Auto-tag inspector state (LOCKED 2026-05-10). Subscriber sees applied
  // matches (existing-catalog hits, server-side auto-linked) and suggested
  // new (NER proposals). All matches additive, no suppression.
  const [inspectorState, setInspectorState] = useState<InspectorState | null>(null);
  const [autoTagging, setAutoTagging] = useState(false);
  // Track that a suggestion run completed (success or no-result). Used to
  // render the panel even when zero matches surfaced. Null = never ran.
  const [lastSuggestRunAt, setLastSuggestRunAt] = useState<number | null>(null);
  const [autoAppliedTagCount, setAutoAppliedTagCount] = useState(0);
  const [autoAppliedTagIds, setAutoAppliedTagIds] = useState<string[]>([]);
  const [autoAppliedSceneTypeIds, setAutoAppliedSceneTypeIds] = useState<string[]>([]);
  const [nerWarnings, setNerWarnings] = useState<string[]>([]);
  // Guards against double-firing when the same transcript reaches us BOTH
  // eagerly (staged state, pre-commit) AND via onCommitted.
  const lastProcessedTranscriptRef = useRef<string>("");

  // Reset tag working-state when navigating to a different asset. Mirrors
  // the prior inline reset in AssetEditModal — inspector state is
  // intentionally NOT reset here (a fresh analyze overwrites it).
  useEffect(() => {
    setSceneTypesArr(initialSceneTypes);
    setTags(initialTags || []);
    setSavedTags(initialTags || []);
    setBrandIds(initialBrandIds);
    setProjectIds(initialProjectIds);
    setPersonaIds(initialPersonaIds);
    setServiceIds(initialServiceIds);
    setBranchIds(initialBranchIds);
    setSavedBrandIds(initialBrandIds);
    setSavedProjectIds(initialProjectIds);
    setSavedPersonaIds(initialPersonaIds);
    setSavedServiceIds(initialServiceIds);
    setSavedBranchIds(initialBranchIds);
    setSavedSceneTypesArr(initialSceneTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const data = await api.suggestTags({ transcript, siteId, assetId });
      if (!data) return;

      // Story Angles: separate layer (editorial framing per-post). Apply
      // suggested pillar tags immediately to working Story Angle state.
      let appliedCount = 0;
      let appliedIds: string[] = [];
      const tagSuggestion: TagSuggestion = data.story_angles || data.content_tags || {};
      if (tagSuggestion.tagIds?.length) {
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

      // Scene composition — Haiku call returns scene_type IDs that describe
      // what's literally shown. Merge into working scene_types (additive).
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
      };

      // Push applied-match IDs into each group's working state. Server
      // already auto-linked the join tables; this keeps the pickers in sync
      // AND prevents doSave's DELETE+INSERT cascade from wiping them.
      const mergeIds = (
        prev: string[],
        applied: InspectorMatch[],
      ): string[] => Array.from(new Set([...prev, ...applied.map((m) => m.entity_id)]));
      if (groups.brand.applied_matches.length > 0) setBrandIds((prev) => mergeIds(prev, groups.brand.applied_matches));
      if (groups.service.applied_matches.length > 0) setServiceIds((prev) => mergeIds(prev, groups.service.applied_matches));
      if (groups.project.applied_matches.length > 0) setProjectIds((prev) => mergeIds(prev, groups.project.applied_matches));
      if (groups.persona.applied_matches.length > 0) setPersonaIds((prev) => mergeIds(prev, groups.persona.applied_matches));
      if (groups.branch.applied_matches.length > 0) setBranchIds((prev) => mergeIds(prev, groups.branch.applied_matches));

      setInspectorState(groups);
      setNerWarnings(Array.isArray(data.ner_warnings) ? data.ner_warnings : []);
    } catch (err) {
      console.warn("Auto-tag suggest failed:", err);
    } finally {
      setAutoTagging(false);
      setLastSuggestRunAt(Date.now());
    }
  }, [siteId, assetId, pillarConfig, api]);

  // Confirm a NEW-entity suggestion. The injected api.createEntity handles
  // the per-group endpoint + response shape; this keeps only the local
  // catalog / working-state sync + the suggested_new → applied promotion.
  async function confirmNewEntity(group: InspectorTagGroup, c: InspectorNew, recordingId: string | null) {
    const created = await api.createEntity({
      group,
      name: c.name,
      siteId,
      seedSource: c.source === "keyword" ? "keyword_cue" : "audio_transcript",
      seedRecordingId: recordingId,
      seedAssetId: assetId,
    });
    if (!created?.id) return;
    // Push to local catalog + working state; saved* graduates on next save.
    const entry = { id: created.id, name: created.name || c.name, slug: created.slug || c.slug };
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
  }

  function dismissAllSuggestions() {
    setInspectorState(null);
  }

  return {
    sceneTypesArr, setSceneTypesArr,
    savedSceneTypesArr, setSavedSceneTypesArr,
    tags, setTags,
    savedTags, setSavedTags,
    pillarsArr,
    initialPillarsArr,
    brandIds, setBrandIds,
    projectIds, setProjectIds,
    personaIds, setPersonaIds,
    serviceIds, setServiceIds,
    branchIds, setBranchIds,
    savedBrandIds, setSavedBrandIds,
    savedProjectIds, setSavedProjectIds,
    savedPersonaIds, setSavedPersonaIds,
    savedServiceIds, setSavedServiceIds,
    savedBranchIds, setSavedBranchIds,
    localBrands,
    localProjects,
    localServices,
    localBranches,
    localPersonas,
    cascadeRef,
    cascadeBusy,
    cascadeHasPreview,
    handleCascadeStateChange,
    categoriesData,
    handleCategoriesData,
    inspectorState,
    autoTagging,
    lastSuggestRunAt,
    autoAppliedTagCount,
    autoAppliedTagIds,
    autoAppliedSceneTypeIds,
    nerWarnings,
    runAutoTagSuggest,
    confirmNewEntity,
    dismissAllSuggestions,
  };
}
