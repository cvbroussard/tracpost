/**
 * Face detection and recognition via AWS Rekognition.
 *
 * Uses a per-site Rekognition Collection to store and match face embeddings.
 * No local models, no TensorFlow — just API calls.
 *
 * Env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */
import { RekognitionClient, DetectFacesCommand, IndexFacesCommand, SearchFacesByImageCommand, CreateCollectionCommand, ListCollectionsCommand } from "@aws-sdk/client-rekognition";
import { sql } from "@/lib/db";

let client: RekognitionClient | null = null;

function getClient(): RekognitionClient {
  if (!client) {
    client = new RekognitionClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

/**
 * Get or create a Rekognition collection for a site.
 * Collection name: tracpost-{siteId}
 */
async function ensureCollection(siteId: string): Promise<string> {
  const collectionId = `tracpost-${siteId.slice(0, 20)}`;
  const rek = getClient();

  try {
    const list = await rek.send(new ListCollectionsCommand({}));
    if (list.CollectionIds?.includes(collectionId)) return collectionId;
  } catch { /* ignore */ }

  try {
    await rek.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  } catch { /* already exists */ }

  return collectionId;
}

export interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  score: number;
  faceId?: string;
  embedding: number[]; // Empty for Rekognition — matching is server-side
}

export interface FaceMatch {
  personaId: string;
  personaName: string;
  distance: number;
}

/**
 * Detect faces in an image. Returns bounding boxes and confidence scores.
 * Box coordinates are percentages (0-1) of image dimensions.
 */
export async function detectFaces(imageUrl: string): Promise<{ faces: DetectedFace[]; imageWidth: number; imageHeight: number }> {
  const rek = getClient();

  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { faces: [], imageWidth: 0, imageHeight: 0 };
    const buffer = Buffer.from(await res.arrayBuffer());

    // Get image dimensions
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width || 1;
    const imgH = meta.height || 1;

    const cmd = new DetectFacesCommand({
      Image: { Bytes: buffer },
      Attributes: ["DEFAULT"],
    });

    const result = await rek.send(cmd);

    const faces: DetectedFace[] = (result.FaceDetails || []).map((face) => {
      const box = face.BoundingBox!;
      return {
        // Convert percentage-based box to pixel coordinates
        box: {
          x: Math.round((box.Left || 0) * imgW),
          y: Math.round((box.Top || 0) * imgH),
          width: Math.round((box.Width || 0) * imgW),
          height: Math.round((box.Height || 0) * imgH),
        },
        score: face.Confidence ? face.Confidence / 100 : 0,
        embedding: [], // Rekognition handles matching server-side
      };
    });

    return { faces, imageWidth: imgW, imageHeight: imgH };
  } catch (err) {
    console.error("Rekognition DetectFaces error:", err instanceof Error ? err.message : err);
    return { faces: [], imageWidth: 0, imageHeight: 0 };
  }
}

/**
 * Index a face into the site's Rekognition collection.
 * Called when a tenant names a face — stores the face for future matching.
 * Returns the Rekognition FaceId.
 */
export async function indexFace(
  siteId: string,
  imageUrl: string,
  box: { x: number; y: number; width: number; height: number },
  personaId: string
): Promise<string | null> {
  const rek = getClient();
  const collectionId = await ensureCollection(siteId);

  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const cmd = new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: buffer },
      ExternalImageId: personaId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    });

    const result = await rek.send(cmd);
    const indexed = result.FaceRecords?.[0]?.Face;
    return indexed?.FaceId || null;
  } catch (err) {
    console.error("Rekognition IndexFaces error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Search for matching faces in the site's collection.
 * Returns matched persona IDs for each face found.
 */
export async function searchFaces(
  siteId: string,
  imageUrl: string
): Promise<Array<{ box: { x: number; y: number; width: number; height: number }; personaId: string; personaName: string; similarity: number }>> {
  const rek = getClient();
  const collectionId = await ensureCollection(siteId);

  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const buffer = Buffer.from(await res.arrayBuffer());

    // Get image dimensions
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width || 1;
    const imgH = meta.height || 1;

    const cmd = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: buffer },
      MaxFaces: 10,
      FaceMatchThreshold: 80,
    });

    const result = await rek.send(cmd);

    if (!result.FaceMatches?.length) return [];

    // Look up persona names from ExternalImageId (which we set to personaId)
    const matches: Array<{ box: { x: number; y: number; width: number; height: number }; personaId: string; personaName: string; similarity: number }> = [];

    const searchBox = result.SearchedFaceBoundingBox;

    for (const match of result.FaceMatches) {
      const personaId = match.Face?.ExternalImageId;
      if (!personaId) continue;

      const [persona] = await sql`SELECT name FROM personas WHERE id = ${personaId}`;
      matches.push({
        box: searchBox ? {
          x: Math.round((searchBox.Left || 0) * imgW),
          y: Math.round((searchBox.Top || 0) * imgH),
          width: Math.round((searchBox.Width || 0) * imgW),
          height: Math.round((searchBox.Height || 0) * imgH),
        } : { x: 0, y: 0, width: 0, height: 0 },
        personaId,
        personaName: (persona?.name as string) || "Unknown",
        similarity: match.Similarity || 0,
      });
    }

    return matches;
  } catch (err) {
    // Collection might be empty — that's fine
    if (err instanceof Error && err.message.includes("no faces in the collection")) return [];
    console.error("Rekognition SearchFaces error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Process faces for an asset: detect, search for matches, auto-tag, store data.
 * Called during the processing pipeline.
 */
export async function processFaces(
  assetId: string,
  siteId: string,
  imageUrl: string
): Promise<{ matched: number; unmatched: number }> {
  // Step 1: Detect all faces
  const { faces, imageWidth, imageHeight } = await detectFaces(imageUrl);
  if (faces.length === 0) return { matched: 0, unmatched: 0 };

  // Step 2: Search for known faces
  const matches = await searchFaces(siteId, imageUrl);
  const matchedPersonaIds = new Set(matches.map((m) => m.personaId));

  // Auto-tag matched personas
  for (const match of matches) {
    await sql`
      INSERT INTO asset_personas (asset_id, persona_id)
      VALUES (${assetId}, ${match.personaId})
      ON CONFLICT DO NOTHING
    `;
  }

  // Step 3: Store face data on the asset
  const faceData = {
    detectionWidth: imageWidth,
    detectionHeight: imageHeight,
    faces: faces.map((f, i) => {
      const match = matches.find((m) =>
        Math.abs(m.box.x - f.box.x) < imageWidth * 0.1 &&
        Math.abs(m.box.y - f.box.y) < imageHeight * 0.1
      );
      return {
        box: f.box,
        score: f.score,
        personaId: match?.personaId || null,
        personaName: match?.personaName || null,
        distance: match ? (1 - match.similarity / 100) : null,
        embedding: [], // Rekognition manages embeddings server-side
        index: i,
      };
    }),
    processedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ faces: faceData })}::jsonb
    WHERE id = ${assetId}
  `;

  return {
    matched: matchedPersonaIds.size,
    unmatched: faces.length - matchedPersonaIds.size,
  };
}

/**
 * Store a face in the Rekognition collection for a persona.
 * Called when a tenant names an unknown face.
 */
export async function setPersonaEmbedding(
  personaId: string,
  _embedding: number[], // Unused with Rekognition — kept for API compat
  siteId?: string,
  imageUrl?: string
): Promise<void> {
  if (siteId && imageUrl) {
    const faceId = await indexFace(siteId, imageUrl, { x: 0, y: 0, width: 0, height: 0 }, personaId);
    if (faceId) {
      await sql`
        UPDATE personas
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ rekognition_face_id: faceId })}::jsonb
        WHERE id = ${personaId}
      `;
    }
  }
}
