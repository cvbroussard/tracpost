/**
 * Text overlay compositing using @napi-rs/canvas for text rendering
 * + sharp for image compositing. Replaces the SVG approach which
 * couldn't resolve fonts in serverless environments.
 */
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import { type TextOverlay, type OverlayPosition } from "./types";

function positionToGravity(pos: OverlayPosition): string {
  const map: Record<OverlayPosition, string> = {
    "top-left": "northwest",
    "top-right": "northeast",
    "bottom-left": "southwest",
    "bottom-right": "southeast",
    "center": "centre",
    "bottom-center": "south",
  };
  return map[pos] || "south";
}

/**
 * Render text to a PNG buffer using @napi-rs/canvas.
 * Produces a transparent PNG with a background pill + text.
 */
function renderTextToPng(
  text: string,
  canvasWidth: number,
  opts: {
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
  } = {},
): Buffer {
  const fontSize = opts.fontSize || 32;
  const fontWeight = opts.fontWeight === "bold" ? "bold " : "";
  const color = opts.color || "#ffffff";
  const bgColor = opts.backgroundColor || "rgba(0,0,0,0.5)";
  const padding = 16;
  const lineHeight = fontSize * 1.3;
  const maxTextWidth = canvasWidth - padding * 4;

  // Measure text to determine canvas height
  const measureCanvas = createCanvas(canvasWidth, 100);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = `${fontWeight}${fontSize}px sans-serif`;

  // Word wrap
  const words = text.slice(0, 80).split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    const metrics = measureCtx.measureText(test);
    if (metrics.width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const textHeight = lines.length * lineHeight;
  const canvasHeight = Math.ceil(textHeight + padding * 2 + 8);

  // Render
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background pill
  const pillX = padding;
  const pillY = 0;
  const pillW = canvasWidth - padding * 2;
  const pillH = canvasHeight;
  const radius = 8;
  ctx.beginPath();
  ctx.moveTo(pillX + radius, pillY);
  ctx.lineTo(pillX + pillW - radius, pillY);
  ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + radius);
  ctx.lineTo(pillX + pillW, pillY + pillH - radius);
  ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - radius, pillY + pillH);
  ctx.lineTo(pillX + radius, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - radius);
  ctx.lineTo(pillX, pillY + radius);
  ctx.quadraticCurveTo(pillX, pillY, pillX + radius, pillY);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Text
  ctx.font = `${fontWeight}${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding * 2, padding + i * lineHeight);
  }

  return Buffer.from(canvas.toBuffer("image/png"));
}

export async function applyTextOverlays(
  inputBuffer: Buffer,
  overlays: TextOverlay[],
): Promise<Buffer> {
  if (overlays.length === 0) return inputBuffer;

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || 1080;

  let pipeline = sharp(inputBuffer);

  for (const overlay of overlays) {
    const pngBuffer = renderTextToPng(overlay.text, width, {
      fontSize: overlay.fontSize,
      fontWeight: overlay.fontWeight,
      color: overlay.color,
      backgroundColor: overlay.backgroundColor,
    });

    pipeline = sharp(await pipeline.toBuffer()).composite([
      {
        input: pngBuffer,
        gravity: positionToGravity(overlay.position) as sharp.Gravity,
      },
    ]);
  }

  return pipeline.jpeg({ quality: 90 }).toBuffer();
}

export async function applyWatermark(
  inputBuffer: Buffer,
  logoBuffer: Buffer,
  position: OverlayPosition = "bottom-right",
): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  const imgWidth = metadata.width || 1080;
  const logoSize = Math.round(imgWidth * 0.08);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .toBuffer();

  return sharp(inputBuffer)
    .composite([
      {
        input: resizedLogo,
        gravity: positionToGravity(position) as sharp.Gravity,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
