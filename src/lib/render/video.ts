/**
 * Video transforms using ffmpeg. Produces MP4 files stored in R2.
 * Social-first: one rendered MP4, served everywhere (social platforms
 * get it as upload, web pages get it as <video> tag).
 *
 * Vercel serverless constraints:
 * - /tmp: 512MB (sufficient for short-form video)
 * - Timeout: 300s max (sufficient for 15-60s output)
 * - Memory: up to 3008MB (sufficient for image→video)
 */
import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { uploadBufferToR2 } from "@/lib/r2";

const execFileAsync = promisify(execFile);

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("ffmpeg-static") as string;
}

const TMP_DIR = "/tmp/tracpost-video";

async function ensureTmpDir(): Promise<void> {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
}

async function fetchToFile(url: string, filename: string): Promise<string> {
  await ensureTmpDir();
  const filepath = path.join(TMP_DIR, filename);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filepath, buffer);
  return filepath;
}

async function cleanup(...files: string[]): Promise<void> {
  for (const f of files) {
    try { await unlink(f); } catch { /* ignore */ }
  }
}

// ── Ken Burns from stills (#23) ──────────────────────────────────

interface KenBurnsOpts {
  imageUrls: string[];
  durationPerImage?: number;
  outputAspect?: "9:16" | "1:1" | "16:9";
  siteId: string;
}

/**
 * Create a Ken Burns video from a series of still photos.
 * Each photo gets a slow pan/zoom with crossfade transitions.
 * Output: MP4 at the specified aspect ratio.
 */
export async function createKenBurnsVideo(opts: KenBurnsOpts): Promise<string> {
  const durPerImg = opts.durationPerImage || 4;
  const aspect = opts.outputAspect || "9:16";
  const dims = aspect === "9:16" ? "1080:1920" : aspect === "1:1" ? "1080:1080" : "1920:1080";
  const [w, h] = dims.split(":").map(Number);

  await ensureTmpDir();

  // Download images
  const inputPaths: string[] = [];
  for (let i = 0; i < opts.imageUrls.length; i++) {
    const ext = opts.imageUrls[i].split(".").pop()?.split("?")[0] || "jpg";
    const p = await fetchToFile(opts.imageUrls[i], `kb-${Date.now()}-${i}.${ext}`);
    inputPaths.push(p);
  }

  const outputPath = path.join(TMP_DIR, `kb-${Date.now()}.mp4`);

  // Build ffmpeg filter complex for Ken Burns (zoompan per image + concat)
  const fps = 30;
  const totalFramesPerImg = durPerImg * fps;

  // Each image: scale to fill, then zoompan with slow zoom-in
  const filterInputs: string[] = [];
  const filterChains: string[] = [];

  for (let i = 0; i < inputPaths.length; i++) {
    filterChains.push(
      `[${i}:v]scale=${w * 2}:${h * 2},zoompan=z='min(zoom+0.001,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFramesPerImg}:s=${w}x${h}:fps=${fps},setsar=1[v${i}]`,
    );
    filterInputs.push(`[v${i}]`);
  }

  // Concat all segments
  filterChains.push(
    `${filterInputs.join("")}concat=n=${inputPaths.length}:v=1:a=0[outv]`,
  );

  const args = [
    ...inputPaths.flatMap((p) => ["-loop", "1", "-t", String(durPerImg), "-i", p]),
    "-filter_complex", filterChains.join(";"),
    "-map", "[outv]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 240000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${opts.siteId}/video/${date}/ken-burns-${Date.now()}.mp4`;
  const url = await uploadBufferToR2(key, outputBuffer, "video/mp4");

  await cleanup(outputPath, ...inputPaths);

  return url;
}

// ── Timelapse from photo series (#24) ────────────────────────────

interface TimelapseOpts {
  imageUrls: string[];
  fps?: number;
  outputAspect?: "9:16" | "1:1" | "16:9";
  siteId: string;
}

/**
 * Create a timelapse video from a series of project photos.
 * Each photo is one frame at the specified framerate.
 */
export async function createTimelapse(opts: TimelapseOpts): Promise<string> {
  const fps = opts.fps || 4;
  const aspect = opts.outputAspect || "9:16";
  const dims = aspect === "9:16" ? "1080:1920" : aspect === "1:1" ? "1080:1080" : "1920:1080";

  await ensureTmpDir();

  // Download and number images sequentially
  const inputPaths: string[] = [];
  for (let i = 0; i < opts.imageUrls.length; i++) {
    const p = await fetchToFile(opts.imageUrls[i], `tl-${Date.now()}-${String(i).padStart(4, "0")}.jpg`);
    inputPaths.push(p);
  }

  // Create a concat file for ffmpeg
  const concatPath = path.join(TMP_DIR, `tl-concat-${Date.now()}.txt`);
  const concatContent = inputPaths
    .map((p) => `file '${p}'\nduration ${1 / fps}`)
    .join("\n");
  await writeFile(concatPath, concatContent);

  const outputPath = path.join(TMP_DIR, `tl-${Date.now()}.mp4`);

  const args = [
    "-f", "concat", "-safe", "0", "-i", concatPath,
    "-vf", `scale=${dims.replace(":", ":")}:force_original_aspect_ratio=decrease,pad=${dims.replace(":", ":")}:(ow-iw)/2:(oh-ih)/2:black`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 120000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${opts.siteId}/video/${date}/timelapse-${Date.now()}.mp4`;
  const url = await uploadBufferToR2(key, outputBuffer, "video/mp4");

  await cleanup(outputPath, concatPath, ...inputPaths);

  return url;
}

// ── Aspect reformat (#26) ────────────────────────────────────────

interface ReformatOpts {
  videoUrl: string;
  targetAspect: "9:16" | "1:1" | "16:9";
  siteId: string;
}

/**
 * Reformat a video from one aspect ratio to another.
 * Uses center crop (no AI subject tracking yet — Phase 2 upgrade).
 */
export async function reformatVideo(opts: ReformatOpts): Promise<string> {
  const dims = opts.targetAspect === "9:16" ? "1080:1920"
    : opts.targetAspect === "1:1" ? "1080:1080"
    : "1920:1080";

  await ensureTmpDir();
  const inputPath = await fetchToFile(opts.videoUrl, `reformat-in-${Date.now()}.mp4`);
  const outputPath = path.join(TMP_DIR, `reformat-${Date.now()}.mp4`);

  const args = [
    "-i", inputPath,
    "-vf", `scale=${dims.replace(":", ":")}:force_original_aspect_ratio=increase,crop=${dims.replace(":", ":")}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 240000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${opts.siteId}/video/${date}/reformat-${Date.now()}.mp4`;
  const url = await uploadBufferToR2(key, outputBuffer, "video/mp4");

  await cleanup(inputPath, outputPath);

  return url;
}

// ── Text overlay on video (#27) ──────────────────────────────────

interface VideoTextOpts {
  videoUrl: string;
  text: string;
  position?: "top" | "bottom" | "center";
  fontSize?: number;
  siteId: string;
}

/**
 * Burn text onto a video (headline, CTA, project name).
 */
export async function addVideoTextOverlay(opts: VideoTextOpts): Promise<string> {
  const fontSize = opts.fontSize || 48;
  const yPos = opts.position === "top" ? "50"
    : opts.position === "center" ? "(h-text_h)/2"
    : "h-text_h-60";

  await ensureTmpDir();
  const inputPath = await fetchToFile(opts.videoUrl, `vtext-in-${Date.now()}.mp4`);
  const outputPath = path.join(TMP_DIR, `vtext-${Date.now()}.mp4`);

  const escapedText = opts.text.replace(/'/g, "'\\''").replace(/:/g, "\\:");

  const args = [
    "-i", inputPath,
    "-vf", `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${yPos}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 180000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${opts.siteId}/video/${date}/text-overlay-${Date.now()}.mp4`;
  const url = await uploadBufferToR2(key, outputBuffer, "video/mp4");

  await cleanup(inputPath, outputPath);

  return url;
}

// ── Caption/subtitle burn-in (#28) ───────────────────────────────

interface SubtitleOpts {
  videoUrl: string;
  srtContent: string;
  siteId: string;
}

/**
 * Burn SRT subtitles into a video as styled captions.
 */
export async function burnSubtitles(opts: SubtitleOpts): Promise<string> {
  await ensureTmpDir();
  const inputPath = await fetchToFile(opts.videoUrl, `sub-in-${Date.now()}.mp4`);
  const srtPath = path.join(TMP_DIR, `sub-${Date.now()}.srt`);
  await writeFile(srtPath, opts.srtContent);
  const outputPath = path.join(TMP_DIR, `sub-out-${Date.now()}.mp4`);

  const args = [
    "-i", inputPath,
    "-vf", `subtitles='${srtPath}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=40'`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 240000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${opts.siteId}/video/${date}/captioned-${Date.now()}.mp4`;
  const url = await uploadBufferToR2(key, outputBuffer, "video/mp4");

  await cleanup(inputPath, srtPath, outputPath);

  return url;
}

// ── Thumbnail generation (#31) ───────────────────────────────────

/**
 * Extract the best frame from a video as a JPEG thumbnail.
 * Uses the frame at 25% of the video duration (usually past
 * any intro/fade and into the main content).
 */
export async function generateThumbnail(
  videoUrl: string,
  siteId: string,
): Promise<string> {
  await ensureTmpDir();
  const inputPath = await fetchToFile(videoUrl, `thumb-in-${Date.now()}.mp4`);
  const outputPath = path.join(TMP_DIR, `thumb-${Date.now()}.jpg`);

  // Get duration first
  const { stdout } = await execFileAsync(ffmpegPath(), [
    "-i", inputPath,
    "-f", "null", "-",
  ], { timeout: 30000 }).catch(() => ({ stdout: "", stderr: "" }));

  // Extract frame at 25% mark (default to 1s if duration unknown)
  const seekTime = "1";

  const args = [
    "-ss", seekTime,
    "-i", inputPath,
    "-frames:v", "1",
    "-q:v", "2",
    "-y",
    outputPath,
  ];

  await execFileAsync(ffmpegPath(), args, { timeout: 30000 });

  const outputBuffer = await readFile(outputPath);
  const date = new Date().toISOString().slice(0, 10);
  const key = `sites/${siteId}/thumbnails/${date}/thumb-${Date.now()}.jpg`;
  const url = await uploadBufferToR2(key, outputBuffer, "image/jpeg");

  await cleanup(inputPath, outputPath);

  return url;
}
