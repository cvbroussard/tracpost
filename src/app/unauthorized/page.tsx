import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Content Powered by TracPost",
  robots: "noindex, nofollow",
};

export default function UnauthorizedPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      background: "#fafafa",
      padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12, color: "#1a1a1a" }}>
          This content is powered by TracPost
        </h1>
        <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.6, marginBottom: 32 }}>
          The blog you&apos;re trying to reach is published through TracPost&apos;s
          content platform. This domain isn&apos;t authorized to serve it.
        </p>
        <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 32 }}>
          If you&apos;re a business owner, TracPost turns your real work into
          blog articles, project portfolios, and social content — automatically.
        </p>
        <Link
          href="https://tracpost.com"
          style={{
            display: "inline-block",
            padding: "12px 32px",
            background: "#1a1a1a",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Learn more about TracPost
        </Link>
      </div>
    </div>
  );
}
