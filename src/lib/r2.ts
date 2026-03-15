import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_DOMAIN = "https://assets.tracpost.com";

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
    ...(opts.maxSizeBytes && { ContentLength: opts.maxSizeBytes }),
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 }); // 10 minutes

  return {
    uploadUrl,
    publicUrl: `${PUBLIC_DOMAIN}/${opts.key}`,
  };
}
