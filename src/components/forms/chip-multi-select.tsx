"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxItems?: number;
  emptyHint?: string;
}

/**
 * Constrained multi-select with chips + flush-attached checkbox dropdown.
 *
 * - Click into the field to open. The dropdown extends below the input,
 *   borderless gap, no floating shadow — visually one continuous control.
 * - All options render as checkbox rows; selected items appear both as
 *   chips above and as checked rows below.
 * - Optional typing filters the option list.
 *
 * Use this for constrained vocabularies (countries, platforms, predefined
 * categories). For freeform tags users can invent, use TagChipInput.
 */
export function ChipMultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select…",
  ariaLabel = "Multi-select",
  maxItems,
  emptyHint = "No matches",
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft("");
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = draft
    ? options.filter((o) => o.label.toLowerCase().includes(draft.toLowerCase()))
    : options;

  function toggle(v: string) {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else {
      if (maxItems && values.length >= maxItems) return;
      onChange([...values, v]);
    }
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && draft === "" && values.length > 0) {
      remove(values[values.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setDraft("");
    }
  }

  const selectedSet = new Set(values);
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label || v;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          minHeight: 44,
          border: `1px solid ${open ? "#1a1a1a" : "#c5cbd3"}`,
          borderRadius: open ? "8px 8px 0 0" : 8,
          borderBottomColor: open ? "rgba(0,0,0,0.08)" : "#c5cbd3",
          background: open ? "#fff" : "#f9fafb",
          cursor: "text",
          boxShadow: open ? "0 0 0 3px rgba(26,26,26,0.06)" : "none",
          transition: "border-radius 0ms, border-color 150ms, background 150ms, box-shadow 150ms",
        }}
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 4px 3px 10px",
              fontSize: 13,
              fontWeight: 500,
              color: "#1d4ed8",
              background: "rgba(59, 130, 246, 0.10)",
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            {labelFor(v)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                marginLeft: 2,
                padding: 0,
                background: "transparent",
                border: "none",
                color: "#1d4ed8",
                opacity: 0.7,
                cursor: "pointer",
                borderRadius: 4,
              }}
              aria-label={`Remove ${labelFor(v)}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setOpen(true)}
          placeholder={values.length === 0 ? placeholder : ""}
          style={{
            flex: 1,
            minWidth: 80,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 15,
            color: "#1a1a1a",
            padding: "4px 0",
            fontFamily: "inherit",
          }}
        />
      </div>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #1a1a1a",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            borderRadius: "0 0 8px 8px",
            boxShadow: "0 0 0 3px rgba(26,26,26,0.06)",
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--color-muted)" }}>
              {emptyHint}
            </div>
          ) : (
            filtered.map((opt) => {
              const checked = selectedSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(opt.value);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 14px",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "#111",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `1.5px solid ${checked ? "var(--color-accent)" : "#c5cbd3"}`,
                      background: checked ? "var(--color-accent)" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 120ms",
                    }}
                  >
                    {checked && (
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
                  <span>{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
