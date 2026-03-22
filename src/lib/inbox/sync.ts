import { sql } from "@/lib/db";
import { syncComments } from "./sync-comments";
import { syncReviews } from "./sync-reviews";
import { sendPushNotification } from "@/lib/notifications";
import type { InboxSyncResult } from "./types";

/**
 * Sync all inbox engagement (comments + reviews) for a site.
 * Called as a step in the pipeline orchestrator.
 */
export async function syncInboxEngagement(siteId: string): Promise<InboxSyncResult> {
  const result: InboxSyncResult = {
    commentsAdded: 0,
    reviewsAdded: 0,
    errors: [],
  };

  try {
    result.commentsAdded = await syncComments(siteId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`comment-sync: ${msg}`);
  }

  try {
    result.reviewsAdded = await syncReviews(siteId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`review-sync: ${msg}`);
  }

  // Send push notification if there are new items
  if (result.commentsAdded > 0 || result.reviewsAdded > 0) {
    await notifyNewEngagement(siteId, result);
  }

  return result;
}

async function notifyNewEngagement(siteId: string, result: InboxSyncResult): Promise<void> {
  try {
    const siteRows = await sql`
      SELECT si.subscriber_id, si.name as site_name
      FROM sites si
      WHERE si.id = ${siteId}
    `;
    if (siteRows.length === 0) return;

    const { subscriber_id, site_name } = siteRows[0];
    const parts: string[] = [];

    if (result.commentsAdded > 0) {
      parts.push(`${result.commentsAdded} new comment${result.commentsAdded === 1 ? "" : "s"}`);
    }
    if (result.reviewsAdded > 0) {
      parts.push(`${result.reviewsAdded} new review${result.reviewsAdded === 1 ? "" : "s"}`);
    }

    const title = `New engagement — ${site_name || "Your Site"}`;
    const body = parts.join(", ");

    await sendPushNotification(subscriber_id, title, body, {
      siteId,
      type: "inbox",
    });
  } catch (err) {
    console.error("Failed to send inbox notification:", err);
  }
}
