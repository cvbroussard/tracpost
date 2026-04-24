"use client";

import { useState, useCallback } from "react";

interface Props {
  productId: string;
  productName: string;
  skipTrial: boolean;
}

export function SignupForm({ productId, productName, skipTrial }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }

  function isValidName(v: string): boolean {
    return v.trim().length >= 2 && /[a-zA-Z]/.test(v);
  }

  function isValidPhone(v: string): boolean {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }

  const saveLead = useCallback(async (fields: Record<string, unknown>) => {
    const e = ((fields.email as string) || email).trim();
    if (!isValidEmail(e)) return;

    const n = (fields.name as string) || name || null;
    if (n && !isValidName(n)) return;

    const p = (fields.phone as string) || phone || null;
    if (p && !isValidPhone(p)) return;

    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: e,
          name: n?.trim() || null,
          phone: p?.trim() || null,
          product_id: productId,
          is_trial: !skipTrial,
          source: "signup",
        }),
      });
    } catch { /* silent */ }
  }, [email, name, phone, productId, skipTrial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    // Update lead status
    await saveLead({ email, name, phone });

    // Create checkout session
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          skip_trial: skipTrial,
          customer_email: email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="su-form">
      <div className={`su-field ${errors.email ? "su-field-error" : ""}`}>
        <label htmlFor="su-email">Work email</label>
        <input
          id="su-email"
          type="email"
          required
          value={email}
          onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: "" })); }}
          onBlur={() => {
            if (!email) return;
            if (!isValidEmail(email)) { setErrors(prev => ({ ...prev, email: "Enter a valid email address" })); return; }
            setErrors(prev => ({ ...prev, email: "" }));
            saveLead({ email });
          }}
          placeholder="you@yourbusiness.com"
          autoComplete="email"
        />
        {errors.email && <span className="su-error">{errors.email}</span>}
      </div>

      <div className={`su-field ${errors.name ? "su-field-error" : ""}`}>
        <label htmlFor="su-name">Full name</label>
        <input
          id="su-name"
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: "" })); }}
          onBlur={() => {
            if (!name) return;
            if (!isValidName(name)) { setErrors(prev => ({ ...prev, name: "Enter your full name" })); return; }
            setErrors(prev => ({ ...prev, name: "" }));
            if (email) saveLead({ email, name });
          }}
          placeholder="John Smith"
          autoComplete="name"
        />
        {errors.name && <span className="su-error">{errors.name}</span>}
      </div>

      <div className={`su-field ${errors.phone ? "su-field-error" : ""}`}>
        <label htmlFor="su-phone">Phone <span className="su-optional">(optional)</span></label>
        <input
          id="su-phone"
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: "" })); }}
          onBlur={() => {
            if (!phone) return;
            if (!isValidPhone(phone)) { setErrors(prev => ({ ...prev, phone: "Enter a valid phone number" })); return; }
            setErrors(prev => ({ ...prev, phone: "" }));
            if (email) saveLead({ email, phone });
          }}
          placeholder="(412) 555-0123"
          autoComplete="tel"
        />
        {errors.phone && <span className="su-error">{errors.phone}</span>}
      </div>

      <button type="submit" disabled={loading || !email} className="su-submit">
        {loading ? "Redirecting to checkout..." : skipTrial ? `Subscribe to ${productName}` : "Continue to payment"}
      </button>

      <style dangerouslySetInnerHTML={{ __html: formStyles }} />
    </form>
  );
}

const formStyles = `
  .su-form { display: flex; flex-direction: column; gap: 20px; }

  .su-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
  .su-optional { font-weight: 400; color: #4b5563; }

  .su-field input,
  .su-field input[type="email"],
  .su-field input[type="text"],
  .su-field input[type="tel"] {
    width: 100%;
    padding: 12px 14px;
    font-size: 15px;
    border: 1px solid #c5cbd3 !important;
    border-radius: 8px;
    background: #f9fafb !important;
    color: #1a1a1a !important;
    transition: border-color 0.15s, background 0.15s;
    -webkit-text-fill-color: #1a1a1a;
  }
  .su-field input:focus {
    outline: none;
    border-color: #1a1a1a !important;
    background: #fff !important;
    color: #1a1a1a !important;
    -webkit-text-fill-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(26,26,26,0.06);
  }
  .su-field input::placeholder {
    color: #b0b8c4 !important;
    -webkit-text-fill-color: #b0b8c4;
  }
  .su-field input:-webkit-autofill,
  .su-field input:-webkit-autofill:focus {
    -webkit-text-fill-color: #1a1a1a !important;
    -webkit-box-shadow: 0 0 0 1000px #f9fafb inset !important;
    border: 1px solid #c5cbd3 !important;
  }

  .su-field-error input {
    border-color: #ef4444 !important;
    background: #fef2f2 !important;
  }
  .su-field-error input:focus {
    border-color: #ef4444 !important;
    box-shadow: 0 0 0 3px rgba(239,68,68,0.08);
  }
  .su-error {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #ef4444;
  }

  .su-submit {
    width: 100%;
    padding: 14px;
    font-size: 15px;
    font-weight: 600;
    background: #1a1a1a;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 4px;
  }
  .su-submit:hover { background: #333; }
  .su-submit:disabled { opacity: 0.5; cursor: not-allowed; }
`;
