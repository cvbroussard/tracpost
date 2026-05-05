"use client";

import { useState } from "react";

/**
 * Displays account names. If the name looks like a token/ID (20+ chars,
 * no spaces), shows a masked version with click-to-reveal.
 */
export function AccountName({ name }: { name: string }) {
  const [revealed, setRevealed] = useState(false);
  const isToken = name.length > 20 && !name.includes(" ");

  if (!isToken) {
    return <p className="font-medium">{name}</p>;
  }

  const masked = `${name.slice(0, 6)}${"•".repeat(12)}${name.slice(-4)}`;

  return (
    <button
      onClick={() => setRevealed(!revealed)}
      className="flex items-center gap-2 font-medium"
      title={revealed ? "Click to hide" : "Click to reveal"}
    >
      <span className="font-mono text-sm">{revealed ? name : masked}</span>
      <span className="text-xs text-muted">{revealed ? "▴" : "▾"}</span>
    </button>
  );
}
