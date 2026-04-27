"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface DropdownEntry {
  slug: string;
  index: number;
  headline: string;
  teaser: string;
  eyebrow?: string;
}

interface Props {
  entries: DropdownEntry[];
}

export function WhySocialDropdown({ entries }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function forceClose() {
    cancelClose();
    setOpen(false);
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") forceClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="mp-nav-dropdown-wrap"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={scheduleClose}
    >
      <button
        className="mp-nav-link mp-nav-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Why Social?
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        className="mp-nav-dropdown"
        role="menu"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transform: open ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-4px)",
        }}
      >
        <div className="mp-nav-dropdown-head">
          <span className="mp-nav-dropdown-eyebrow">A 5-part series</span>
          <h3 className="mp-nav-dropdown-title">Why Social Matters</h3>
          <p className="mp-nav-dropdown-blurb">
            Why your business lives or dies on social presence — and how to be everywhere at once.
          </p>
        </div>
        <ol className="mp-nav-dropdown-list">
          {entries.map((entry) => (
            <li key={entry.slug} role="menuitem">
              <Link
                href={`/blog/${entry.slug}`}
                className="mp-nav-dropdown-link"
                onClick={forceClose}
              >
                <span className="mp-nav-dropdown-num">Part {entry.index}</span>
                <span className="mp-nav-dropdown-text">
                  {entry.eyebrow && <span className="mp-nav-dropdown-tag">{entry.eyebrow}</span>}
                  <span className="mp-nav-dropdown-headline">{entry.headline}</span>
                  <span className="mp-nav-dropdown-teaser">{entry.teaser}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
