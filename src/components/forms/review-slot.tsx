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

const STATUS_STYLES: Record<
  SlotStatus,
  { dot: string; pillBg: string; pillFg: string; pillLabel: string }
> = {
  incomplete: {
    dot: "#dc2626",
    pillBg: "rgba(220, 38, 38, 0.10)",
    pillFg: "#b91c1c",
    pillLabel: "Incomplete",
  },
  complete: {
    dot: "#16a34a",
    pillBg: "rgba(22, 163, 74, 0.12)",
    pillFg: "#15803d",
    pillLabel: "Complete",
  },
  in_progress: {
    dot: "#2563eb",
    pillBg: "rgba(37, 99, 235, 0.10)",
    pillFg: "#1d4ed8",
    pillLabel: "In progress",
  },
  optional: {
    dot: "#9ca3af",
    pillBg: "rgba(0, 0, 0, 0.05)",
    pillFg: "#6b7280",
    pillLabel: "Optional",
  },
};

export function ReviewSlot({ index, total, label, status, onClick, hint }: Props) {
  const slotNumber = `${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  const isInteractive = !!onClick;
  const s = STATUS_STYLES[status];

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
          e.currentTarget.style.borderColor = "rgba(0,0,0,0.25)";
          e.currentTarget.style.background = "rgba(0,0,0,0.02)";
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
          marginRight: 14,
          minWidth: 44,
        }}
      >
        {slotNumber}
      </span>

      <StatusIcon status={status} />

      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#111", marginLeft: 12 }}>
        {label}
        {hint && (
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--color-muted)",
              fontWeight: 400,
              marginTop: 2,
            }}
          >
            {hint}
          </span>
        )}
      </span>

      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 999,
          background: s.pillBg,
          color: s.pillFg,
          marginLeft: 12,
          marginRight: 8,
          flexShrink: 0,
          letterSpacing: 0.02,
        }}
      >
        {s.pillLabel}
      </span>

      {isInteractive && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{ color: "#9ca3af", flexShrink: 0 }}
        >
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

function StatusIcon({ status }: { status: SlotStatus }) {
  const s = STATUS_STYLES[status];
  const size = 18;

  if (status === "complete") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: s.dot,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="complete"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
          <path
            d="M2 5.5L4.5 8L9 3"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${s.dot}`,
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="in progress"
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      </span>
    );
  }

  if (status === "optional") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `1.5px dashed ${s.dot}`,
          background: "#fff",
          display: "inline-block",
          flexShrink: 0,
        }}
        aria-label="optional"
      />
    );
  }

  // incomplete
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${s.dot}`,
        background: "#fff",
        display: "inline-block",
        flexShrink: 0,
      }}
      aria-label="incomplete"
    />
  );
}
