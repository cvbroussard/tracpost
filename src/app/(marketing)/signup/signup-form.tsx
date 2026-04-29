"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  PhoneE164Field,
  ValidationHint,
  SupportChat,
  ThinProgressBar,
} from "@/components/forms";

interface Props {
  productId: string;
  productName: string;
  skipTrial: boolean;
}

type Phase = "contact" | "payment" | "redirecting";
type IntentType = "setup" | "payment";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
let stripePromiseSingleton: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromiseSingleton && PUBLISHABLE_KEY) {
    stripePromiseSingleton = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromiseSingleton;
}

export function SignupForm({ productId, productName, skipTrial }: Props) {
  const [phase, setPhase] = useState<Phase>("contact");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<IntentType>("setup");
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);

  const progressPercent =
    phase === "contact" ? 33 : phase === "payment" ? 70 : 100;

  function isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }
  function isValidName(v: string): boolean {
    return v.trim().length >= 2 && /[a-zA-Z]/.test(v);
  }
  function isValidPhone(v: string): boolean {
    if (!v) return true;
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }

  const saveLead = useCallback(
    async (fields: { email?: string; name?: string; phone?: string }) => {
      const e = (fields.email || email).trim();
      if (!isValidEmail(e)) return;
      try {
        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: e,
            name: (fields.name ?? name)?.trim() || null,
            phone: (fields.phone ?? phone)?.trim() || null,
            product_id: productId,
            is_trial: !skipTrial,
            source: "signup",
          }),
        });
      } catch {
        /* silent */
      }
    },
    [email, name, phone, productId, skipTrial]
  );

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!isValidEmail(email)) newErrors.email = "Enter a valid email address";
    if (!isValidName(name)) newErrors.name = "Enter your full name";
    if (phone && !isValidPhone(phone)) newErrors.phone = "Enter a valid phone number";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          email,
          name,
          phone: phone || undefined,
          skip_trial: skipTrial,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || "Could not initialize checkout");
        setSubmitting(false);
        return;
      }
      setClientSecret(data.client_secret);
      setIntentType(data.intent_type);
      setOnboardingToken(data.onboarding_token);
      setPhase("payment");
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const elementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: {
              theme: "stripe" as const,
              variables: {
                colorPrimary: "#1a1a1a",
                colorBackground: "#f9fafb",
                colorText: "#1a1a1a",
                colorDanger: "#ef4444",
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                borderRadius: "8px",
                spacingUnit: "4px",
              },
            },
          }
        : undefined,
    [clientSecret]
  );

  return (
    <>
      <ThinProgressBar percent={progressPercent} />

      {phase === "contact" && (
        <form onSubmit={handleContactSubmit} className="su-form" noValidate>
          <div className={`su-field ${errors.email ? "su-field-error" : ""}`}>
            <label htmlFor="su-email">Work email</label>
            <input
              id="su-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((prev) => ({ ...prev, email: "" }));
              }}
              onBlur={() => {
                if (email && !isValidEmail(email)) {
                  setErrors((prev) => ({ ...prev, email: "Enter a valid email address" }));
                  return;
                }
                if (email) saveLead({ email });
              }}
              placeholder="you@yourbusiness.com"
              autoComplete="email"
            />
            {errors.email && <ValidationHint message={errors.email} />}
          </div>

          <div className={`su-field ${errors.name ? "su-field-error" : ""}`}>
            <label htmlFor="su-name">Full name</label>
            <input
              id="su-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: "" }));
              }}
              onBlur={() => {
                if (name && !isValidName(name)) {
                  setErrors((prev) => ({ ...prev, name: "Enter your full name" }));
                  return;
                }
                if (email && name) saveLead({ email, name });
              }}
              placeholder="John Smith"
              autoComplete="name"
            />
            {errors.name && <ValidationHint message={errors.name} />}
          </div>

          <div className="su-field">
            <label>
              Phone <span className="su-optional">(optional)</span>
            </label>
            <PhoneE164Field
              value={phone}
              onChange={(v) => {
                setPhone(v);
                setErrors((prev) => ({ ...prev, phone: "" }));
              }}
              error={!!errors.phone}
            />
            {errors.phone && <ValidationHint message={errors.phone} />}
          </div>

          {serverError && <ValidationHint message={serverError} />}

          <button type="submit" disabled={submitting} className="su-submit">
            {submitting ? "Preparing checkout…" : "Continue to payment"}
          </button>

          <style dangerouslySetInnerHTML={{ __html: formStyles }} />
        </form>
      )}

      {phase === "payment" && clientSecret && (
        <div className="su-form">
          <div className="su-payment-header">
            <button
              type="button"
              onClick={() => setPhase("contact")}
              className="su-back-link"
            >
              ← Back
            </button>
            <p className="su-payment-note">
              {intentType === "setup"
                ? `${productName} — your card will be saved but not charged during the trial.`
                : `${productName} — billed today, then monthly. Cancel anytime.`}
            </p>
          </div>
          <Elements stripe={getStripe()} options={elementsOptions}>
            <PaymentInner
              intentType={intentType}
              onboardingToken={onboardingToken!}
              email={email}
              name={name}
              onPhaseChange={setPhase}
            />
          </Elements>
          <style dangerouslySetInnerHTML={{ __html: formStyles }} />
        </div>
      )}

      {phase === "redirecting" && (
        <div className="su-redirecting">
          <div className="su-spinner" />
          <p>Setting up your account…</p>
          <style dangerouslySetInnerHTML={{ __html: formStyles }} />
        </div>
      )}

      <SupportChat
        context="signup"
        subscriberName={name || undefined}
        subscriberEmail={email || undefined}
      />
    </>
  );
}

function PaymentInner({
  intentType,
  onboardingToken,
  email,
  name,
  onPhaseChange,
}: {
  intentType: IntentType;
  onboardingToken: string;
  email: string;
  name: string;
  onPhaseChange: (p: Phase) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const returnUrl = `${window.location.origin}/onboarding/${onboardingToken}`;

    const { error: stripeError } =
      intentType === "setup"
        ? await stripe.confirmSetup({
            elements,
            confirmParams: {
              return_url: returnUrl,
              payment_method_data: { billing_details: { email, name } },
            },
            redirect: "if_required",
          })
        : await stripe.confirmPayment({
            elements,
            confirmParams: {
              return_url: returnUrl,
              payment_method_data: { billing_details: { email, name } },
            },
            redirect: "if_required",
          });

    if (stripeError) {
      setError(stripeError.message || "Payment failed — please try again");
      setSubmitting(false);
      return;
    }

    onPhaseChange("redirecting");
    window.location.href = returnUrl;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="su-stripe-mount">
        <PaymentElement
          options={{
            layout: "tabs",
            defaultValues: {
              billingDetails: { email, name },
            },
          }}
          onReady={() => setReady(true)}
        />
      </div>
      {error && <ValidationHint message={error} />}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting || !ready}
        className="su-submit"
      >
        {submitting
          ? "Confirming…"
          : intentType === "setup"
          ? "Start free trial"
          : "Subscribe and continue"}
      </button>
    </form>
  );
}

const formStyles = `
  .su-form { display: flex; flex-direction: column; gap: 18px; }

  .su-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
  .su-optional { font-weight: 400; color: #4b5563; }

  .su-field input[type="email"],
  .su-field input[type="text"],
  .su-field input[type="tel"] {
    width: 100%;
    padding: 10px 12px;
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
    box-shadow: 0 0 0 3px rgba(239,68,68,0.08);
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
    transition: background 0.15s, opacity 0.15s;
    margin-top: 4px;
  }
  .su-submit:hover { background: #333; }
  .su-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .su-payment-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }
  .su-back-link {
    background: none;
    border: none;
    color: #4b5563;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 0;
  }
  .su-back-link:hover { color: #1a1a1a; }
  .su-payment-note {
    flex: 1;
    margin: 0;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.4;
  }

  .su-stripe-mount {
    padding: 4px 0 8px;
  }

  .su-redirecting {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 60px 0;
    color: #4b5563;
    font-size: 14px;
  }
  .su-spinner {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(0,0,0,0.10);
    border-top-color: #1a1a1a;
    border-radius: 50%;
    animation: su-spin 0.8s linear infinite;
  }
  @keyframes su-spin {
    to { transform: rotate(360deg); }
  }
`;
