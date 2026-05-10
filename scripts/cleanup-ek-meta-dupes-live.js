/**
 * LIVE cleanup script: delete Meta duplicate posts on Epicurious Kitchens
 * created by the cron-loop bug.
 *
 * Calls Meta Graph API DELETE for each duplicate, then stamps
 * vetoed_at + veto_reason on the DB row. Keeps the earliest occurrence
 * of each (caption, asset) tuple. See cleanup-ek-meta-dupes-dryrun.js
 * for the read-only sibling.
 *
 * Safety: requires CONFIRM_DELETE=yes env var. Without it, prints the
 * deletion plan and exits without touching the platform.
 *
 * Run (preview only):
 *   node scripts/cleanup-ek-meta-dupes-live.js
 * Run (actually delete):
 *   CONFIRM_DELETE=yes node scripts/cleanup-ek-meta-dupes-live.js
 */
const { neon } = require("@neondatabase/serverless");
const { createDecipheriv } = require("node:crypto");
require("dotenv").config({ path: ".env.local" });

const EK_SITE_ID = "a2df5b78-a607-4633-aa09-8e116e2ccfb2";
const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const RATE_LIMIT_MS = 500; // pause between API calls
const VETO_REASON = "cron-loop cleanup 2026-05-10";

// Mirror src/lib/crypto.ts decrypt() — AES-256-GCM with "enc:" prefix.
function decryptToken(value) {
  if (!value) return value;
  if (!value.startsWith("enc:")) return value;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set — cannot decrypt token");
  const keyBuf = Buffer.from(key, "hex");
  const payload = Buffer.from(value.slice(4), "base64");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(12, payload.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

function fmt(d) {
  if (!d) return "(no date)";
  return new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function previewCaption(c) {
  if (!c) return "(no caption)";
  const oneLine = c.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const confirm = process.env.CONFIRM_DELETE === "yes";

  console.log("============================================================");
  console.log("  EK Meta cleanup — LIVE script");
  console.log("  Mode: " + (confirm ? "EXECUTE (will hit Graph API)" : "PREVIEW (no platform calls)"));
  console.log("============================================================");

  // 1. Load all published Meta posts for EK
  const posts = await sql`
    SELECT
      sp.id,
      sp.platform_post_id,
      sp.platform_post_url,
      sp.published_at,
      sp.source_asset_id,
      sp.caption,
      sp.account_id
    FROM social_posts sp
    JOIN social_accounts a ON a.id = sp.account_id
    WHERE sp.site_id = ${EK_SITE_ID}
      AND sp.status = 'published'
      AND a.platform = 'meta'
      AND sp.vetoed_at IS NULL
    ORDER BY sp.published_at ASC
  `;

  if (posts.length === 0) {
    console.log("No eligible Meta posts for EK. Nothing to do.");
    return;
  }

  // 2. Group by (caption, source_asset_id) — keep earliest, delete the rest
  const groups = new Map();
  for (const p of posts) {
    const key = `${p.caption || "(none)"} ${p.source_asset_id || "(none)"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
  }

  const allDupes = [];
  for (const arr of groups.values()) {
    allDupes.push(...arr.slice(1));
  }

  // Split by platform: Facebook posts can be deleted via Graph API,
  // Instagram posts cannot (Meta deliberately doesn't expose IG media
  // DELETE — they require manual deletion via the Instagram app).
  const isInstagram = (p) => /instagram\.com/.test(p.platform_post_url || "");
  const fbDupes = allDupes.filter((p) => !isInstagram(p));
  const igDupes = allDupes.filter(isInstagram);

  console.log(`Total posts inspected: ${posts.length}`);
  console.log(`Distinct tuples: ${groups.size}`);
  console.log(`Keepers: ${groups.size}`);
  console.log(`All dupes: ${allDupes.length}`);
  console.log(`  Facebook (API-deletable): ${fbDupes.length}`);
  console.log(`  Instagram (manual deletion only — Meta API doesn't expose IG media DELETE): ${igDupes.length}`);
  console.log("");

  const deleteList = fbDupes;

  // Always print the IG manual-deletion list so the operator has the URLs.
  if (igDupes.length > 0) {
    console.log("------------------------------------------------------------");
    console.log(`  INSTAGRAM POSTS REQUIRING MANUAL DELETION (${igDupes.length})`);
    console.log("  Meta does not expose a DELETE endpoint for IG media.");
    console.log("  Open each URL in Instagram and delete via the post menu.");
    console.log("------------------------------------------------------------");
    let n = 1;
    for (const d of igDupes) {
      console.log(`  [IG ${n++}/${igDupes.length}] ${d.platform_post_url || "(no url) post=" + d.platform_post_id}`);
    }
    console.log("");
    console.log("  After deleting IG posts manually, mark them in DB:");
    console.log(`    UPDATE social_posts SET vetoed_at = NOW(), veto_reason = '${VETO_REASON} (manual IG)'`);
    console.log("    WHERE id IN (");
    console.log("      " + igDupes.map((d) => `'${d.id}'`).join(",\n      "));
    console.log("    );");
    console.log("");
  }

  if (deleteList.length === 0) {
    console.log("No Facebook duplicates to delete via API.");
    return;
  }

  // 3. Load the page access token (single account for EK Meta)
  const accountIds = [...new Set(deleteList.map((p) => p.account_id))];
  const accountRows = await sql`
    SELECT id, account_name, account_id, access_token_encrypted
    FROM social_accounts
    WHERE id = ANY(${accountIds}::uuid[])
  `;
  const tokensByAccount = new Map();
  for (const a of accountRows) {
    try {
      tokensByAccount.set(a.id, decryptToken(a.access_token_encrypted));
      console.log(`Loaded token for ${a.account_name} (platform_account_id=${a.account_id})`);
    } catch (err) {
      console.error(`FAILED to decrypt token for ${a.account_name}: ${err.message}`);
      tokensByAccount.set(a.id, null);
    }
  }
  console.log("");

  if (!confirm) {
    console.log("------------------------------------------------------------");
    console.log("  PREVIEW MODE — would delete the following:");
    console.log("------------------------------------------------------------");
    for (const d of deleteList.slice(0, 10)) {
      console.log(`  ${fmt(d.published_at)}  post=${d.platform_post_id}`);
      console.log(`    ${d.platform_post_url || "(no url)"}`);
      console.log(`    "${previewCaption(d.caption)}"`);
    }
    if (deleteList.length > 10) {
      console.log(`  ... and ${deleteList.length - 10} more`);
    }
    console.log("");
    console.log("To EXECUTE the deletions, re-run with:");
    console.log("  CONFIRM_DELETE=yes node scripts/cleanup-ek-meta-dupes-live.js");
    return;
  }

  // 4. Execute deletions
  console.log("------------------------------------------------------------");
  console.log(`  EXECUTING ${deleteList.length} deletions`);
  console.log("------------------------------------------------------------");

  const counters = {
    succeeded: 0,
    already_gone: 0,
    failed: 0,
    skipped_no_token: 0,
  };
  const failures = [];

  for (let i = 0; i < deleteList.length; i++) {
    const d = deleteList[i];
    const progress = `[${i + 1}/${deleteList.length}]`;
    const token = tokensByAccount.get(d.account_id);

    if (!token) {
      console.log(`${progress} SKIP no-token  post=${d.platform_post_id}`);
      counters.skipped_no_token++;
      continue;
    }

    const url = `${GRAPH_BASE}/${encodeURIComponent(d.platform_post_id)}?access_token=${encodeURIComponent(token)}`;
    let result = "unknown";
    let errMsg = null;

    try {
      const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(15000) });
      const bodyText = await res.text();
      let body = null;
      try { body = JSON.parse(bodyText); } catch { /* not json */ }

      if (res.ok && body && body.success === true) {
        result = "deleted";
        counters.succeeded++;
      } else if (res.status === 400 || res.status === 404) {
        // 400 commonly means "Object does not exist" if post is already gone
        const code = body?.error?.code;
        const msg = body?.error?.message || bodyText.slice(0, 120);
        if (code === 100 || /does not exist|nonexisting|cannot be loaded/i.test(msg)) {
          result = "already-gone";
          counters.already_gone++;
        } else {
          result = `error code=${code}`;
          errMsg = msg;
          counters.failed++;
          failures.push({ id: d.platform_post_id, url: d.platform_post_url, status: res.status, code, msg });
        }
      } else {
        result = `http ${res.status}`;
        errMsg = body?.error?.message || bodyText.slice(0, 120);
        counters.failed++;
        failures.push({ id: d.platform_post_id, url: d.platform_post_url, status: res.status, msg: errMsg });
      }
    } catch (err) {
      result = "exception";
      errMsg = err.message;
      counters.failed++;
      failures.push({ id: d.platform_post_id, url: d.platform_post_url, msg: errMsg });
    }

    // 5. Stamp DB row regardless of "deleted" or "already-gone" — both
    // outcomes mean the post is no longer on the platform. Genuine failures
    // leave the row untouched so a re-run can retry.
    if (result === "deleted" || result === "already-gone") {
      try {
        await sql`
          UPDATE social_posts
          SET vetoed_at = NOW(), veto_reason = ${VETO_REASON}
          WHERE id = ${d.id}
        `;
      } catch (err) {
        console.warn(`  DB update failed for ${d.id}: ${err.message}`);
      }
    }

    console.log(`${progress} ${result.padEnd(14)} post=${d.platform_post_id}${errMsg ? "  err=" + errMsg.slice(0, 80) : ""}`);

    if (i < deleteList.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log("");
  console.log("============================================================");
  console.log("  FINAL REPORT");
  console.log("============================================================");
  console.log(`  deleted:     ${counters.succeeded}`);
  console.log(`  already-gone: ${counters.already_gone}`);
  console.log(`  failed:       ${counters.failed}`);
  console.log(`  skipped (no token): ${counters.skipped_no_token}`);
  if (failures.length > 0) {
    console.log("");
    console.log(`  ${failures.length} failures (DB rows NOT vetoed; re-run to retry):`);
    for (const f of failures) {
      console.log(`    post=${f.id}  status=${f.status || "?"}  ${f.msg || ""}`);
    }
  }
  console.log("============================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
