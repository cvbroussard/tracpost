"use client";

type SlotStatus = "incomplete" | "complete" | "in_progress" | "optional";

interface Props {
  index: number;
  total: number;
  label: string;
  status: SlotStatus;
  onClick?: () => void;
  hint?: string;
}

const STATUS_DOT: Record<SlotStatus, string> = {
  incomplete: "#dc2626",
  complete: "#16a34a",
  in_progress: "#2563eb",
  optional: "#9ca3af",
};

export function ReviewSlot({ index, total, label, status, onClick, hint }: Props) {
  const slotNumber = `${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  const isInteractive = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "14px 18px",
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        marginBottom: 10,
        cursor: isInteractive ? "pointer" : "default",
        textAlign: "left",
        transition: "border-color 150ms, background 150ms",
      }}
      onMouseEnter={(e) => {
        if (isInteractive) {
          e.currentTarget.style.borderColor = "rgba(0,0,0,0.18)";
          e.currentTarget.style.background = "rgba(0,0,0,0.015)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.background = "#fff";
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#9ca3af",
          fontVariantNumeric: "tabular-nums",
          marginRight: 16,
          minWidth: 44,
        }}
      >
        {slotNumber}
      </span>

      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: STATUS_DOT[status],
          marginRight: 12,
          flexShrink: 0,
        }}
        aria-label={status}
      />

      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#111" }}>
        {label}
        {hint && (
          <span style={{ display: "block", fontSize: 12, color: "var(--color-muted)", fontWeight: 400, marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>

      {isInteractive && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ color: "#c53030" }}>
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
