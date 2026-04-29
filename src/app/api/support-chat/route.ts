/**
 * POST /api/support-chat
 *
 * Streams a Claude Haiku 4.5 response via Server-Sent Events.
 * The system prompt is composed from src/lib/support-chat/knowledge.ts
 * plus per-page context.
 *
 * Body: { messages: ChatMessage[], context?: string, subscriber?: { email, name } }
 * Response: text/event-stream — `data: {"delta":"..."}` lines, terminated by `data: [DONE]`
 */
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/support-chat/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 600;
const ANON_RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  messages?: ChatMessage[];
  context?: string | null;
  subscriber?: { email?: string; name?: string } | null;
}

const rateBuckets = new Map<string, { count: number; reset: number }>();

function rateKey(req: NextRequest, subscriberEmail?: string): string {
  if (subscriberEmail) return `sub:${subscriberEmail.toLowerCase()}`;
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || "unknown";
  return `anon:${ip}`;
}

function checkRate(key: string, isAuthed: boolean): boolean {
  if (isAuthed) return true;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= ANON_RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { messages, context, subscriber } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isAuthed = !!subscriber?.email;
  const key = rateKey(req, subscriber?.email);
  if (!checkRate(key, isAuthed)) {
    return new Response(
      JSON.stringify({ error: "Too many messages. Email support@tracpost.com." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const system = buildSystemPrompt(context, subscriber?.name || null);

  const cleanMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }))
    .filter((m) => m.content.trim().length > 0);

  if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "last message must be from user" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropic = new Anthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: cleanMessages,
          stream: true,
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const payload = JSON.stringify({ delta: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chat unavailable";
        const payload = JSON.stringify({ error: message });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
