/**
 * Capture persistence — push CaptureResult bytes to R2 under a context-
 * organized key. Returns the public URL the rest of the system reads.
 *
 * Key layout:
 *   captures/<context>/<businessId>/<timestamp>.<ext>
 *
 * Examples:
 *   captures/website_screenshot/3db37450-…/2026-06-14T15-03-22Z.png
 *   captures/gbp_profile/e685b52a-…/2026-06-14T15-03-22Z.png
 *   captures/report_pdf/3db37450-…/2026-06-14T15-03-22Z.pdf
 *
 * Each capture gets a new key (timestamp-suffixed) — no in-place
 * overwrites. Older captures stay in R2 as a historical trail; callers
 * are responsible for cleaning up if they care to.
 */
import { uploadBufferToR2 } from "@/lib/r2";
import type { CaptureResult } from "./types";

export interface PersistOptions {
  /** Used in the R2 path. Keep stable across captures of the same kind. */
  context: string;
  /** Optional — organizes by business in the R2 key path. */
  businessId?: string;
  /** Optional override of the generated filename (without extension). */
  filename?: string;
}

const EXT_BY_FORMAT: Record<string, string> = {
  png: "png",
  jpeg: "jpg",
  pdf: "pdf",
};

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};

export async function persistCapture(
  result: CaptureResult,
  opts: PersistOptions,
): Promise<{ url: string; r2Key: string }> {
  const ext = EXT_BY_FORMAT[result.format];
  const contentType = CONTENT_TYPE_BY_FORMAT[result.format];
  if (!ext || !contentType) {
    throw new Error(`persistCapture: unsupported format '${result.format}'`);
  }

  const ts =
    opts.filename ??
    result.meta.capturedAt.replace(/[:.]/g, "-").replace("Z", "Z");

  const segments = ["captures", opts.context];
  if (opts.businessId) segments.push(opts.businessId);
  segments.push(`${ts}.${ext}`);
  const r2Key = segments.join("/");

  const url = await uploadBufferToR2(r2Key, result.bytes, contentType);
  return { url, r2Key };
}
