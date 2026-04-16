#!/usr/bin/env node
/**
 * One-off cleanup: delete orphaned HEIC/HEIF files from R2.
 *
 * These are source files from iPhone uploads that have already been
 * converted to JPEG. The DB no longer references them (storage_url
 * was swapped to the JPEG), but the R2 objects were never deleted.
 *
 * Approach:
 *   1. List all R2 objects ending in .heic / .heif
 *   2. Check if any media_assets.storage_url points at each
 *   3. If unreferenced → delete from R2
 *
 * Run: node scripts/cleanup-heic-orphans.js [--dry-run]
 */
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const dryRun = process.argv.includes("--dry-run");

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_DOMAIN = "https://assets.tracpost.com";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const sql = neon(process.env.DATABASE_URL);

async function listHeicKeys() {
  const keys = [];
  let continuationToken;
  do {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents || []) {
      const key = obj.Key || "";
      if (key.endsWith(".heic") || key.endsWith(".heif")) {
        keys.push({ key, size: obj.Size || 0 });
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function main() {
  console.log(dryRun ? "DRY RUN — no deletions\n" : "LIVE RUN — orphans will be deleted\n");

  const heicKeys = await listHeicKeys();
  console.log(`Found ${heicKeys.length} HEIC/HEIF objects in R2\n`);

  let orphans = 0;
  let referenced = 0;
  let totalBytes = 0;

  for (const { key, size } of heicKeys) {
    const url = `${PUBLIC_DOMAIN}/${key}`;
    const [ref] = await sql`
      SELECT 1 FROM media_assets WHERE storage_url = ${url} LIMIT 1
    `;
    if (ref) {
      referenced++;
      console.log(`  KEEP  ${key} (still referenced)`);
    } else {
      orphans++;
      totalBytes += size;
      if (dryRun) {
        console.log(`  WOULD DELETE  ${key} (${(size / 1024).toFixed(0)} KB)`);
      } else {
        await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        console.log(`  DELETED  ${key} (${(size / 1024).toFixed(0)} KB)`);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Referenced (kept): ${referenced}`);
  console.log(`  Orphans ${dryRun ? "(would delete)" : "(deleted)"}: ${orphans}`);
  console.log(`  Space ${dryRun ? "reclaimable" : "reclaimed"}: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
