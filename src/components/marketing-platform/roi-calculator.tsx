"use client";

import { useState } from "react";

const LINE_ITEMS = [
  { key: "writer", label: "Freelance writer / blogger", default: 800, min: 0, max: 5000, step: 100 },
  { key: "social", label: "Social media manager", default: 1500, min: 0, max: 8000, step: 100 },
  { key: "seo", label: "SEO agency / consultant", default: 1000, min: 0, max: 5000, step: 100 },
  { key: "tools", label: "Scheduling & analytics tools", default: 200, min: 0, max: 1000, step: 25 },
];

const TRACPOST_PRICE = { growth: 99, authority: 219 };

export function RoiCalculator() {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(LINE_ITEMS.map((l) => [l.key, l.default])),
  );

  const currentMonthly = Object.values(values).reduce((a, b) => a + b, 0);
  const savingsGrowth = Math.max(0, (currentMonthly - TRACPOST_PRICE.growth) * 12);
  const savingsAuthority = Math.max(0, (currentMonthly - TRACPOST_PRICE.authority) * 12);

  return (
    <div className="mp-roi">
      <div className="mp-roi-sliders">
        {LINE_ITEMS.map((item) => (
          <div key={item.key} className="mp-roi-row">
            <div className="mp-roi-row-header">
              <label className="mp-roi-label">{item.label}</label>
              <span className="mp-roi-value">${values[item.key].toLocaleString()}/mo</span>
            </div>
            <input
              type="range"
              min={item.min}
              max={item.max}
              step={item.step}
              value={values[item.key]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [item.key]: Number(e.target.value) }))
              }
              className="mp-roi-slider"
            />
          </div>
        ))}
      </div>

      <div className="mp-roi-result">
        <div className="mp-roi-current">
          <span className="mp-roi-current-label">Your current monthly spend</span>
          <span className="mp-roi-current-value">${currentMonthly.toLocaleString()}/mo</span>
        </div>

        <div className="mp-roi-compare">
          <div className="mp-roi-plan">
            <span className="mp-roi-plan-name">Growth plan</span>
            <span className="mp-roi-plan-price">${TRACPOST_PRICE.growth}/mo</span>
            <span className="mp-roi-plan-savings">
              {savingsGrowth > 0
                ? `Save $${savingsGrowth.toLocaleString()}/year`
                : "—"}
            </span>
          </div>
          <div className="mp-roi-plan mp-roi-plan-highlight">
            <span className="mp-roi-plan-name">Authority plan</span>
            <span className="mp-roi-plan-price">${TRACPOST_PRICE.authority}/mo</span>
            <span className="mp-roi-plan-savings">
              {savingsAuthority > 0
                ? `Save $${savingsAuthority.toLocaleString()}/year`
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: roiStyles }} />
    </div>
  );
}

const roiStyles = `
  .mp-roi {
    max-width: 720px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    align-items: start;
  }
  @media (max-width: 768px) {
    .mp-roi { grid-template-columns: 1fr; gap: 32px; }
  }

  .mp-roi-sliders { display: flex; flex-direction: column; gap: 24px; }
  .mp-roi-row-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .mp-roi-label { font-size: 14px; color: #374151; }
  .mp-roi-value { font-size: 14px; font-weight: 600; color: #1a1a1a; font-variant-numeric: tabular-nums; }
  .mp-roi-slider {
    width: 100%;
    height: 4px;
    appearance: none;
    background: #e5e7eb;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  .mp-roi-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #1a1a1a;
    cursor: pointer;
  }
  .mp-roi-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #1a1a1a;
    border: none;
    cursor: pointer;
  }

  .mp-roi-result {
    padding: 28px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fafafa;
  }
  .mp-roi-current {
    text-align: center;
    padding-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 20px;
  }
  .mp-roi-current-label { display: block; font-size: 12px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .mp-roi-current-value { display: block; font-size: 32px; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }

  .mp-roi-compare { display: flex; flex-direction: column; gap: 12px; }
  .mp-roi-plan {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
  }
  .mp-roi-plan-highlight {
    border-color: #1a1a1a;
    border-width: 2px;
  }
  .mp-roi-plan-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  .mp-roi-plan-price { font-size: 13px; color: #4b5563; font-variant-numeric: tabular-nums; }
  .mp-roi-plan-savings { font-size: 13px; font-weight: 600; color: #059669; }
`;
