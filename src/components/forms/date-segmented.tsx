"use client";

import { useRef, ChangeEvent, KeyboardEvent } from "react";

interface Props {
  value: { month: string; day: string; year: string };
  onChange: (value: { month: string; day: string; year: string }) => void;
  error?: boolean;
}

export function DateSegmented({ value, onChange, error }: Props) {
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  function clamp(v: string, max: number, min = 0): string {
    if (v === "") return v;
    const n = parseInt(v, 10);
    if (isNaN(n)) return "";
    if (n > max) return String(max);
    if (n < min) return String(min);
    return v;
  }

  function handleMonth(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    onChange({ ...value, month: clamp(v, 12) });
    if (v.length === 2) dayRef.current?.focus();
  }

  function handleDay(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    onChange({ ...value, day: clamp(v, 31) });
    if (v.length === 2) yearRef.current?.focus();
  }

  function handleYear(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    onChange({ ...value, year: v });
  }

  function handleBackspace(e: KeyboardEvent<HTMLInputElement>, prev: HTMLInputElement | null) {
    if (e.key === "Backspace" && (e.target as HTMLInputElement).value === "" && prev) {
      prev.focus();
    }
  }

  const inputBase: React.CSSProperties = {
    padding: "10px 0",
    fontSize: 15,
    border: `1px solid ${error ? "#ef4444" : "#c5cbd3"}`,
    borderRadius: 8,
    background: error ? "#fef2f2" : "#f9fafb",
    color: "#1a1a1a",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    transition: "border-color 150ms, background 150ms",
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 80px" }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>
          Month
        </label>
        <input
          inputMode="numeric"
          maxLength={2}
          placeholder="MM"
          value={value.month}
          onChange={handleMonth}
          style={{ ...inputBase, width: "100%" }}
          aria-label="Month"
        />
      </div>
      <div style={{ flex: "0 0 70px" }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>
          Day
        </label>
        <input
          ref={dayRef}
          inputMode="numeric"
          maxLength={2}
          placeholder="DD"
          value={value.day}
          onChange={handleDay}
          onKeyDown={(e) =>
            handleBackspace(
              e,
              (e.currentTarget.parentElement?.previousElementSibling?.querySelector("input") as HTMLInputElement) || null
            )
          }
          style={{ ...inputBase, width: "100%" }}
          aria-label="Day"
        />
      </div>
      <div style={{ flex: "0 0 110px" }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>
          Year
        </label>
        <input
          ref={yearRef}
          inputMode="numeric"
          maxLength={4}
          placeholder="YYYY"
          value={value.year}
          onChange={handleYear}
          onKeyDown={(e) =>
            handleBackspace(
              e,
              (e.currentTarget.parentElement?.previousElementSibling?.querySelector("input") as HTMLInputElement) || null
            )
          }
          style={{ ...inputBase, width: "100%" }}
          aria-label="Year"
        />
      </div>
    </div>
  );
}
