/**
 * Use-case helper: capture the brand's website homepage and persist it
 * as `businesses.business_website_screenshot`. Used by PPA (aesthetic
 * observation) as the primary visual input for brands without GBP photos
 * or other declared assets.
 *
 * Trigger surface today: operator action button on the Infrastructure
 * pipeline Website card. Future: auto-trigger from business_info complete
 * and/or self-heal inside the PPA action when missing.
 */
import { sql } from "@/lib/db";
import { capturePage } from ".";
import { persistCapture } from "./persist";
import { CaptureError } from "./types";

const VIEWPORT = { width: 1440, height: 900 };

export interface WebsiteScreenshotResult {
  url: string;
  capturedAt: string;
  durationMs: number;
  bytesSize: number;
}

export async function captureBusinessWebsiteScreenshot(
  businessId: string,
): Promise<WebsiteScreenshotResult> {
  const [biz] = await sql`
    SELECT id, url FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  if (!biz) {
    throw new CaptureError("invalid_request", `business ${businessId} not found`);
  }
  const rawUrl = (biz.url as string | null)?.trim();
  if (!rawUrl) {
    throw new CaptureError("invalid_request", "business URL not declared");
  }
  const targetUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const result = await capturePage({
    url: targetUrl,
    format: "png",
    viewport: VIEWPORT,
    fullPage: false,
    waitUntil: "networkidle",
    delayMs: 750,           // settle layout shifts after networkidle
    navigationTimeoutMs: 25_000,
    renderTimeoutMs: 40_000,
  });

  const persisted = await persistCapture(result, {
    context: "website_screenshot",
    businessId,
  });

  await sql`
    UPDATE businesses
    SET business_website_screenshot = ${persisted.url},
        business_website_screenshot_at = NOW()
    WHERE id = ${businessId}
  `;

  return {
    url: persisted.url,
    capturedAt: result.meta.capturedAt,
    durationMs: result.meta.durationMs,
    bytesSize: result.meta.bytesSize,
  };
}
