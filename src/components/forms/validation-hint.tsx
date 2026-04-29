"use client";

interface Props {
  message: string;
  tone?: "error" | "warning" | "info";
}

export function ValidationHint({ message, tone = "error" }: Props) {
  const toneStyles =
    tone === "error"
      ? { color: "#c53030", bg: "rgba(229, 62, 62, 0.07)" }
      : tone === "warning"
      ? { color: "#b45309", bg: "rgba(245, 158, 11, 0.08)" }
      : { color: "var(--color-muted)", bg: "rgba(0,0,0,0.03)" };

  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
        padding: "4px 8px",
        borderRadius: 6,
        background: toneStyles.bg,
        color: toneStyles.color,
        fontSize: 12,
        lineHeight: 1.3,
        fontWeight: 500,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M6 1L11 10H1L6 1Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M6 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
