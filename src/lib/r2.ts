import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_DOMAIN = "https://assets.tracpost.com";

export { PUBLIC_DOMAIN as R2_PUBLIC_DOMAIN };

/**
 * Parse the R2 object key out of a public storage URL.
 * "https://assets.tracpost.com/uploads/abc.jpg" → "uploads/abc.jpg"
 */
export function keyFromStorageUrl(url: string): string | null {
  if (!url.startsWith(PUBLIC_DOMAIN + "/")) return null;
  return url.slice(PUBLIC_DOMAIN.length + 1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generate a presigned PUT URL for direct client upload to R2.
 * Returns both the upload URL and the final public URL.
 */
export async function createPresignedUpload(opts: {
  key: string;
  contentType: string;
  maxSizeBytes?: number;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
    CacheControl: "public, max-age=31536000, immutable",
    ...(opts.maxSizeBytes && { ContentLength: opts.maxSizeBytes }),
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 }); // 10 minutes

  return {
    uploadUrl,
    publicUrl: `${PUBLIC_DOMAIN}/${opts.key}`,
  };
}

/**
 * Upload a buffer directly to R2 (server-side).
 * Used for re-hosting images during blog import and for in-place
 * replacement of existing objects (same key, new bytes).
 */
export async function uploadBufferToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${PUBLIC_DOMAIN}/${key}`;
}

/**
 * Hard-delete an object from R2. Used when a media_assets row is
 * being deleted and no references remain.
 */
export async function deleteObjectFromR2(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
}

/**
 * Server-side rename of an R2 object to a new (SEO-shaped) key. R2 has no
 * native rename, so this copies the bytes to newKey and verifies the copy
 * landed. Bytes never leave R2 — EXIF, color profiles, all metadata
 * preserved byte-perfect.
 *
 * The old key is deliberately NOT deleted. Copy + delete + the caller's DB
 * update are three non-atomic steps across two systems with no safe
 * rollback; an inline delete of the only original — gated on an unverified
 * copy or a not-yet-committed DB write — can destroy an irreplaceable asset
 * (it did: squirrel-hill, 2026-05-20). The old key is left as a harmless
 * orphan, cleared by the per-site wipe at cancellation, consistent with the
 * soft-delete policy. Worst case of a failed rename is now a duplicate,
 * never a loss. Do not re-add the delete.
 *
 * Returns the new public URL. Throws if the copy or its verification fails
 * — the caller must then keep pointing at oldKey, which is still intact.
 */
export async function renameR2Object(oldKey: string, newKey: string): Promise<string> {
  if (oldKey === newKey) {
    return `${PUBLIC_DOMAIN}/${newKey}`;
  }
  await r2.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      Key: newKey,
      CopySource: `${BUCKET}/${oldKey}`,
      MetadataDirective: "COPY",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  // Verify the bytes actually landed — CopyObject can report success
  // without durably writing. Nothing repoints at newKey until this passes.
  await r2.send(
    new HeadObjectCommand({
      Bucket: BUCKET,
      Key: newKey,
    }),
  );
  return `${PUBLIC_DOMAIN}/${newKey}`;
}

/**
 * Presigned PUT URL for replacing an existing object in place.
 * Used for large files (video) so the client uploads directly to
 * R2, bypassing our API body-size limits.
 */
export async function createPresignedReplaceUrl(opts: {
  key: string;
  contentType: string;
  maxSizeBytes?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
    ...(opts.maxSizeBytes && { ContentLength: opts.maxSizeBytes }),
  });
  return getSignedUrl(r2, command, { expiresIn: 600 });
}
