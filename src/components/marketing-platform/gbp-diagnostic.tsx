"use client";

import { useState } from "react";

interface CategoryResult {
  name: string;
  reasoning: string;
  isPrimary: boolean;
}

export function GbpDiagnosticTool() {
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CategoryResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnostic() {
    if (!businessType.trim()) return;
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/tools/gbp-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: businessType.trim(),
          location: location.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.categories) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setResults(data.categories);
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mp-gbp-tool">
      <div className="mp-gbp-inputs">
        <div className="mp-gbp-field">
          <label>What does your business do?</label>
          <input
            type="text"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder="e.g. Kitchen remodeling, dog grooming, wedding photography"
            onKeyDown={(e) => e.key === "Enter" && runDiagnostic()}
          />
        </div>
        <div className="mp-gbp-field">
          <label>Location (optional)</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Pittsburgh, PA"
          />
        </div>
        <button
          onClick={runDiagnostic}
          disabled={running || !businessType.trim()}
          className="mp-btn-primary mp-btn-lg"
          style={{ width: "100%" }}
        >
          {running ? "Analyzing (~15s)..." : "Run diagnostic"}
        </button>
      </div>

      {error && <p className="mp-gbp-error">{error}</p>}

      {results && (
        <div className="mp-gbp-results">
          <h3 className="mp-gbp-results-title">Your recommended categories</h3>
          {results.map((cat, i) => (
            <div
              key={i}
              className={`mp-gbp-cat ${cat.isPrimary ? "mp-gbp-cat-primary" : ""}`}
            >
              <div className="mp-gbp-cat-header">
                <span className="mp-gbp-cat-badge">
                  {cat.isPrimary ? "Primary" : "Additional"}
                </span>
                <span className="mp-gbp-cat-name">{cat.name}</span>
              </div>
              <p className="mp-gbp-cat-reasoning">{cat.reasoning}</p>
            </div>
          ))}
          <p className="mp-gbp-cta-note">
            Want TracPost to optimize your content for these categories automatically?{" "}
            <a href="/pricing">Start a 14-day trial →</a>
          </p>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: toolStyles }} />
    </div>
  );
}

const toolStyles = `
  .mp-gbp-tool { margin-top: 8px; }
  .mp-gbp-inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .mp-gbp-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
  .mp-gbp-field input {
    width: 100%;
    padding: 12px 16px;
    font-size: 15px;
    color: #1a1a1a;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.15s;
  }
  .mp-gbp-field input:focus { border-color: #1a1a1a; }
  .mp-gbp-error { color: #dc2626; font-size: 14px; margin-top: 12px; }

  .mp-gbp-results { margin-top: 40px; }
  .mp-gbp-results-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 20px;
  }
  .mp-gbp-cat {
    padding: 16px 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .mp-gbp-cat-primary {
    border-color: #1a1a1a;
    border-width: 2px;
  }
  .mp-gbp-cat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .mp-gbp-cat-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 4px;
    background: #f3f4f6;
    color: #6b7280;
  }
  .mp-gbp-cat-primary .mp-gbp-cat-badge {
    background: #1a1a1a;
    color: #fff;
  }
  .mp-gbp-cat-name {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
  }
  .mp-gbp-cat-reasoning {
    font-size: 14px;
    color: #6b7280;
    line-height: 1.5;
    font-style: italic;
  }
  .mp-gbp-cta-note {
    margin-top: 24px;
    font-size: 14px;
    color: #6b7280;
  }
  .mp-gbp-cta-note a { color: #1a1a1a; font-weight: 500; text-decoration: none; }
  .mp-gbp-cta-note a:hover { text-decoration: underline; }
`;
