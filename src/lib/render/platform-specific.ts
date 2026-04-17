/**
 * Platform-specific render enhancements:
 * - Stat overlay (Authority+): project metrics on image
 * - Location tagging: auto-tag with business location
 * - Pinterest tall pins: 2:3 with headline overlay
 * - GBP post type formatting: offer/update/event/product
 */
import "server-only";
import sharp from "sharp";
import { sql } from "@/lib/db";
import { cropForPlatform } from "./crops";
import { applyGrade } from "./grade";
import { applyTextOverlays } from "./overlay";
import type { TextOverlay, GradePreset } from "./types";

// ── Stat Overlay (#34) ──────────────────────────────────────────

interface ProjectStats {
  duration?: string;
  photoCount?: number;
  cost?: string;
  reviewCount?: number;
  reviewAvg?: number;
}

export async function loadProjectStats(projectId: string): Promise<ProjectStats> {
  const [project] = await sql`
    SELECT p.start_date, p.end_date, p.metadata,
           (SELECT COUNT(*)::int FROM asset_projects ap WHERE ap.project_id = p.id) AS photo_count
    FROM projects p
    WHERE p.id = ${projectId}
  `;
  if (!project) return {};

  const stats: ProjectStats = {
    photoCount: (project.photo_count as number) || undefined,
  };

  if (project.start_date && project.end_date) {
    const start = new Date(String(project.start_date));
    const end = new Date(String(project.end_date));
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 14) stats.duration = `${days} days`;
    else stats.duration = `${Math.ceil(days / 7)} weeks`;
  }

  const meta = (project.metadata || {}) as Record<string, unknown>;
  if (meta.estimated_cost) stats.cost = String(meta.estimated_cost);

  return stats;
}

export function statOverlayText(stats: ProjectStats): string | null {
  const parts: string[] = [];
  if (stats.duration) parts.push(`Built in ${stats.duration}`);
  if (stats.cost) parts.push(stats.cost);
  if (stats.photoCount && stats.photoCount >= 10) parts.push(`${stats.photoCount} photos`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export async function applyStatOverlay(
  inputBuffer: Buffer,
  projectId: string,
): Promise<Buffer> {
  const stats = await loadProjectStats(projectId);
  const text = statOverlayText(stats);
  if (!text) return inputBuffer;

  return applyTextOverlays(inputBuffer, [
    {
      text,
      position: "bottom-left",
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
  ]);
}

// ── Location Tagging (#36) ──────────────────────────────────────

export interface LocationTag {
  name: string;
  lat?: number;
  lng?: number;
  platformLocationId?: string;
}

export async function resolveLocationTag(siteId: string): Promise<LocationTag | null> {
  const [site] = await sql`
    SELECT location, business_phone
    FROM sites WHERE id = ${siteId}
  `;
  if (!site?.location) return null;

  const [loc] = await sql`
    SELECT name, metadata->>'lat' AS lat, metadata->>'lng' AS lng
    FROM locations
    WHERE site_id = ${siteId}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return {
    name: loc ? String(loc.name) : String(site.location),
    lat: loc?.lat ? Number(loc.lat) : undefined,
    lng: loc?.lng ? Number(loc.lng) : undefined,
  };
}

// ── Pinterest Tall Pin (#38) ────────────────────────────────────

export async function renderPinterestPin(
  inputBuffer: Buffer,
  headline: string,
  grade: GradePreset = "warm_bright",
): Promise<Buffer> {
  let buffer = await cropForPlatform(inputBuffer, "2:3");
  buffer = await applyGrade(buffer, grade);

  const overlays: TextOverlay[] = [
    {
      text: headline,
      position: "bottom-center",
      fontSize: 36,
      fontWeight: "bold",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.65)",
    },
  ];

  return applyTextOverlays(buffer, overlays);
}

// ── GBP Post Types (#40) ────────────────────────────────────────

export type GbpPostType = "update" | "offer" | "event" | "product";

export interface GbpPostPayload {
  type: GbpPostType;
  summary: string;
  mediaUrl: string;
  callToAction?: {
    actionType: "LEARN_MORE" | "BOOK" | "ORDER" | "SHOP" | "SIGN_UP" | "CALL";
    url?: string;
  };
  offer?: {
    couponCode?: string;
    redeemUrl?: string;
    termsConditions?: string;
  };
  event?: {
    title: string;
    startDate: string;
    endDate: string;
  };
}

export function formatGbpPost(
  caption: string,
  mediaUrl: string,
  opts: {
    postType?: GbpPostType;
    websiteUrl?: string;
    phone?: string;
  } = {},
): GbpPostPayload {
  const type = opts.postType || "update";

  const payload: GbpPostPayload = {
    type,
    summary: caption.slice(0, 1500),
    mediaUrl,
  };

  if (opts.websiteUrl) {
    payload.callToAction = {
      actionType: "LEARN_MORE",
      url: opts.websiteUrl,
    };
  } else if (opts.phone) {
    payload.callToAction = {
      actionType: "CALL",
    };
  }

  return payload;
}

/**
 * Determine the best GBP post type based on content signals.
 */
export function inferGbpPostType(
  sceneType: string | null,
  hasProject: boolean,
): GbpPostType {
  if (hasProject) return "update";
  if (sceneType === "product" || sceneType === "detail") return "product";
  return "update";
}
