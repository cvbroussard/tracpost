/**
 * Capture service — `capturePage()` core.
 *
 * Navigates to a URL (or renders HTML) in headless Chrome, waits for the
 * requested condition, and returns bytes (PNG/JPEG/PDF). Errors are
 * classified into stable categories (navigation_failed / render_timeout /
 * selector_not_found / internal) so callers can branch on cause.
 *
 * See ./types.ts for the request/result/error shapes and README.md for
 * use guidance.
 */
import type { Page } from "puppeteer-core";
import { getBrowser } from "./browser";
import {
  CaptureError,
  type CaptureRequest,
  type CaptureResult,
} from "./types";

const DEFAULTS = {
  format: "png" as const,
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  fullPage: false,
  quality: 85,
  waitUntil: "networkidle" as const,
  navigationTimeoutMs: 30_000,
  renderTimeoutMs: 45_000,
};

export async function capturePage(req: CaptureRequest): Promise<CaptureResult> {
  const start = Date.now();

  // ── Validate ─────────────────────────────────────────────────────
  if (!req.url && !req.html) {
    throw new CaptureError("invalid_request", "capturePage: one of url or html is required");
  }
  if (req.url && req.html) {
    throw new CaptureError("invalid_request", "capturePage: only one of url or html may be set");
  }

  const format = req.format ?? DEFAULTS.format;
  const viewport = { ...DEFAULTS.viewport, ...(req.viewport ?? {}) };
  const fullPage = req.fullPage ?? DEFAULTS.fullPage;
  const quality = req.quality ?? DEFAULTS.quality;
  const waitUntil = req.waitUntil ?? DEFAULTS.waitUntil;
  const navigationTimeoutMs = req.navigationTimeoutMs ?? DEFAULTS.navigationTimeoutMs;
  const renderTimeoutMs = req.renderTimeoutMs ?? DEFAULTS.renderTimeoutMs;

  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    await page.setViewport(viewport);

    // ── Navigate / load content ────────────────────────────────────
    try {
      if (req.url) {
        await page.goto(req.url, {
          waitUntil: waitUntil === "load" ? "load" : "networkidle2",
          timeout: navigationTimeoutMs,
        });
      } else {
        // setContent's waitUntil is narrower (no networkidle variants since
        // there's no real network) — use "load" or "domcontentloaded".
        await page.setContent(req.html!, {
          waitUntil: "load",
          timeout: navigationTimeoutMs,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/timeout/i.test(msg)) {
        throw new CaptureError("render_timeout", `navigation timeout: ${msg}`);
      }
      throw new CaptureError("navigation_failed", `navigation failed: ${msg}`);
    }

    // ── Optional selector wait ─────────────────────────────────────
    if (req.waitForSelector) {
      try {
        await page.waitForSelector(req.waitForSelector, {
          timeout: Math.max(0, renderTimeoutMs - (Date.now() - start)),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new CaptureError(
          "selector_not_found",
          `waitForSelector('${req.waitForSelector}') failed: ${msg}`,
        );
      }
    }

    // ── Fixed delay ────────────────────────────────────────────────
    if (req.delayMs && req.delayMs > 0) {
      await new Promise((r) => setTimeout(r, req.delayMs));
    }

    // ── Capture ────────────────────────────────────────────────────
    let bytes: Buffer;
    if (format === "pdf") {
      const buf = await page.pdf({
        printBackground: true,
        format: "Letter",
        timeout: Math.max(0, renderTimeoutMs - (Date.now() - start)),
      });
      bytes = Buffer.from(buf);
    } else {
      const ssOpts: Parameters<typeof page.screenshot>[0] = {
        type: format,
        fullPage,
        ...(format === "jpeg" ? { quality } : {}),
      };
      const buf = await page.screenshot(ssOpts);
      bytes = Buffer.from(buf);
    }

    return {
      format,
      bytes,
      meta: {
        capturedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        viewport: { width: viewport.width, height: viewport.height },
        sourceUrl: req.url,
        bytesSize: bytes.byteLength,
      },
    };
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new CaptureError("internal", `capturePage failed: ${msg}`);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export { CaptureError } from "./types";
export type { CaptureRequest, CaptureResult, CaptureErrorKind, CaptureFormat, CaptureViewport } from "./types";
