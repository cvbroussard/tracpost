"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface Props {
  context?: string;
  subscriberName?: string;
  subscriberEmail?: string;
  greeting?: string;
  emailSupportTo?: string;
  position?: "bottom-right" | "bottom-left";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_GREETING = "Hey — I'm the TracPost assistant. What can I help you with?";

export function SupportChat({
  context,
  subscriberName,
  subscriberEmail,
  greeting,
  emailSupportTo = "support@tracpost.com",
  position = "bottom-right",
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const computedGreeting =
    greeting ||
    (subscriberName ? `Hey ${subscriberName.split(" ")[0]} — what can I help you with?` : DEFAULT_GREETING);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          context: context || null,
          subscriber: subscriberEmail ? { email: subscriberEmail, name: subscriberName } : null,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat unavailable (${res.status})`);
      }

      setMessages([...next, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              assistantText += parsed.delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            /* ignore malformed lines */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages(next);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  const wrapPos: React.CSSProperties =
    position === "bottom-right"
      ? { right: 20, bottom: 20 }
      : { left: 20, bottom: 20 };

  return (
    <div style={{ position: "fixed", zIndex: 60, ...wrapPos }}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 999,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            cursor: "pointer",
            color: "#111",
            fontSize: 13,
            fontWeight: 500,
            transition: "transform 150ms, box-shadow 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 1.5C4.41 1.5 1.5 3.91 1.5 7c0 1.39.6 2.66 1.6 3.66L2 14.5l3.84-1.1c.66.21 1.4.32 2.16.32 3.59 0 6.5-2.41 6.5-5.5S11.59 1.5 8 1.5Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span>Need help?</span>
        </button>
      )}

      {open && (
        <div
          style={{
            width: 360,
            height: 500,
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 16,
            boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: "1px solid var(--color-border)",
              background: "#fff",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--color-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
              }}
              aria-hidden
            >
              tp
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>TracPost assistant</div>
              <div style={{ fontSize: 11, color: "var(--color-muted)" }}>AI-powered · usually instant</div>
            </div>
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setOpen(false);
              }}
              aria-label="Close chat"
              style={{
                width: 28,
                height: 28,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 14px",
              background: "#fafafa",
            }}
          >
            {messages.length === 0 && (
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.5 }}>
                {computedGreeting}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "9px 12px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    borderRadius: 12,
                    background: m.role === "user" ? "var(--color-accent)" : "#fff",
                    color: m.role === "user" ? "#fff" : "#111",
                    border: m.role === "assistant" ? "1px solid var(--color-border)" : "none",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.content}
                  {streaming && i === messages.length - 1 && m.role === "assistant" && !m.content && (
                    <span style={{ opacity: 0.5 }}>…</span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div
                style={{
                  margin: "8px 0",
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#c53030",
                  background: "rgba(229, 62, 62, 0.08)",
                  borderRadius: 8,
                }}
              >
                {error}.{" "}
                <a
                  href={`mailto:${emailSupportTo}?subject=${encodeURIComponent("TracPost support — chat unavailable")}`}
                  style={{ color: "#c53030", textDecoration: "underline" }}
                >
                  Email support instead
                </a>
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              padding: "10px 12px",
              background: "#fff",
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                outline: "none",
                fontSize: 14,
                fontFamily: "inherit",
                color: "#111",
                background: "transparent",
                padding: "6px 4px",
                maxHeight: 120,
                lineHeight: 1.4,
              }}
            />
            <button
              type="button"
              onClick={() => send(draft)}
              disabled={!draft.trim() || streaming}
              aria-label="Send"
              style={{
                width: 32,
                height: 32,
                background: draft.trim() && !streaming ? "var(--color-accent)" : "rgba(0,0,0,0.08)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: draft.trim() && !streaming ? "pointer" : "not-allowed",
                transition: "background 150ms",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7L12 2L7 12L6 8L2 7Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div
            style={{
              padding: "6px 14px 10px",
              fontSize: 11,
              color: "var(--color-muted)",
              background: "#fff",
              textAlign: "center",
              borderTop: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            Need a human?{" "}
            <a
              href={`mailto:${emailSupportTo}`}
              style={{ color: "var(--color-accent)", textDecoration: "none" }}
            >
              Email support
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
