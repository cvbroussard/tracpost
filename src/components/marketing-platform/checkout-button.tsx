"use client";

import { useState } from "react";

export function CheckoutButton({
  productId,
  label,
  className,
  skipTrial,
}: {
  productId: string;
  label: string;
  className: string;
  skipTrial?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, skip_trial: skipTrial || false }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "Loading..." : label}
    </button>
  );
}
