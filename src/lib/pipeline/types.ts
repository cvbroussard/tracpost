/** Triage statuses for media assets */
export type TriageStatus =
  | "received"   // just uploaded, not yet evaluated
  | "triaged"    // AI evaluated, scored, assigned pillar
  | "scheduled"  // promoted into a publishing slot
  | "shelved"    // usable but not selected (inventory for slow weeks)
  | "flagged"    // AI uncertain, needs subscriber input (< 5%)
  | "consumed"   // used in a published post
  | "rejected";  // subscriber vetoed or quality too low

/** Content pillars — rotated through the publishing calendar */
export type ContentPillar =
  | "result"           // before/after transformations
  | "training_action"  // session clips, technique demos
  | "showcase"         // Hektor or standout dogs
  | "educational";     // tips, breed info, methodology

/** Platform format identifiers */
export type PlatformFormat =
  | "ig_feed"
  | "ig_reel"
  | "ig_story"
  | "fb_feed"
  | "fb_reel"
  | "youtube"
  | "youtube_short"
  | "gbp"
  | "tiktok"
  | "twitter"
  | "linkedin"
  | "pinterest";

/** Publishing slot statuses */
export type SlotStatus =
  | "open"       // slot exists, no asset assigned yet
  | "filled"     // asset promoted, post created
  | "published"  // post went live
  | "skipped"    // no inventory to fill this slot
  | "vetoed";    // subscriber pulled back the post

/** Post authority — who/what created the post */
export type PostAuthority =
  | "pipeline"    // autopilot system
  | "subscriber"  // manual creation
  | "trigger";    // automation trigger

/** Subscriber action types — the narrow set of things subscribers can do */
export type SubscriberActionType =
  | "veto"
  | "un_veto"
  | "flag_response"
  | "cadence_change"
  | "triage"
  | "edit";

/** Cadence config shape stored in sites.cadence_config */
export interface CadenceConfig {
  ig_feed?: number;
  ig_reel?: number;
  ig_story?: number;
  fb_feed?: number;
  fb_reel?: number;
  youtube?: number;
  youtube_short?: number;
  gbp?: number;
  tiktok?: number;
  twitter?: number;
  linkedin?: number;
  pinterest?: number;
}

/** Autopilot config shape stored in sites.autopilot_config */
export interface AutopilotConfig {
  min_quality: number;
  flag_faces: boolean;
  shelf_capacity: number;
  max_flag_rate: number;
  veto_window_hours: number;
  backfill_from_shelf: boolean;
}

/** AI triage result returned by the triage engine */
export interface TriageResult {
  quality_score: number;       // 0.00 – 1.00
  content_pillar: ContentPillar;   // primary (backward compat)
  content_pillars: ContentPillar[]; // all matching pillars
  content_tags: string[];      // specific tags from two-tier system
  platform_fit: PlatformFormat[];
  triage_status: TriageStatus; // triaged | shelved | flagged
  flag_reason?: string;
  shelve_reason?: string;
  ai_analysis: Record<string, unknown>;
}
