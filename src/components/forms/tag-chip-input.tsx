"use client";

import { useState, useRef, KeyboardEvent } from "react";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  ariaLabel?: string;
  maxItems?: number;
  freeForm?: boolean;
}

export function TagChipInput({
  values,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter",
  ariaLabel = "Tags",
  maxItems,
  freeForm = true,
}: Props) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      !values.includes(s) &&
      (draft === "" || s.toLowerCase().includes(draft.toLowerCase()))
  );

  function add(v: string) {
    const cleaned = v.trim();
    if (!cleaned) return;
    if (values.includes(cleaned)) return;
    if (maxItems && values.length >= maxItems) return;
    if (!freeForm && !suggestions.includes(cleaned)) return;
    onChange([...values, cleaned]);
    setDraft("");
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft) add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          minHeight: 44,
          border: `1px solid ${focused ? "#1a1a1a" : "#c5cbd3"}`,
          borderRadius: 8,
          background: focused ? "#fff" : "#f9fafb",
          cursor: "text",
          boxShadow: focused ? "0 0 0 3px rgba(26,26,26,0.06)" : "none",
          transition: "border-color 150ms, background 150ms, box-shadow 150ms",
        }}
        role="group"
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
            {v}
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
              aria-label={`Remove ${v}`}
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
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft && freeForm) add(draft);
          }}
          placeholder={values.length === 0 ? placeholder : ""}
          style={{
            flex: 1,
            minWidth: 100,
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

      {focused && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            maxHeight: 200,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {filteredSuggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                fontSize: 13,
                color: "#111",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
