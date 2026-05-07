/**
 * Project generator types — chapter-based.
 *
 * Project pages (projects_v2) are generated separately as canonical
 * hubs. Chapter articles live in blog_posts_v2 (with project_id FK)
 * and are generated one-per-chapter as the project lifecycle unfolds.
 */

export type ChapterTriggerKind = "milestone_date" | "manual" | "asset_threshold";
export type ChapterStatus = "pending" | "ready" | "generated" | "skipped";

export interface ProjectChapter {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  intent: string;
  sequenceIndex: number;
  triggerKind: ChapterTriggerKind;
  assetFilter: Record<string, unknown>;
  structureTemplate: string | null;
  status: ChapterStatus;
  blogPostId: string | null;
}

export interface ChapterTemplate {
  industryKey: string;
  slug: string;
  title: string;
  intent: string;
  sequenceIndex: number;
  triggerKind: ChapterTriggerKind;
  assetFilter: Record<string, unknown>;
  structureTemplate: string | null;
}

export interface GenerateChapterSpec {
  /** The chapter row to generate from. */
  chapterId: string;
  /** Optional status to persist with on the resulting blog article. */
  status?: "draft" | "published" | "flagged";
}

export interface GenerateChapterResult {
  chapterId: string;
  blogPostId: string;
  slug: string;
  title: string;
  assetsCount: number;
  status: string;
}
