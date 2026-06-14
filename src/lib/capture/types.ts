/**
 * Capture service — shared types.
 *
 * Decouples capture from persistence: `capturePage()` returns bytes; callers
 * choose whether to persist via `persistCapture()`. Use-case helpers
 * (website-screenshot.ts, future GBP/competitor/PDF capturers) compose the
 * two layers and add domain-specific defaults.
 */

export type CaptureFormat = "png" | "jpeg" | "pdf";

export interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

export interface CaptureRequest {
  /** Navigate to this URL. Exactly one of url or html required. */
  url?: string;
  /** Render this HTML directly (for server-composed PDFs). Exactly one of url or html required. */
  html?: string;

  /** Output format. Default: "png". */
  format?: CaptureFormat;

  /** Viewport. Default: 1440x900, deviceScaleFactor 1, isMobile false. */
  viewport?: CaptureViewport;

  /** Capture the full scrollable page rather than just the viewport. Default: false. Ignored for PDF. */
  fullPage?: boolean;

  /** JPEG quality 0-100. Ignored for png/pdf. Default: 85. */
  quality?: number;

  /** Navigation wait condition. Default: "networkidle". */
  waitUntil?: "load" | "networkidle";

  /** Wait for a CSS selector to appear in the DOM before capture. Optional. */
  waitForSelector?: string;

  /** Additional fixed delay after waitUntil/waitForSelector. Optional. */
  delayMs?: number;

  /** Navigation timeout. Default: 30000. */
  navigationTimeoutMs?: number;

  /** Total render budget (navigation + waits + capture). Default: 45000. */
  renderTimeoutMs?: number;
}

export interface CaptureResult {
  format: CaptureFormat;
  bytes: Buffer;
  meta: {
    /** ISO timestamp of capture completion. */
    capturedAt: string;
    /** Wall-clock duration from launch to bytes returned. */
    durationMs: number;
    /** Effective viewport used. */
    viewport: { width: number; height: number };
    /** Source URL if `url` was provided. Undefined for html captures. */
    sourceUrl?: string;
    /** Captured byte size. */
    bytesSize: number;
  };
}

export type CaptureErrorKind =
  | "navigation_failed"     // DNS, connection refused, 5xx, no response
  | "render_timeout"        // page never reached idle / selector never appeared within budget
  | "selector_not_found"    // waitForSelector explicitly missed before timeout
  | "invalid_request"       // both url+html supplied or neither, etc.
  | "internal";             // unexpected — log and surface

export class CaptureError extends Error {
  kind: CaptureErrorKind;
  constructor(kind: CaptureErrorKind, message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}
