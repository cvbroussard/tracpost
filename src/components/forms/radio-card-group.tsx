"use client";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  layout?: "row" | "column";
  multiple?: boolean;
  values?: string[];
  onMultiChange?: (values: string[]) => void;
}

export function RadioCardGroup({
  options,
  value,
  onChange,
  layout = "row",
  multiple = false,
  values = [],
  onMultiChange,
}: Props) {
  function isSelected(opt: Option) {
    if (multiple) return values.includes(opt.value);
    return value === opt.value;
  }

  function toggle(opt: Option) {
    if (multiple && onMultiChange) {
      onMultiChange(
        values.includes(opt.value)
          ? values.filter((v) => v !== opt.value)
          : [...values, opt.value]
      );
      return;
    }
    onChange(opt.value);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: layout === "row" ? "row" : "column",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flex: layout === "row" ? "1 1 0" : undefined,
              minWidth: layout === "row" ? 120 : undefined,
              padding: "10px 14px",
              background: selected ? "rgba(59, 130, 246, 0.06)" : "#fff",
              border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 150ms, border-color 150ms",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: `1.5px solid ${selected ? "var(--color-accent)" : "#c5cbd3"}`,
                background: selected ? "var(--color-accent)" : "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 150ms",
              }}
            >
              {selected && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                  <path
                    d="M2 5.5L4.5 8L9 3"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111" }}>
                {opt.label}
              </span>
              {opt.hint && (
                <span style={{ display: "block", fontSize: 11, color: "var(--color-muted)", marginTop: 1 }}>
                  {opt.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
