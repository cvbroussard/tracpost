"use client";

import { ReactNode } from "react";

type Status = "incomplete" | "complete" | "in_progress" | "optional" | null;

interface Props {
  title?: string;
  status?: Status;
  children: ReactNode;
  footer?: ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
}

const STATUS_STYLES: Record<NonNullable<Status>, { label: string; bg: string; color: string }> = {
  incomplete: { label: "Incomplete", bg: "rgba(229, 62, 62, 0.10)", color: "#c53030" },
  complete: { label: "Complete", bg: "rgba(34, 197, 94, 0.12)", color: "#15803d" },
  in_progress: { label: "In progress", bg: "rgba(59, 130, 246, 0.12)", color: "#1d4ed8" },
  optional: { label: "Optional", bg: "rgba(0,0,0,0.05)", color: "var(--color-muted)" },
};

export function SectionCard({
  title,
  status,
  children,
  footer,
  onSave,
  onCancel,
  saveLabel = "Save",
  saveDisabled = false,
}: Props) {
  const showFooter = footer || onSave || onCancel;
  const statusStyle = status ? STATUS_STYLES[status] : null;

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "20px 22px",
        marginBottom: 20,
      }}
    >
      {(title || statusStyle) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {title && (
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: 0 }}>
              {title}
            </h3>
          )}
          {statusStyle && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 999,
                background: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {statusStyle.label}
            </span>
          )}
        </header>
      )}

      <div>{children}</div>

      {showFooter && (
        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {footer}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 500,
                color: "#374151",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: saveDisabled ? "rgba(59, 130, 246, 0.4)" : "var(--color-accent)",
                border: "none",
                borderRadius: 999,
                cursor: saveDisabled ? "not-allowed" : "pointer",
                transition: "background 150ms",
              }}
            >
              {saveLabel}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
