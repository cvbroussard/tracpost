"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

interface AlertEvent {
  id: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

const CATEGORIES = [
  { key: "provisioning", label: "Provisioning", color: "#3b82f6" },
  { key: "content", label: "Content", color: "#22c55e" },
  { key: "connections", label: "Connections", color: "#f59e0b" },
  { key: "billing", label: "Billing", color: "#8b5cf6" },
  { key: "performance", label: "Performance", color: "#ef4444" },
];

const TIME_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

const SEVERITY_RADIUS: Record<string, number> = {
  danger: 6,
  warning: 5,
  info: 4,
};

export function AlertRibbon() {
  const [timeFilter, setTimeFilter] = useState("7d");
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [cursorPct, setCursorPct] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipLocked, setTooltipLocked] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; offset: number } | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setPanOffset(0);
    fetch(`/api/manage/alerts?range=${timeFilter}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(data => setEvents(data.events || []))
      .finally(() => setLoading(false));
  }, [timeFilter]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (timeFilter) {
      case "yesterday": {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);
        start = y;
        break;
      }
      case "7d":
        start = new Date(now.getTime() - 7 * 86400000);
        break;
      case "30d":
        start = new Date(now.getTime() - 30 * 86400000);
        break;
      default: {
        const t = new Date(now);
        t.setHours(0, 0, 0, 0);
        start = t;
      }
    }
    return {
      rangeStart: start.getTime() - panOffset,
      rangeEnd: now.getTime() - panOffset,
    };
  }, [timeFilter, panOffset]);

  function xPercent(timestamp: string): number {
    const t = new Date(timestamp).getTime();
    const range = rangeEnd - rangeStart;
    if (range <= 0) return 50;
    const pct = ((t - rangeStart) / range) * 100;
    return Math.max(2, Math.min(98, pct));
  }

  const categoryY: Record<string, number> = {};
  CATEGORIES.forEach((cat, i) => {
    categoryY[cat.key] = 28 + i * 28;
  });

  const totalHeight = 28 + CATEGORIES.length * 28 + 20;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.category] = (c[e.category] || 0) + 1;
    return c;
  }, [events]);

  // Time ticks for x-axis markers
  const timeTicks = useMemo(() => {
    const ticks: Array<{ pct: number; label: string }> = [];
    const range = rangeEnd - rangeStart;
    if (range <= 0) return ticks;

    if (timeFilter === "today" || timeFilter === "yesterday") {
      // Every 3 hours
      const base = new Date(rangeStart);
      base.setMinutes(0, 0, 0);
      const hour = base.getHours();
      const nextTick = new Date(base);
      nextTick.setHours(hour - (hour % 3) + 3);
      while (nextTick.getTime() < rangeEnd) {
        const pct = ((nextTick.getTime() - rangeStart) / range) * 100;
        if (pct > 2 && pct < 98) {
          const h = nextTick.getHours();
          const label = h === 0 ? "12am" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
          ticks.push({ pct, label });
        }
        nextTick.setHours(nextTick.getHours() + 3);
      }
    } else if (timeFilter === "7d") {
      // Daily
      const base = new Date(rangeStart);
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + 1);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      while (base.getTime() < rangeEnd) {
        const pct = ((base.getTime() - rangeStart) / range) * 100;
        if (pct > 2 && pct < 98) {
          ticks.push({ pct, label: days[base.getDay()] });
        }
        base.setDate(base.getDate() + 1);
      }
    } else {
      // Weekly
      const base = new Date(rangeStart);
      base.setHours(0, 0, 0, 0);
      const dayOfWeek = base.getDay();
      base.setDate(base.getDate() + (7 - dayOfWeek));
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      while (base.getTime() < rangeEnd) {
        const pct = ((base.getTime() - rangeStart) / range) * 100;
        if (pct > 2 && pct < 98) {
          ticks.push({ pct, label: `${months[base.getMonth()]} ${base.getDate()}` });
        }
        base.setDate(base.getDate() + 7);
      }
    }
    return ticks;
  }, [timeFilter, rangeStart, rangeEnd]);

  return (
    <div className="ribbon-wrap">
      <div className="ribbon-controls">
        <div className="ribbon-left">
          <span className="ribbon-title">Mission Control</span>
          {!loading && events.length > 0 && (
            <span className="ribbon-count">{events.length} alert{events.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="ribbon-filters">
          {TIME_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTimeFilter(f.value)}
              className={`ribbon-filter ${timeFilter === f.value ? "ribbon-filter-active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={graphRef}
        className={`ribbon-graph ${isDragging ? "ribbon-dragging" : ""}`}
        onMouseDown={(e) => {
          setIsDragging(true);
          dragStartRef.current = { x: e.clientX, offset: panOffset };
          setCursorX(null);
          setCursorPct(null);
        }}
        onMouseMove={(e) => {
          if (isDragging && dragStartRef.current) {
            const dx = dragStartRef.current.x - e.clientX;
            const rect = e.currentTarget.getBoundingClientRect();
            const range = rangeEnd - rangeStart;
            const pxToMs = range / rect.width;
            setPanOffset(dragStartRef.current.offset + dx * pxToMs);
          } else if (!tooltipLocked) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = (x / rect.width) * 100;
            setCursorX(x);
            setCursorPct(pct);
            setTooltipPos({ x: e.clientX, y: rect.bottom });
          }
        }}
        onMouseUp={() => {
          setIsDragging(false);
          dragStartRef.current = null;
        }}
        onMouseLeave={() => {
          setIsDragging(false);
          dragStartRef.current = null;
          if (!tooltipLocked) {
            tooltipTimeoutRef.current = setTimeout(() => {
              setCursorX(null);
              setCursorPct(null);
            }, 300);
          }
        }}
      >
        {loading ? (
          <div style={{ height: totalHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : (
          <svg width="100%" height={totalHeight} className="ribbon-svg">
            {/* Time tick marks */}
            {timeTicks.map(tick => (
              <g key={tick.pct}>
                <line
                  x1={`${tick.pct}%`} x2={`${tick.pct}%`}
                  y1={12} y2={totalHeight - 4}
                  stroke="currentColor"
                  strokeOpacity={0.06}
                  strokeWidth={1}
                />
                <text
                  x={`${tick.pct}%`}
                  y={totalHeight}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize={8}
                  opacity={0.3}
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {CATEGORIES.map(cat => (
              <g key={cat.key}>
                <line
                  x1="80" x2="100%"
                  y1={categoryY[cat.key]} y2={categoryY[cat.key]}
                  stroke={cat.color}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <text
                  x={4}
                  y={categoryY[cat.key] + 4}
                  fill={cat.color}
                  fontSize={11}
                  fontWeight={500}
                  opacity={counts[cat.key] ? 1 : 0.4}
                >
                  {cat.label}
                  {counts[cat.key] ? ` (${counts[cat.key]})` : ""}
                </text>
              </g>
            ))}

            {events.map(evt => {
              const y = categoryY[evt.category];
              if (!y) return null;
              const x = xPercent(evt.timestamp);
              const dotColor = CATEGORIES.find(c => c.key === evt.category)?.color || "#94a3b8";
              const r = SEVERITY_RADIUS[evt.severity] || 4;

              return (
                <g key={evt.id}>
                  {evt.severity === "danger" && (
                    <circle cx={`${x}%`} cy={y} r={r + 4} fill={dotColor} opacity={0.15} />
                  )}
                  <circle
                    cx={`${x}%`}
                    cy={y}
                    r={r}
                    fill={dotColor}
                    opacity={0.85}
                    className="ribbon-dot"
                  />
                </g>
              );
            })}

            {/* Cursor line */}
            {cursorX !== null && (
              <line
                x1={cursorX} x2={cursorX}
                y1={8} y2={totalHeight - 8}
                stroke="currentColor"
                strokeOpacity={0.25}
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
            )}

            {events.length === 0 && (
              <text x="50%" y={totalHeight / 2} textAnchor="middle" fill="#6b7280" fontSize={12} opacity={0.5}>
                No alerts for this period
              </text>
            )}
          </svg>
        )}
      </div>

      {/* Tooltip — shows events near the cursor */}
      {cursorPct !== null && (() => {
        const snapRange = timeFilter === "30d" ? 2 : timeFilter === "7d" ? 2.5 : 3;
        const nearby = events.filter(evt => {
          const x = xPercent(evt.timestamp);
          return Math.abs(x - cursorPct) < snapRange;
        });
        if (nearby.length === 0) return null;

        const cursorTime = new Date(rangeStart + (cursorPct / 100) * (rangeEnd - rangeStart));
        const timeLabel = cursorTime.toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });

        return (
          <div
            className="ribbon-tooltip"
            style={{ left: tooltipPos.x, top: tooltipPos.y + 8, transform: "translateX(-50%)" }}
            onMouseEnter={() => {
              if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
              setTooltipLocked(true);
            }}
            onMouseLeave={() => {
              setTooltipLocked(false);
              setCursorX(null);
              setCursorPct(null);
            }}
          >
            <p className="ribbon-tooltip-time">{timeLabel}</p>
            <div className="ribbon-tooltip-events">
              {nearby.slice(0, 5).map(evt => {
                const dotColor = CATEGORIES.find(c => c.key === evt.category)?.color || "#94a3b8";
                return (
                  <a
                    key={evt.id}
                    href={evt.href}
                    className="ribbon-tooltip-event"
                    onClick={() => {
                      setTooltipLocked(false);
                      setCursorX(null);
                      setCursorPct(null);
                    }}
                  >
                    <span className="ribbon-tooltip-dot" style={{ background: dotColor }} />
                    <div>
                      <p className="ribbon-tooltip-title">{evt.title}</p>
                      <p className="ribbon-tooltip-detail">{evt.detail}</p>
                    </div>
                  </a>
                );
              })}
              {nearby.length > 5 && (
                <p className="ribbon-tooltip-detail">+{nearby.length - 5} more</p>
              )}
            </div>
          </div>
        );
      })()}

      <style dangerouslySetInnerHTML={{ __html: ribbonStyles }} />
    </div>
  );
}

const ribbonStyles = `
  .ribbon-wrap {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .ribbon-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 0;
  }
  .ribbon-left { display: flex; align-items: center; gap: 8px; }
  .ribbon-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted);
  }
  .ribbon-count {
    font-size: 10px;
    color: var(--color-muted);
    background: var(--color-surface-hover);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .ribbon-filters { display: flex; gap: 2px; }
  .ribbon-filter {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition: color 0.15s;
  }
  .ribbon-filter:hover { color: var(--color-foreground); }
  .ribbon-filter-active {
    background: var(--color-surface-hover);
    color: var(--color-foreground);
    font-weight: 500;
  }

  .ribbon-graph {
    padding: 4px 16px 8px;
    position: relative;
    cursor: grab;
    user-select: none;
  }
  .ribbon-dragging {
    cursor: grabbing;
  }
  .ribbon-svg { display: block; }

  .ribbon-dot {
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .ribbon-dot:hover { opacity: 1 !important; }

  .ribbon-tooltip {
    position: fixed;
    z-index: 100;
    background: #1a1a1a;
    color: #fff;
    border-radius: 8px;
    padding: 10px 14px;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .ribbon-tooltip-time {
    font-size: 10px;
    color: #6b7280;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #333;
  }
  .ribbon-tooltip-events {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ribbon-tooltip-event {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    text-decoration: none;
    color: inherit;
    padding: 4px 6px;
    margin: -4px -6px;
    border-radius: 6px;
    transition: background 0.15s;
  }
  .ribbon-tooltip-event:hover {
    background: rgba(255,255,255,0.08);
  }
  .ribbon-tooltip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 3px;
  }
  .ribbon-tooltip-title {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
  }
  .ribbon-tooltip-detail {
    font-size: 10px;
    color: #94a3b8;
    line-height: 1.3;
  }
`;
