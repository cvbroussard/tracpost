"use client";

import { useState, useEffect } from "react";

interface BillingData {
  status: string;
  plan: string;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    date: string;
    url: string | null;
  }>;
  availablePlans: Array<{
    id: string;
    name: string;
    price: string;
    tier: string;
    stripePriceId: string | null;
  }>;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  stripeMode?: "live" | "test";
  dashboardUrls?: {
    customer: string | null;
    subscription: string | null;
  };
}

export function BillingCard({ subscriptionId }: { subscriptionId: string }) {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/accounts/${subscriptionId}/billing`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setBilling(data))
      .finally(() => setLoading(false));
  }, [subscriptionId]);

  async function action(act: string, extra?: Record<string, unknown>) {
    setActing(act);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/accounts/${subscriptionId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act, ...extra }),
      });
      const data = await res.json();
      setResult(data.success ? `Done: ${act}` : (data.error || "Failed"));
      if (data.success) {
        const fresh = await fetch(`/api/admin/accounts/${subscriptionId}/billing`);
        if (fresh.ok) setBilling(await fresh.json());
      }
    } catch { setResult("Request failed"); }
    setActing(null);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="text-sm font-medium mb-2">Billing</h2>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="text-sm font-medium mb-2">Billing</h2>
        <p className="text-xs text-muted">No data.</p>
      </div>
    );
  }

  // Backdoor-onboarded subscribers (Carl Broussard, TracPost) have no Stripe
  // link. Show a simplified card with current plan + manual override picker.
  if (!billing.customerId) {
    const otherPlans = billing.availablePlans.filter(
      p => p.tier.toLowerCase() !== billing.plan.toLowerCase() && p.name.toLowerCase() !== billing.plan.toLowerCase()
    );
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Billing</h2>
          <span className="rounded bg-muted/10 px-2 py-0.5 text-[10px] font-medium text-muted">
            no stripe link
          </span>
        </div>
        <p className="text-[10px] text-muted">
          Backdoor-onboarded subscriber. Plan can be set manually — no Stripe charge or proration applies.
        </p>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] text-muted">Current plan</p>
            <p className="text-xs font-medium capitalize">{billing.plan}</p>
          </div>
          {otherPlans.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) action("set_plan_manual", { plan_id: e.target.value });
                e.target.value = "";
              }}
              disabled={acting !== null}
              className="rounded border border-border bg-background px-2 py-1 text-[10px]"
            >
              <option value="">Set plan manually...</option>
              {otherPlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.price}
                </option>
              ))}
            </select>
          )}
          {result && <span className="text-[10px] text-muted">{result}</span>}
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    trialing: "bg-accent/10 text-accent",
    past_due: "bg-danger/10 text-danger",
    canceled: "bg-muted/10 text-muted",
    incomplete: "bg-warning/10 text-warning",
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Billing</h2>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusColors[billing.status] || "bg-muted/10 text-muted"}`}>
          {billing.status}
        </span>
      </div>

      {/* Status details */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-muted">Plan</p>
          <p className="font-medium capitalize">{billing.plan}</p>
        </div>
        {billing.trialEnd && (
          <div>
            <p className="text-[10px] text-muted">Trial ends</p>
            <p className="font-medium">{new Date(billing.trialEnd).toLocaleDateString()}</p>
          </div>
        )}
        {billing.currentPeriodEnd && (
          <div>
            <p className="text-[10px] text-muted">Next billing</p>
            <p className="font-medium">{new Date(billing.currentPeriodEnd).toLocaleDateString()}</p>
          </div>
        )}
        {billing.cancelAtPeriodEnd && (
          <div>
            <p className="text-[10px] text-warning font-medium">Cancels at period end</p>
          </div>
        )}
      </div>

      {/* Payment method (read-only — managed Stripe-side) */}
      {billing.paymentMethod && (
        <div className="rounded-md border border-border bg-card/50 px-2.5 py-2 text-xs">
          <p className="text-[10px] text-muted mb-0.5">Payment method on file</p>
          <p className="font-medium">
            <span className="capitalize">{billing.paymentMethod.brand}</span>{" "}
            ····{" "}{billing.paymentMethod.last4}
            <span className="ml-2 text-[10px] text-muted font-normal">
              exp {String(billing.paymentMethod.expMonth).padStart(2, "0")}/{String(billing.paymentMethod.expYear).slice(-2)}
            </span>
          </p>
        </div>
      )}

      {/* Stripe Dashboard deep-links */}
      {billing.dashboardUrls && (billing.dashboardUrls.customer || billing.dashboardUrls.subscription) && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {billing.dashboardUrls.subscription && (
            <a
              href={billing.dashboardUrls.subscription}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-muted hover:text-foreground hover:border-accent/40 transition-colors"
            >
              <span>Stripe → Subscription</span>
              <span className="opacity-60">↗</span>
            </a>
          )}
          {billing.dashboardUrls.customer && (
            <a
              href={billing.dashboardUrls.customer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-muted hover:text-foreground hover:border-accent/40 transition-colors"
            >
              <span>Stripe → Customer</span>
              <span className="opacity-60">↗</span>
            </a>
          )}
          {billing.stripeMode === "test" && (
            <span className="inline-flex items-center rounded bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-[10px] font-medium text-amber-800 dark:text-amber-300">
              TEST MODE
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        {billing.status === "active" && !billing.cancelAtPeriodEnd && (
          <button
            onClick={() => action("cancel")}
            disabled={acting !== null}
            className="text-[10px] text-danger hover:underline disabled:opacity-50"
          >
            {acting === "cancel" ? "..." : "Cancel at period end"}
          </button>
        )}
        {billing.cancelAtPeriodEnd && (
          <button
            onClick={() => action("reactivate")}
            disabled={acting !== null}
            className="text-[10px] text-accent hover:underline disabled:opacity-50"
          >
            {acting === "reactivate" ? "..." : "Reactivate"}
          </button>
        )}

        {/* Plan change */}
        {billing.availablePlans.length > 1 && (
          <select
            onChange={(e) => { if (e.target.value) action("change_plan", { price_id: e.target.value }); e.target.value = ""; }}
            disabled={acting !== null}
            className="rounded border border-border bg-background px-2 py-1 text-[10px]"
          >
            <option value="">Change plan...</option>
            {billing.availablePlans
              .filter(p => p.stripePriceId && p.name.toLowerCase() !== billing.plan)
              .map(p => (
                <option key={p.id} value={p.stripePriceId!}>{p.name} — {p.price}</option>
              ))}
          </select>
        )}

        {result && <span className="text-[10px] text-muted">{result}</span>}
      </div>

      {/* Recent invoices */}
      {billing.invoices.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-[10px] text-muted mb-1.5">Recent invoices</p>
          <div className="space-y-1">
            {billing.invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between text-xs">
                <span className="text-muted">{new Date(inv.date).toLocaleDateString()}</span>
                <span className="font-medium">${(inv.amount / 100).toFixed(2)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] ${
                  inv.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  {inv.status}
                </span>
                {inv.url && (
                  <a href={inv.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted font-mono">
        {billing.customerId} · {billing.subscriptionId}
      </p>
    </div>
  );
}
