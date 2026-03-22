"use client";

import { useState } from "react";

interface ReplyComposerProps {
  commentId: string;
  onSent: () => void;
  onCancel: () => void;
}

export function ReplyComposer({ commentId, onSent, onCancel }: ReplyComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setError("");

    try {
      const res = await fetch(`/api/inbox/comments/${commentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send reply");
        return;
      }

      onSent();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply..."
        rows={2}
        className="w-full resize-none rounded border border-border bg-background p-2 text-sm focus:border-accent focus:outline-none"
        autoFocus
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="rounded bg-accent px-3 py-1 text-xs text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send"}
        </button>
        <button
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
